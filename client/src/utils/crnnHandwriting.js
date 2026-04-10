/**
 * 浏览器端 CRNN 手写汉字识别（ONNX Runtime Web WASM，按需动态加载）。
 * 模型与字典来自 chineseocr_lite（crnn_lite_lstm.onnx + alphabet），预处理对齐 CRNN.py predict_rbg。
 *
 * 改进：对田字格笔迹做裁剪→膨胀→多格拼条，再送入行级 CRNN。
 */
const ORT_VERSION = '1.24.3';

let alphabetChars = null;
let alphabetPromise = null;
let ortPromise = null;
let sessionPromise = null;

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

export async function loadAlphabetChars() {
  if (alphabetChars) return alphabetChars;
  if (!alphabetPromise) {
    alphabetPromise = fetch(`${baseUrl()}models/alphabet-chinese.txt`)
      .then((r) => {
        if (!r.ok) throw new Error('无法加载字典 alphabet-chinese.txt');
        return r.text();
      })
      .then((t) => {
        alphabetChars = Array.from(t.trim());
        return alphabetChars;
      });
  }
  return alphabetPromise;
}

export async function getCrnnSession() {
  const ort = await getOrt();
  if (!sessionPromise) {
    const url = `${baseUrl()}models/crnn_lite_lstm.onnx`;
    sessionPromise = ort.InferenceSession.create(url, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  }
  return sessionPromise;
}

/** CTC 贪心解码（对齐 crnn/util.py strLabelConverter.decode raw=False） */
export function decodeCtc(indices, chars) {
  const T = indices.length;
  const out = [];
  for (let i = 0; i < T; i++) {
    const v = indices[i];
    if (v !== 0 && !(i > 0 && indices[i - 1] === v)) {
      const ch = chars[v - 1];
      if (ch) out.push(ch);
    }
  }
  return out.join('');
}

// --------------- Canvas 工具 ---------------

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

/** 计算非白像素的包围盒，无墨迹则返回 null */
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

/** 裁剪画布到指定区域并加 padding（白底） */
function cropCanvas(canvas, bbox, padding) {
  const x = Math.max(0, bbox.x - padding);
  const y = Math.max(0, bbox.y - padding);
  const r = Math.min(canvas.width, bbox.x + bbox.w + padding);
  const b = Math.min(canvas.height, bbox.y + bbox.h + padding);
  const w = r - x;
  const h = b - y;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return c;
}

/**
 * 形态学膨胀：白底上的深色笔画向外扩展 radius 像素。
 * 用 darken 混合模式在多个偏移位置叠画，等效于圆形结构元素膨胀。
 */
function dilateStrokes(srcCanvas, radius) {
  const c = document.createElement('canvas');
  c.width = srcCanvas.width;
  c.height = srcCanvas.height;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'darken';
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= r2 + 1) {
        ctx.drawImage(srcCanvas, dx, dy);
      }
    }
  }
  return c;
}

/** 多个字符画布水平拼接为文字条（白底），高度归一后拼接 */
function combineToStrip(canvases) {
  const maxH = Math.max(...canvases.map((c) => c.height));
  const items = canvases.map((c) => {
    const scale = maxH / c.height;
    return { canvas: c, w: Math.round(c.width * scale), h: maxH };
  });
  const gap = Math.round(maxH * 0.08);
  const totalW = items.reduce((s, it) => s + it.w, 0) + gap * Math.max(0, items.length - 1);
  const strip = document.createElement('canvas');
  strip.width = totalW;
  strip.height = maxH;
  const ctx = strip.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, maxH);
  let x = 0;
  for (const it of items) {
    ctx.drawImage(it.canvas, 0, 0, it.canvas.width, it.canvas.height, x, 0, it.w, it.h);
    x += it.w + gap;
  }
  return strip;
}

// --------------- 预处理与推理 ---------------

function preprocessRgbCanvasToTensor(ort, rgbCanvas) {
  const srcW = rgbCanvas.width;
  const srcH = rgbCanvas.height;
  if (srcW < 1 || srcH < 1) return null;

  const targetH = 32;
  const scale = srcH / targetH;
  const targetW = Math.max(1, Math.round(srcW / scale));

  const scaled = document.createElement('canvas');
  scaled.width = targetW;
  scaled.height = targetH;
  const sctx = scaled.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(rgbCanvas, 0, 0, srcW, srcH, 0, 0, targetW, targetH);

  const img = sctx.getImageData(0, 0, targetW, targetH);
  const px = img.data;
  const h = targetH;
  const w = targetW;
  const hw = h * w;
  const data = new Float32Array(3 * hw);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + c;
        data[c * hw + y * w + x] = (px[idx] - 127.5) / 127.5;
      }
    }
  }
  return new ort.Tensor('float32', data, [1, 3, h, w]);
}

function argmaxRows(raw, T, C) {
  const indices = new Int32Array(T);
  for (let t = 0; t < T; t++) {
    let best = -Infinity;
    let bi = 0;
    const off = t * C;
    for (let c = 0; c < C; c++) {
      const v = raw[off + c];
      if (v > best) {
        best = v;
        bi = c;
      }
    }
    indices[t] = bi;
  }
  return indices;
}

function parseOutputDims(d) {
  let T, C;
  if (d.length === 3) {
    const [a, b, c] = d;
    if (b === 1 && a > 1) {
      T = a; C = c;
    } else if (a === 1) {
      T = b; C = c;
    } else {
      T = b; C = c;
    }
  } else if (d.length === 2) {
    T = d[0]; C = d[1];
  } else {
    throw new Error(`未知 CRNN 输出维度: ${JSON.stringify(d)}`);
  }
  return { T, C };
}

// --------------- 公开 API ---------------

/**
 * 识别多个田字格笔迹画布（整词一次送入 CRNN）。
 * 流程：白底合成 → 包围盒裁剪 → 笔画膨胀 → 多格拼条 → 缩放至 32×W → CRNN → CTC 解码。
 */
export async function recognizeMultiCellInk(inkCanvases) {
  await loadAlphabetChars();
  const ort = await getOrt();
  const session = await getCrnnSession();

  const DILATE_RADIUS = 3;
  const CROP_PADDING = 8;

  const parts = [];
  for (const ink of inkCanvases) {
    if (!ink) continue;
    const rgb = compositeWhiteBackground(ink);
    const bbox = getInkBoundingBox(rgb);
    if (!bbox) continue;
    const cropped = cropCanvas(rgb, bbox, CROP_PADDING);
    const dilated = dilateStrokes(cropped, DILATE_RADIUS);
    parts.push(dilated);
  }

  if (parts.length === 0) return '';

  const inputCanvas = parts.length === 1 ? parts[0] : combineToStrip(parts);
  const inputTensor = preprocessRgbCanvasToTensor(ort, inputCanvas);
  if (!inputTensor) return '';

  const feeds = { input: inputTensor };
  const results = await session.run(feeds);
  const out = results.out;
  if (!out) {
    throw new Error(`CRNN 输出名非 out，实际: ${Object.keys(results).join(',')}`);
  }

  const { T, C } = parseOutputDims(out.dims);
  const indices = argmaxRows(out.data, T, C);
  return decodeCtc(indices, alphabetChars);
}

/** 向后兼容：单格识别 */
export async function recognizeInkCanvas(inkCanvas) {
  return recognizeMultiCellInk([inkCanvas]);
}
