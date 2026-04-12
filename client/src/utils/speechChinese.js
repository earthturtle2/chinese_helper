/**
 * 中文朗读：优先使用服务端 Piper（本地神经网络），不可用时回退到 Web Speech API。
 *
 * 移动端核心约束（iOS Safari / Android WebView / 国产浏览器）：
 *   1. speechSynthesis.speak() 必须在用户手势的 **同步** 调用栈内触发。
 *      任何 await / setTimeout / requestAnimationFrame 都会让手势"过期"。
 *   2. HTML <audio>.play() 同样要求在手势内触发。
 *   3. Web Audio API 的 AudioContext 一旦在手势内 resume()，
 *      **整个页面会话中** 都可以通过它播放音频，不再受手势限制。
 *
 * 策略：
 *   - 每次朗读入口（speakChineseWord / enqueueChineseLongText）首先同步
 *     调用 unlockAudioPlayback() 解锁 AudioContext。
 *   - Piper WAV 通过已解锁的 AudioContext.decodeAudioData + BufferSource 播放，
 *     不再依赖 <audio> 元素。
 *   - 浏览器 TTS 直接同步 speak()，设 lang='zh-CN'；
 *     即使 getVoices() 暂时为空也能播（系统默认引擎按 lang 匹配）。
 *   - Piper 状态在模块加载 / useTtsEngine 探测后缓存，朗读时不再 await 状态接口。
 */

import { api } from '../api';

/* ─── voice 管理 ─── */

let cachedVoices = [];

function refreshVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  cachedVoices = speechSynthesis.getVoices();
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  refreshVoices();
}

export function pickPreferredZhVoice(voices) {
  if (!voices?.length) return null;
  const zh = voices.filter((v) => {
    const lang = (v.lang || '').toLowerCase();
    return lang.startsWith('zh') || lang.includes('cmn');
  });
  if (!zh.length) return null;
  const score = (v) => {
    let s = 0;
    if (v.localService) s += 3;
    const n = `${v.name} ${v.voiceURI || ''}`;
    if (/xiaoxiao|xiaoyi|yunxi|yunjian|xiaoyun|zh-cn|mandarin|chinese|中文/i.test(n)) s += 2;
    return s;
  };
  return [...zh].sort((a, b) => score(b) - score(a))[0];
}

function getZhVoice() {
  const list = cachedVoices.length
    ? cachedVoices
    : typeof speechSynthesis !== 'undefined'
      ? speechSynthesis.getVoices()
      : [];
  return pickPreferredZhVoice(list);
}

/* ─── 分段工具 ─── */

export function splitTextForTts(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const bySentence = t
    .split(/(?<=[。！？；!?])\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);
  if (bySentence.length > 1) return bySentence;
  const one = bySentence[0] || t;
  const maxLen = 100;
  if (one.length <= maxLen) return [one];
  const out = [];
  for (let i = 0; i < one.length; i += maxLen) out.push(one.slice(i, i + maxLen));
  return out;
}

const MAX_PIPER_CHUNK = 7800;

function splitHardByLength(s, maxLen) {
  const out = [];
  for (let i = 0; i < s.length; i += maxLen) out.push(s.slice(i, i + maxLen));
  return out;
}

export function splitTextForPiper(text) {
  const t = String(text || '').trim().replace(/\r\n/g, '\n');
  if (!t) return [];
  if (t.length <= MAX_PIPER_CHUNK) return [t];

  const rawUnits = t.split(/(?<=[。！？!?])\s*|\n+/u);
  const units = [];
  for (const r of rawUnits) {
    const s = r.trim();
    if (s) units.push(s);
  }
  if (units.length === 0) return [t.slice(0, MAX_PIPER_CHUNK)];

  const chunks = [];
  let buf = '';
  for (const u of units) {
    if (u.length > MAX_PIPER_CHUNK) {
      if (buf) { chunks.push(buf); buf = ''; }
      chunks.push(...splitHardByLength(u, MAX_PIPER_CHUNK));
      continue;
    }
    if (buf.length + u.length <= MAX_PIPER_CHUNK) {
      buf = buf ? buf + u : u;
    } else {
      if (buf) chunks.push(buf);
      buf = u;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/* ─── AudioContext 解锁 & Web Audio 播放 ─── */

let sharedAudioCtx = null;
let currentSource = null;
let currentAudio = null;

/**
 * 在用户手势的同步调用栈内调用。
 * 创建 / resume 共享 AudioContext 并播放一帧静音，解锁后整页会话有效。
 */
export function unlockAudioPlayback() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
      if (sharedAudioCtx.state === 'suspended') void sharedAudioCtx.resume();
      const buf = sharedAudioCtx.createBuffer(1, 1, 22050);
      const src = sharedAudioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(sharedAudioCtx.destination);
      src.start(0);
    }
  } catch { /* ignore */ }
}

/**
 * 通过已解锁的 AudioContext 播放 WAV/音频 blob。
 * AudioContext 在 resume() 后不受后续异步影响，因此 Piper 网络请求后仍可播放。
 */
async function playWavBlob(blob) {
  if (sharedAudioCtx) {
    try {
      if (sharedAudioCtx.state === 'suspended') await sharedAudioCtx.resume();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await sharedAudioCtx.decodeAudioData(arrayBuffer);
      await new Promise((resolve) => {
        const source = sharedAudioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(sharedAudioCtx.destination);
        currentSource = source;
        source.onended = () => {
          if (currentSource === source) currentSource = null;
          resolve();
        };
        source.start(0);
      });
      return;
    } catch (e) {
      console.warn('Web Audio playback failed, trying HTML audio:', e);
    }
  }

  await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.volume = 1;
    if ('playsInline' in audio) audio.playsInline = true;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    audio.src = url;
    currentAudio = audio;
    const cleanup = () => {
      URL.revokeObjectURL(url);
      try { audio.remove(); } catch { /* ignore */ }
      if (currentAudio === audio) currentAudio = null;
    };
    audio.addEventListener('ended', () => { cleanup(); resolve(); }, { once: true });
    audio.addEventListener('error', () => { cleanup(); reject(new Error('audio playback')); }, { once: true });
    try { document.body.appendChild(audio); } catch { /* ignore */ }
    audio.play().catch((e) => { cleanup(); reject(e); });
  });
}

/* ─── Piper 状态 ─── */

/** null=未探测, true=Piper 可用, false=不可用 */
let piperResolved = null;

export function primePiperTtsStatus(available) {
  piperResolved = !!available;
}

void api
  .getTtsStatus()
  .then((s) => primePiperTtsStatus(!!(s && s.available)))
  .catch(() => { if (piperResolved === null) primePiperTtsStatus(false); });

/* ─── 浏览器 TTS ─── */

function stopBrowserSpeech() {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
}

/**
 * Android WebView 常需 resume() 才能让 speechSynthesis 工作；
 * 同时主动刷新 voice 缓存。
 */
function prepareBrowserTts() {
  if (typeof speechSynthesis === 'undefined') return;
  try { speechSynthesis.resume(); } catch { /* ignore */ }
  refreshVoices();
}

/**
 * 同步调用 speechSynthesis.speak()。
 * 即使 getVoices() 为空也直接 speak —— 系统会按 lang 匹配默认引擎。
 * 绝不使用 requestAnimationFrame / setTimeout，避免丢失手势。
 */
function speakBrowserWord(text, { rate = 0.82 } = {}) {
  if (typeof speechSynthesis === 'undefined' || !text) return;
  prepareBrowserTts();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = rate;
  u.volume = 1;
  const voice = getZhVoice();
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
}

function enqueueBrowserLongText(text, { rate = 0.92, onComplete, onError } = {}) {
  if (typeof speechSynthesis === 'undefined') { onComplete?.(); return; }
  prepareBrowserTts();
  const chunks = splitTextForTts(text);
  if (!chunks.length) { onComplete?.(); return; }
  const voice = getZhVoice();
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = 'zh-CN';
    u.rate = rate;
    u.volume = 1;
    if (voice) u.voice = voice;
    if (i === chunks.length - 1) {
      u.onend = () => onComplete?.();
      u.onerror = () => { onError?.(); onComplete?.(); };
    }
    speechSynthesis.speak(u);
  });
}

/* ─── 工具 ─── */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ─── 公开 API ─── */

/**
 * 朗读短文本（生词、单句）。
 * Piper 可用时走 WebAudio 播放服务端 WAV；否则同步走浏览器 TTS。
 */
export async function speakChineseWord(text, { rate = 0.82, cancelBefore = true } = {}) {
  if (!text) return;
  if (cancelBefore) stopChineseSpeech();
  unlockAudioPlayback();

  if (piperResolved === true) {
    try {
      const blob = await api.ttsSpeak(text);
      await playWavBlob(blob);
      return;
    } catch (e) {
      if (e?.status === 503) primePiperTtsStatus(false);
      console.warn('Piper TTS:', e?.message || e);
    }
    speakBrowserWord(text, { rate });
    return;
  }

  if (piperResolved === null) {
    void api
      .getTtsStatus()
      .then((s) => primePiperTtsStatus(!!(s && s.available)))
      .catch(() => primePiperTtsStatus(false));
  }
  speakBrowserWord(text, { rate });
}

/**
 * 长文朗读：优先 Piper 分段 → WebAudio 顺序播放；否则浏览器 TTS 分段入队。
 */
export async function enqueueChineseLongText(text, { rate = 0.92, onComplete, onError } = {}) {
  unlockAudioPlayback();
  stopChineseSpeech();
  if (!String(text || '').trim()) { onComplete?.(); return; }

  if (piperResolved === false) {
    enqueueBrowserLongText(text, { rate, onComplete, onError });
    return;
  }

  if (piperResolved === null) {
    void api
      .getTtsStatus()
      .then((s) => primePiperTtsStatus(!!(s && s.available)))
      .catch(() => primePiperTtsStatus(false));
    enqueueBrowserLongText(text, { rate, onComplete, onError });
    return;
  }

  try {
    const piperChunks = splitTextForPiper(text);
    for (let i = 0; i < piperChunks.length; i++) {
      const chunk = piperChunks[i];
      if (!chunk.trim()) continue;
      const blob = await api.ttsSpeak(chunk);
      await playWavBlob(blob);
      if (i < piperChunks.length - 1) await sleep(160);
    }
    onComplete?.();
  } catch (e) {
    console.warn('Piper 长文朗读失败，改用浏览器语音', e);
    stopBrowserSpeech();
    enqueueBrowserLongText(text, { rate, onComplete, onError });
  }
}

export function stopChineseSpeech() {
  stopBrowserSpeech();
  if (currentSource) {
    try { currentSource.stop(); } catch { /* ignore */ }
    currentSource = null;
  }
  if (currentAudio) {
    const el = currentAudio;
    const src = el.src || '';
    try { el.pause(); } catch { /* ignore */ }
    try { el.remove?.(); } catch { /* ignore */ }
    if (src.startsWith('blob:')) {
      try { URL.revokeObjectURL(src); } catch { /* ignore */ }
    }
    currentAudio = null;
  }
}
