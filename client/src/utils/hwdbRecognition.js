/**
 * 浏览器端 HWDB 单字分类识别（ONNX Runtime Web WASM）。
 * 模型：HwdbNet（轻量 CNN，CASIA-HWDB1.1 训练，64×64 灰度输入，3755 汉字分类）。
 * 与 crnnHandwriting.js 不同：每个田字格独立分类，无需拼条。
 */
const ORT_VERSION = '1.24.3';

const IMG_SIZE = 64;

let labels = null;
let labelsPromise = null;
let ortPromise = null;
let sessionPromise = null;
let modelAvailable = null; // null = unknown, true/false after first probe

function baseUrl() {
  const b = import.meta.env.BASE_URL || '/';
  return b.endsWith('/') ? b : `${b}/`;
}

async function getOrt() {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-web').then((ort) => {
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
      ort.env.wasm.numThreads = 1;
      return ort;
    });
  }
  return ortPromise;
}

async function loadLabels() {
  if (labels) return labels;
  if (!labelsPromise) {
    labelsPromise = fetch(`${baseUrl()}models/hwdb-labels.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`hwdb-labels.json: ${r.status}`);
        return r.json();
      })
      .then((arr) => {
        labels = arr;
        return arr;
      });
  }
  return labelsPromise;
}

async function getSession() {
  const ort = await getOrt();
  if (!sessionPromise) {
    const url = `${baseUrl()}models/hwdb-classifier.onnx`;
    sessionPromise = ort.InferenceSession.create(url, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  }
  return sessionPromise;
}

/** 检测模型文件是否存在（只探测一次） */
export async function isHwdbModelAvailable() {
  if (modelAvailable !== null) return modelAvailable;
  try {
    const r = await fetch(`${baseUrl()}models/hwdb-classifier.onnx`, { method: 'HEAD' });
    const labR = await fetch(`${baseUrl()}models/hwdb-labels.json`, { method: 'HEAD' });
    modelAvailable = r.ok && labR.ok;
  } catch {
    modelAvailable = false;
  }
  return modelAvailable;
}

// ─── Canvas 工具 ───────────────────────────────────────────────────────────────

function compositeWhiteBackground(inkCanvas) {
  const c = document.createElement('canvas');
  c.width = inkCanvas.width;
  c.height = inkCanvas.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(inkCanvas, 0, 0);
  return c;
}

function getInkBoundingBox(rgbCanvas) {
  const ctx = rgbCanvas.getContext('2d');
  const { data, width, height } = ctx.getImageData(0, 0, rgbCanvas.width, rgbCanvas.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  const threshold = 250;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] < threshold || data[i + 1] < threshold || data[i + 2] < threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// ─── 预处理 ─────────────────────────────────────────────────────────────────────

/**
 * 将田字格笔迹裁剪→等比缩放→居中填入 64×64 灰度画布，
 * 归一化到 [-1, 1]，返回 [1, 1, 64, 64] Float32 tensor。
 */
function preprocessInkCanvas(ort, inkCanvas) {
  const rgb = compositeWhiteBackground(inkCanvas);
  const bbox = getInkBoundingBox(rgb);
  if (!bbox) return null;

  const padding = 8;
  const sx = Math.max(0, bbox.x - padding);
  const sy = Math.max(0, bbox.y - padding);
  const sr = Math.min(rgb.width, bbox.x + bbox.w + padding);
  const sb = Math.min(rgb.height, bbox.y + bbox.h + padding);
  const cw = sr - sx;
  const ch = sb - sy;

  const out = document.createElement('canvas');
  out.width = IMG_SIZE;
  out.height = IMG_SIZE;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE);

  const scale = (IMG_SIZE - 4) / Math.max(cw, ch);
  const dw = Math.round(cw * scale);
  const dh = Math.round(ch * scale);
  const dx = Math.round((IMG_SIZE - dw) / 2);
  const dy = Math.round((IMG_SIZE - dh) / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(rgb, sx, sy, cw, ch, dx, dy, dw, dh);

  const imgData = ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE);
  const px = imgData.data;
  const hw = IMG_SIZE * IMG_SIZE;
  const data = new Float32Array(hw);
  for (let i = 0; i < hw; i++) {
    const gray = px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
    data[i] = (gray / 255.0 - 0.5) / 0.5;
  }
  return new ort.Tensor('float32', data, [1, 1, IMG_SIZE, IMG_SIZE]);
}

// ─── 推理 ───────────────────────────────────────────────────────────────────────

/**
 * 对单个田字格笔迹画布做推理，返回识别出的汉字（Top-1）。
 * 无墨迹时返回空字符串。
 */
export async function recognizeSingleChar(inkCanvas) {
  await loadLabels();
  const ort = await getOrt();
  const session = await getSession();

  const inputTensor = preprocessInkCanvas(ort, inkCanvas);
  if (!inputTensor) return '';

  const results = await session.run({ input: inputTensor });
  const out = results.output;
  if (!out) {
    throw new Error(`HWDB 模型输出名非 output，实际: ${Object.keys(results).join(',')}`);
  }

  const logits = out.data;
  let maxVal = -Infinity;
  let maxIdx = 0;
  for (let i = 0; i < logits.length; i++) {
    if (logits[i] > maxVal) {
      maxVal = logits[i];
      maxIdx = i;
    }
  }
  return labels[maxIdx] || '';
}

/**
 * 对多个田字格笔迹画布逐个识别，返回拼接后的字符串。
 */
export async function recognizeMultiCellInk(inkCanvases) {
  const parts = [];
  for (const ink of inkCanvases) {
    if (!ink) { parts.push(''); continue; }
    const ch = await recognizeSingleChar(ink);
    parts.push(ch);
  }
  return parts.join('');
}
