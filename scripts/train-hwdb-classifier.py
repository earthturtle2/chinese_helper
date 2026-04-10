#!/usr/bin/env python3
"""
Train a lightweight CNN on CASIA-HWDB1.1 for handwritten Chinese character classification,
then export to ONNX for browser-side inference (onnxruntime-web WASM).

Requirements:
    pip install torch torchvision onnx onnxruntime numpy Pillow

Dataset — download from https://nlpr.ia.ac.cn/databases/handwriting/Download.html:
    HWDB1.1trn_gnt.zip  (training, ~1.8 GB)
    HWDB1.1tst_gnt.zip  (test,    ~470 MB)
  Unzip, then extract .gnt files into two directories.

Usage:
    python scripts/train-hwdb-classifier.py \
        --train-dir  ./data/HWDB1.1trn_gnt \
        --test-dir   ./data/HWDB1.1tst_gnt \
        --output-dir ./client/public/models \
        --epochs 15 --quantize

2GB 内存服务器：全量载入会 OOM，请加 --max-train-samples / --max-test-samples，
并减小 --batch-size（如 16），后台示例见项目 README 或 DESIGN.md。
"""

import argparse, json, math, os, struct, sys, time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
from PIL import Image

# ─── GNT parser ────────────────────────────────────────────────────────────────

def iter_gnt(filepath):
    """Yield (char, np.uint8 2-D array) from one CASIA-HWDB GNT file."""
    with open(filepath, "rb") as f:
        while True:
            head = f.read(4)
            if len(head) < 4:
                break
            sample_size = struct.unpack("<I", head)[0]
            tag_code = f.read(2)
            try:
                char = tag_code.decode("gb2312")
            except Exception:
                char = tag_code.decode("gb18030", errors="replace")
            w = struct.unpack("<H", f.read(2))[0]
            h = struct.unpack("<H", f.read(2))[0]
            bitmap = np.frombuffer(f.read(w * h), dtype=np.uint8).reshape(h, w)
            yield char, bitmap


def load_gnt_dir(directory, max_samples=None):
    """Read every *.gnt in *directory*, return (images, labels).

    If max_samples is set, stop after that many images (顺序靠前，非均匀抽样；
    小内存机器请用此参数，全量约需 8GB+ RAM）。
    """
    images, labels = [], []
    gnt_files = sorted(Path(directory).glob("*.gnt"))
    if not gnt_files:
        gnt_files = sorted(Path(directory).glob("*.GNT"))
    print(f"  Found {len(gnt_files)} GNT files in {directory}")
    if max_samples:
        print(f"  (limit: at most {max_samples} samples)")
    for i, gf in enumerate(gnt_files, 1):
        for char, bmp in iter_gnt(gf):
            images.append(bmp)
            labels.append(char)
            if max_samples and len(images) >= max_samples:
                print(f"    Stopped at {len(images)} samples (max_samples reached)")
                return images, labels
        if i % 20 == 0 or i == len(gnt_files):
            print(f"    [{i}/{len(gnt_files)}] loaded {len(images)} samples so far")
    return images, labels

# ─── Preprocessing ──────────────────────────────────────────────────────────────

IMG_SIZE = 64

def resize_center(img_np, target=IMG_SIZE):
    """Resize keeping aspect ratio, center on white background, return target×target uint8."""
    pil = Image.fromarray(img_np, mode="L")
    h, w = img_np.shape
    scale = (target - 4) / max(h, w)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    pil = pil.resize((new_w, new_h), Image.BILINEAR)
    out = Image.new("L", (target, target), 255)
    x0 = (target - new_w) // 2
    y0 = (target - new_h) // 2
    out.paste(pil, (x0, y0))
    return np.array(out, dtype=np.uint8)


def normalize_tensor(img_np):
    """uint8 64×64 → float32 tensor [1, 64, 64] in [-1, 1]."""
    t = torch.from_numpy(img_np).float().unsqueeze(0)  # [1,H,W]
    t = t / 255.0
    t = (t - 0.5) / 0.5
    return t

# ─── Dataset ────────────────────────────────────────────────────────────────────

class HwdbDataset(Dataset):
    def __init__(self, images, labels, char2idx, augment=False):
        self.images = images
        self.labels = labels
        self.char2idx = char2idx
        self.augment = augment

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        img = resize_center(self.images[idx], IMG_SIZE)
        if self.augment:
            img = self._augment(img)
        tensor = normalize_tensor(img)
        label = self.char2idx[self.labels[idx]]
        return tensor, label

    def _augment(self, img):
        pil = Image.fromarray(img, mode="L")
        angle = np.random.uniform(-10, 10)
        pil = pil.rotate(angle, fillcolor=255)
        dx = np.random.randint(-3, 4)
        dy = np.random.randint(-3, 4)
        pil = pil.transform(pil.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), fillcolor=255)
        return np.array(pil, dtype=np.uint8)

# ─── Model ──────────────────────────────────────────────────────────────────────

class HwdbNet(nn.Module):
    """Lightweight CNN for 64×64 grayscale single-character classification."""
    def __init__(self, num_classes):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(True),
            nn.Conv2d(64, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(True),
            nn.MaxPool2d(2),

            nn.Conv2d(64, 128, 3, padding=1), nn.BatchNorm2d(128), nn.ReLU(True),
            nn.Conv2d(128, 128, 3, padding=1), nn.BatchNorm2d(128), nn.ReLU(True),
            nn.MaxPool2d(2),

            nn.Conv2d(128, 256, 3, padding=1), nn.BatchNorm2d(256), nn.ReLU(True),
            nn.Conv2d(256, 256, 3, padding=1), nn.BatchNorm2d(256), nn.ReLU(True),
            nn.MaxPool2d(2),

            nn.AdaptiveAvgPool2d(1),
        )
        self.classifier = nn.Sequential(
            nn.Dropout(0.5),
            nn.Linear(256, num_classes),
        )

    def forward(self, x):
        x = self.features(x)
        x = x.view(x.size(0), -1)
        x = self.classifier(x)
        return x

# ─── Training ───────────────────────────────────────────────────────────────────

def train_one_epoch(model, loader, criterion, optimizer, device, epoch):
    model.train()
    total_loss = 0
    correct = 0
    count = 0
    t0 = time.time()
    for i, (imgs, targets) in enumerate(loader, 1):
        imgs, targets = imgs.to(device), targets.to(device)
        optimizer.zero_grad()
        logits = model(imgs)
        loss = criterion(logits, targets)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * imgs.size(0)
        correct += (logits.argmax(1) == targets).sum().item()
        count += imgs.size(0)
        if i % 200 == 0:
            elapsed = time.time() - t0
            print(f"  Epoch {epoch} [{count}/{len(loader.dataset)}] "
                  f"loss={total_loss/count:.4f} acc={correct/count:.4f} "
                  f"({elapsed:.1f}s)")
    return total_loss / count, correct / count


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    correct = 0
    total = 0
    for imgs, targets in loader:
        imgs, targets = imgs.to(device), targets.to(device)
        logits = model(imgs)
        correct += (logits.argmax(1) == targets).sum().item()
        total += imgs.size(0)
    return correct / total if total > 0 else 0

# ─── ONNX export ────────────────────────────────────────────────────────────────

def export_onnx(model, num_classes, output_path, quantize=False):
    model.eval()
    model.cpu()
    dummy = torch.randn(1, 1, IMG_SIZE, IMG_SIZE)
    onnx_path = output_path
    torch.onnx.export(
        model, dummy, onnx_path,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
        opset_version=13,
    )
    size_mb = os.path.getsize(onnx_path) / 1024 / 1024
    print(f"Exported ONNX: {onnx_path} ({size_mb:.2f} MB)")

    if quantize:
        try:
            from onnxruntime.quantization import quantize_dynamic, QuantType
            q_path = onnx_path.replace(".onnx", "-quantized.onnx")
            quantize_dynamic(onnx_path, q_path, weight_type=QuantType.QUInt8)
            q_size = os.path.getsize(q_path) / 1024 / 1024
            print(f"Quantized ONNX: {q_path} ({q_size:.2f} MB)")
            os.replace(q_path, onnx_path)
            print(f"Replaced {onnx_path} with quantized version.")
        except ImportError:
            print("onnxruntime.quantization not available, skipping quantization.")

# ─── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train HWDB handwriting classifier")
    parser.add_argument("--train-dir", required=True, help="Dir with training .gnt files")
    parser.add_argument("--test-dir", required=True, help="Dir with test .gnt files")
    parser.add_argument("--output-dir", default="./client/public/models", help="Where to write .onnx and labels")
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--quantize", action="store_true", help="Quantize ONNX model (uint8)")
    parser.add_argument("--device", default="auto", help="cpu / cuda / auto")
    parser.add_argument(
        "--num-workers",
        type=int,
        default=0,
        help="DataLoader workers (2 核小机建议 0；多核可设 2–4)",
    )
    parser.add_argument(
        "--pin-memory",
        action="store_true",
        help="DataLoader pin_memory (仅 CUDA 有意义，CPU 训练勿开)",
    )
    parser.add_argument(
        "--max-train-samples",
        type=int,
        default=None,
        help="最多载入训练样本数（省内存；不设则全量，约需 8GB+ RAM）",
    )
    parser.add_argument(
        "--max-test-samples",
        type=int,
        default=None,
        help="最多载入测试样本数（默认同上逻辑；可与训练上限配合）",
    )
    args = parser.parse_args()

    if args.device == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(args.device)
    print(f"Device: {device}")

    print("Loading training data...")
    trn_images, trn_labels = load_gnt_dir(args.train_dir, max_samples=args.max_train_samples)
    print(f"  Training: {len(trn_images)} samples")

    print("Loading test data...")
    tst_images, tst_labels = load_gnt_dir(args.test_dir, max_samples=args.max_test_samples)
    print(f"  Test: {len(tst_images)} samples")

    all_chars = sorted(set(trn_labels))
    print(f"  Classes: {len(all_chars)}")
    char2idx = {c: i for i, c in enumerate(all_chars)}

    trn_ds = HwdbDataset(trn_images, trn_labels, char2idx, augment=True)
    # 训练子集时，测试集中可能出现未见过的字，需过滤以免 KeyError
    tst_f_images, tst_f_labels = [], []
    for img, lab in zip(tst_images, tst_labels):
        if lab in char2idx:
            tst_f_images.append(img)
            tst_f_labels.append(lab)
    if len(tst_f_labels) < len(tst_labels):
        print(f"  Test: {len(tst_labels) - len(tst_f_labels)} samples skipped (char not in train set)")
    if not tst_f_labels:
        print("ERROR: no test samples left after filtering; increase --max-train-samples or use full train set.")
        sys.exit(1)
    tst_ds = HwdbDataset(tst_f_images, tst_f_labels, char2idx, augment=False)
    dl_common = dict(
        batch_size=args.batch_size,
        num_workers=args.num_workers,
        pin_memory=args.pin_memory,
    )
    if args.num_workers > 0:
        dl_common["persistent_workers"] = True
    trn_loader = DataLoader(trn_ds, shuffle=True, **dl_common)
    tst_loader = DataLoader(tst_ds, shuffle=False, **dl_common)

    num_classes = len(all_chars)
    model = HwdbNet(num_classes).to(device)
    total_params = sum(p.numel() for p in model.parameters())
    print(f"Model params: {total_params:,} ({total_params*4/1024/1024:.1f} MB fp32)")

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=5, gamma=0.5)

    best_acc = 0
    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        train_loss, train_acc = train_one_epoch(model, trn_loader, criterion, optimizer, device, epoch)
        test_acc = evaluate(model, tst_loader, device)
        scheduler.step()
        elapsed = time.time() - t0
        print(f"Epoch {epoch}/{args.epochs}  "
              f"train_loss={train_loss:.4f}  train_acc={train_acc:.4f}  "
              f"test_acc={test_acc:.4f}  lr={scheduler.get_last_lr()[0]:.6f}  "
              f"({elapsed:.1f}s)")
        if test_acc > best_acc:
            best_acc = test_acc
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            print(f"  -> New best: {best_acc:.4f}")

    print(f"\nBest test accuracy: {best_acc:.4f}")
    model.load_state_dict(best_state)

    os.makedirs(args.output_dir, exist_ok=True)
    onnx_path = os.path.join(args.output_dir, "hwdb-classifier.onnx")
    export_onnx(model, num_classes, onnx_path, quantize=args.quantize)

    labels_path = os.path.join(args.output_dir, "hwdb-labels.json")
    with open(labels_path, "w", encoding="utf-8") as f:
        json.dump(all_chars, f, ensure_ascii=False)
    print(f"Saved labels: {labels_path} ({len(all_chars)} chars)")
    print("Done.")


if __name__ == "__main__":
    main()
