#!/usr/bin/env python3
"""
从 train-hwdb-classifier.py 保存的 hwdb-best.pt 导出 ONNX（无需重训）。
用于 ONNX 导出失败但已生成检查点的情况。

依赖: pip install torch onnx onnxruntime

用法:
    python scripts/export-hwdb-onnx-from-ckpt.py \\
        --ckpt ./client/public/models/hwdb-best.pt \\
        --output-dir ./client/public/models \\
        --quantize
"""
import argparse
import importlib.util
import json
import os
import sys

import torch

def _load_train_module():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(script_dir, "train-hwdb-classifier.py")
    spec = importlib.util.spec_from_file_location("train_hwdb_classifier", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ckpt", required=True, help="hwdb-best.pt 路径")
    parser.add_argument("--output-dir", default=None, help="输出目录（默认同 ckpt 所在目录）")
    parser.add_argument("--quantize", action="store_true")
    args = parser.parse_args()

    mod = _load_train_module()
    HwdbNet = mod.HwdbNet
    export_onnx = mod.export_onnx

    try:
        ckpt = torch.load(args.ckpt, map_location="cpu", weights_only=False)
    except TypeError:
        ckpt = torch.load(args.ckpt, map_location="cpu")
    num_classes = ckpt["num_classes"]
    classes = ckpt["classes"]
    state = ckpt["state_dict"]

    model = HwdbNet(num_classes)
    model.load_state_dict(state)

    out_dir = args.output_dir or os.path.dirname(os.path.abspath(args.ckpt))
    os.makedirs(out_dir, exist_ok=True)

    onnx_path = os.path.join(out_dir, "hwdb-classifier.onnx")
    export_onnx(model, num_classes, onnx_path, quantize=args.quantize)

    labels_path = os.path.join(out_dir, "hwdb-labels.json")
    with open(labels_path, "w", encoding="utf-8") as f:
        json.dump(classes, f, ensure_ascii=False)
    print(f"Saved: {onnx_path}, {labels_path}")


if __name__ == "__main__":
    main()
