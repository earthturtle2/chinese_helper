/**
 * 浏览器端 Kokoro 中文 ONNX（onnx-community/Kokoro-82M-v1.1-zh-ONNX）。
 * G2P 使用 phonemizer（eSpeak NG）的普通话模式；与 Python misaki[zh] 不完全一致，音质可能略差。
 */
import { phonemize } from 'phonemizer';

let transformersMod = null;
async function loadTransformers() {
  if (!transformersMod) {
    transformersMod = await import('@huggingface/transformers');
  }
  return transformersMod;
}

const modelEntryCache = new Map();
const voiceDataCache = new Map();

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

async function getVoiceStyleArray(modelId, voice) {
  const key = `${modelId}::${voice}`;
  if (voiceDataCache.has(key)) return voiceDataCache.get(key);
  const url = `https://huggingface.co/${modelId}/resolve/main/voices/${encodeURIComponent(voice)}.bin`;
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
    if (!res.ok) throw new Error(`无法加载 Kokoro 音色：${voice}`);
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
  const { StyleTextToSpeech2Model, AutoTokenizer } = await loadTransformers();
  const opts = { dtype: 'fp32', progress_callback };
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(modelId, opts),
    AutoTokenizer.from_pretrained(modelId, { progress_callback }),
  ]);
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
export async function synthesizeKokoroZh(text, { modelId, voice = 'zf_001', speed = 1, progress_callback } = {}) {
  const gen = synthGeneration;
  const mid = modelId || 'onnx-community/Kokoro-82M-v1.1-zh-ONNX';
  const { model, tokenizer } = await loadModelAndTokenizer(mid, progress_callback);
  assertNotAborted(gen);

  const phonemes = await textToPhonemeString(text);
  assertNotAborted(gen);
  if (!phonemes) throw new Error('音素为空');

  const { Tensor, RawAudio } = await loadTransformers();
  const tokenized = tokenizer(phonemes, { truncation: true });
  const input_ids = tokenized.input_ids;
  const dims = input_ids.dims;
  const lastDim = dims && dims.length ? dims[dims.length - 1] : 0;
  const offset = 256 * Math.min(Math.max(lastDim - 2, 0), 509);

  const voiceData = await getVoiceStyleArray(mid, voice);
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
