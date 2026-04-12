/**
 * 浏览器端 Kokoro 中文 ONNX（onnx-community/Kokoro-82M-v1.1-zh-ONNX）。
 * G2P 使用 phonemizer（eSpeak NG）的普通话模式；与 Python misaki[zh] 不完全一致，音质可能略差。
 *
 * 友好名（如 zm_yunjian）在 Python 仓库与 sherpa 说话人表一致；zh-ONNX 仓库多为 zf_、zm_ 加数字的 .bin。
 * zm_yunjian 映射到 speaker 49 对应的 zf_049.bin（sherpa 文档：49 对应 zm_yunjian）。
 */
import { phonemize } from 'phonemizer';

let transformersMod = null;
async function loadTransformers() {
  if (!transformersMod) {
    transformersMod = await import('@huggingface/transformers');
  }
  return transformersMod;
}

/** 友好音色 ID -> 当前 zh-ONNX 仓库内实际文件名（不含 .bin） */
const KOKORO_ZH_VOICE_FILE_ALIASES = {
  zm_yunjian: 'zf_049',
};

export function resolveKokoroZhVoiceFile(voice) {
  const v = String(voice || '').trim();
  if (!v) return v;
  return KOKORO_ZH_VOICE_FILE_ALIASES[v] || v;
}

const modelEntryCache = new Map();
const voiceDataCache = new Map();

let onnxEnvConfigured = false;

function hasWebGpu() {
  return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
}

/** 首次加载前配置 ONNX WASM / WebGPU，减轻主线程压力并尽量用 SIMD 路径 */
function configureKokoroOnnxEnv(env) {
  if (onnxEnvConfigured || !env?.backends?.onnx) return;
  onnxEnvConfigured = true;
  const onnx = env.backends.onnx;
  try {
    if (onnx.wasm) {
      const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
      if ('numThreads' in onnx.wasm && onnx.wasm.numThreads == null) {
        onnx.wasm.numThreads = Math.min(4, Math.max(1, cores));
      }
    }
  } catch {
    /* ignore */
  }
}

const modelLoadAttempts = () => {
  const wasm = { dtype: 'q8', device: 'wasm' };
  const webgpuQ8 = { dtype: 'q8', device: 'webgpu' };
  const webgpuFp32 = { dtype: 'fp32', device: 'webgpu' };
  if (hasWebGpu()) return [webgpuQ8, wasm, webgpuFp32, { dtype: 'fp32', device: 'wasm' }];
  return [wasm, { dtype: 'fp32', device: 'wasm' }];
};

let synthGeneration = 0;

export function abortKokoroSynthesis() {
  synthGeneration += 1;
}

function assertNotAborted(gen) {
  if (gen !== synthGeneration) {
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  }
}

/** 按句/长度切分，控制 tokenizer 长度并减轻首包内存压力 */
export function splitTextForKokoro(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const maxLen = 60;
  const units = t
    .split(/(?<=[。！？；!?])\s*|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const u of units) {
    if (u.length <= maxLen) {
      out.push(u);
      continue;
    }
    for (let i = 0; i < u.length; i += maxLen) out.push(u.slice(i, i + maxLen));
  }
  return out;
}

async function getVoiceStyleArray(modelId, voiceFile) {
  const key = `${modelId}::${voiceFile}`;
  if (voiceDataCache.has(key)) return voiceDataCache.get(key);
  const url = `https://huggingface.co/${modelId}/resolve/main/voices/${encodeURIComponent(voiceFile)}.bin`;
  let buffer;
  try {
    const cache = await caches.open('kokoro-zh-voices');
    const hit = await cache.match(url);
    if (hit) buffer = await hit.arrayBuffer();
  } catch {
    /* ignore Cache API errors */
  }
  if (!buffer) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`无法加载 Kokoro 音色：${voiceFile}`);
    buffer = await res.arrayBuffer();
    try {
      const cache = await caches.open('kokoro-zh-voices');
      await cache.put(url, new Response(buffer));
    } catch {
      /* ignore */
    }
  }
  const arr = new Float32Array(buffer);
  voiceDataCache.set(key, arr);
  return arr;
}

async function loadModelAndTokenizer(modelId, progress_callback) {
  if (modelEntryCache.has(modelId)) return modelEntryCache.get(modelId);
  const { StyleTextToSpeech2Model, AutoTokenizer, env } = await loadTransformers();
  configureKokoroOnnxEnv(env);

  const tokenizer = await AutoTokenizer.from_pretrained(modelId, { progress_callback });

  let model = null;
  let loadError = null;
  for (const extra of modelLoadAttempts()) {
    try {
      model = await StyleTextToSpeech2Model.from_pretrained(modelId, {
        ...extra,
        progress_callback,
      });
      loadError = null;
      break;
    } catch (e) {
      loadError = e;
    }
  }
  if (!model) {
    throw loadError || new Error('Kokoro 模型加载失败');
  }

  const entry = { model, tokenizer };
  modelEntryCache.set(modelId, entry);
  return entry;
}

/**
 * 普通话音素串：phonemizer 使用 eSpeak-ng，语言码选 cmn（Mandarin Chinese）。
 */
async function textToPhonemeString(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const phones = await phonemize(t, 'cmn');
  const joined = Array.isArray(phones) ? phones.join(' ') : String(phones);
  return joined.trim();
}

/**
 * 合成单段文本为 RawAudio（24kHz），需已解锁 AudioContext 的页面环境。
 */
export async function synthesizeKokoroZh(text, { modelId, voice = 'zm_yunjian', speed = 1, progress_callback } = {}) {
  const gen = synthGeneration;
  const mid = modelId || 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
  const voiceFile = resolveKokoroZhVoiceFile(voice);
  const { model, tokenizer } = await loadModelAndTokenizer(mid, progress_callback);
  assertNotAborted(gen);

  const phonemes = await textToPhonemeString(text);
  assertNotAborted(gen);
  if (!phonemes) throw new Error('音素为空');

  const mod = await loadTransformers();
  const { Tensor, RawAudio } = mod;
  const tokenized = tokenizer(phonemes, { truncation: true });
  const input_ids = tokenized.input_ids;
  const dims = input_ids.dims;
  const lastDim = dims && dims.length ? dims[dims.length - 1] : 0;
  const offset = 256 * Math.min(Math.max(lastDim - 2, 0), 509);

  const voiceData = await getVoiceStyleArray(mid, voiceFile);
  assertNotAborted(gen);
  if (offset + 256 > voiceData.length) {
    throw new Error('音色数据与输入长度不匹配');
  }
  const styleSlice = voiceData.slice(offset, offset + 256);
  const style = new Tensor('float32', styleSlice, [1, 256]);
  const speedTensor = new Tensor('float32', [speed], [1]);

  const { waveform } = await model({
    input_ids,
    style,
    speed: speedTensor,
  });
  assertNotAborted(gen);
  return new RawAudio(waveform.data, 24000);
}
