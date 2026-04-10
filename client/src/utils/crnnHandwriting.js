/**
 * 浏览器端 CRNN 手写汉字识别（ONNX Runtime Web WASM，按需动态加载）。
 * 模型与字典来自 chineseocr_lite（crnn_lite_lstm.onnx + alphabet），预处理对齐 CRNN.py predict_rbg。
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

/**
 * 与推理前一致：白底合成后再检测是否有非白像素。
 * 直接在透明笔迹层上检测会误伤：反锯齿边缘 a 很小被跳过、或透明区 r=g=b=0 被误判。
 */
function compositeCanvasHasInk(inkCanvas) {
  const c = compositeWhiteBackground(inkCanvas);
  const ctx = c.getContext('2d');
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const white = 252;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < white || g < white || b < white) return true;
  }
  return false;
}

function preprocessRgbCanvasToTensor(ort, rgbCanvas) {
  const srcW = rgbCanvas.width;
  const srcH = rgbCanvas.height;
  if (srcW < 1 || srcH < 1) return null;

  const targetH = 32;
  const scale = srcH / targetH;
  const targetW = Math.max(1, Math.floor(srcW / scale));

  const scaled = document.createElement('canvas');
  scaled.width = targetW;
  scaled.height = targetH;
  const sctx = scaled.getContext('2d');
  sctx.imageSmoothingEnabled = true;
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
        const i = (y * w + x) * 4 + c;
        const v = (px[i] - 127.5) / 127.5;
        data[c * hw + y * w + x] = v;
      }
    }
  }
  return new ort.Tensor('float32', data, [1, 3, h, w]);
}

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

export async function recognizeInkCanvas(inkCanvas) {
  await loadAlphabetChars();
  const ort = await getOrt();
  const session = await getCrnnSession();

  if (!compositeCanvasHasInk(inkCanvas)) {
    return '';
  }

  const rgb = compositeWhiteBackground(inkCanvas);
  const inputTensor = preprocessRgbCanvasToTensor(ort, rgb);
  if (!inputTensor) return '';

  const feeds = { input: inputTensor };
  const results = await session.run(feeds);
  const out = results.out;
  if (!out) {
    const names = Object.keys(results);
    throw new Error(`CRNN 输出名非 out，实际: ${names.join(',')}`);
  }

  const d = out.dims;
  const raw = out.data;
  let T;
  let C;
  if (d.length === 3) {
    T = d[1];
    C = d[2];
  } else if (d.length === 2) {
    T = d[0];
    C = d[1];
  } else {
    throw new Error(`未知 CRNN 输出维度: ${JSON.stringify(d)}`);
  }

  const indices = argmaxRows(raw, T, C);
  return decodeCtc(indices, alphabetChars);
}
