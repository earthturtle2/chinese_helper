/**
 * 中文朗读：优先使用服务端 Piper（本地神经网络），不可用时回退到 Web Speech API。
 *
 * 移动端核心约束（iOS Safari / Android WebView / 国产浏览器）：
 *
 *   1. speechSynthesis.speak() 首次调用须在用户手势同步栈内；
 *      之后的调用不再强制要求手势。
 *   2. Android Chromium 已知 bug：speechSynthesis.cancel() 后立即 speak()
 *      会导致 utterance 的 onend 立刻触发而不真正播放。
 *      解决方法：cancel 与 speak 之间加 ≥100ms 延迟。
 *   3. Web Audio API 的 AudioContext 在手势内 resume() 后
 *      整个页面会话中保持解锁，用于 Piper WAV 播放。
 *
 * 策略：
 *   - unlockAudioPlayback() 在手势内同步调用：
 *     a) 解锁 AudioContext（供 Piper WAV）
 *     b) 首次 speechSynthesis.speak() 激活引擎（warmup）
 *   - 浏览器 TTS 的 speak() 延迟 150ms，避开 cancel-speak 竞态
 *   - Piper WAV 通过已解锁的 AudioContext.decodeAudioData 播放
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

/* ─── AudioContext 解锁 & Web Audio 播放（Piper WAV） ─── */

let sharedAudioCtx = null;
let currentSource = null;
let currentAudio = null;

let speechWarmupDone = false;

/**
 * 必须在用户手势的同步调用栈内调用（点击回调顶层，任何 await 之前）。
 *
 * a) 创建 / resume 共享 AudioContext 并播一帧静音 → 解锁 WebAudio（Piper 用）
 * b) 首次 speechSynthesis.speak() 激活引擎（warmup），
 *    之后的 speak() 不再要求手势，配合 setTimeout 延迟可安全使用
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

  if (!speechWarmupDone && typeof speechSynthesis !== 'undefined') {
    speechWarmupDone = true;
    try {
      speechSynthesis.resume();
      refreshVoices();
      const warmup = new SpeechSynthesisUtterance('\u00A0');
      warmup.lang = 'zh-CN';
      warmup.volume = 0.01;
      warmup.rate = 10;
      speechSynthesis.speak(warmup);
    } catch { /* ignore */ }
  }
}

/**
 * 通过已解锁的 AudioContext 播放 WAV blob（Piper 返回值）。
 * AudioContext 在 resume() 后不受后续异步限制。
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
    audio.play().catch((e2) => { cleanup(); reject(e2); });
  });
}

/* ─── Piper 状态 ─── */

let piperResolved = null;

export function primePiperTtsStatus(available) {
  piperResolved = !!available;
}

void api
  .getTtsStatus()
  .then((s) => primePiperTtsStatus(!!(s && s.available)))
  .catch(() => { if (piperResolved === null) primePiperTtsStatus(false); });

/* ─── 浏览器 TTS（带 cancel-speak 竞态保护） ─── */

/**
 * 浏览器 TTS 定时器 + 代计数器。
 * cancel() 与 speak() 之间须 ≥150ms 间隔以绕过 Android Chromium bug。
 * stopChineseSpeech() 通过 cancelBrowserSpeechTimer() 清除待执行的 speak。
 */
let browserSpeechTimer = null;
let browserSpeechGen = 0;

function cancelBrowserSpeechTimer() {
  if (browserSpeechTimer != null) {
    clearTimeout(browserSpeechTimer);
    browserSpeechTimer = null;
  }
  browserSpeechGen++;
}

function stopBrowserSpeech() {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
}

function prepareBrowserTts() {
  if (typeof speechSynthesis === 'undefined') return;
  try { speechSynthesis.resume(); } catch { /* ignore */ }
  refreshVoices();
}

/**
 * 短文本浏览器朗读。延迟 150ms 以避开 cancel 竞态。
 */
function speakBrowserWord(text, { rate = 0.82 } = {}) {
  if (typeof speechSynthesis === 'undefined' || !text) return;
  cancelBrowserSpeechTimer();
  const gen = ++browserSpeechGen;
  browserSpeechTimer = setTimeout(() => {
    browserSpeechTimer = null;
    if (gen !== browserSpeechGen) return;
    prepareBrowserTts();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = rate;
    u.volume = 1;
    const voice = getZhVoice();
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }, 150);
}

/**
 * 长文浏览器朗读（分句入队）。延迟 150ms 以避开 cancel 竞态。
 */
function enqueueBrowserLongText(text, { rate = 0.92, onComplete, onError } = {}) {
  if (typeof speechSynthesis === 'undefined') { onComplete?.(); return; }
  cancelBrowserSpeechTimer();
  const gen = ++browserSpeechGen;
  browserSpeechTimer = setTimeout(() => {
    browserSpeechTimer = null;
    if (gen !== browserSpeechGen) return;
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
  }, 150);
}

/* ─── 工具 ─── */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ─── 公开 API ─── */

/**
 * 朗读短文本（生词、单句）。
 */
export async function speakChineseWord(text, { rate = 0.82, cancelBefore = true } = {}) {
  if (!text) return;
  unlockAudioPlayback();
  if (cancelBefore) stopChineseSpeech();

  if (piperResolved === true) {
    try {
      const blob = await api.ttsSpeak(text);
      await playWavBlob(blob);
      return;
    } catch (e) {
      if (e?.status === 503) primePiperTtsStatus(false);
      console.warn('Piper TTS:', e?.message || e);
    }
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
 * 长文朗读：优先 Piper → WebAudio；否则浏览器 TTS 分段入队。
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
  cancelBrowserSpeechTimer();
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
