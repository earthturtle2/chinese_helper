/**
 * 中文朗读：优先使用服务端 Piper（本地神经网络），不可用时回退到 Web Speech API。
 *
 * iOS / 移动 Safari 等要求音频与 speechSynthesis 在用户手势的同步调用栈内启动；
 * 若在 await 网络请求之后再 play/speak，会被静默拦截。因此：
 * - 在任意 await 之前调用 unlockAudioPlayback()；
 * - Piper 是否可用由 primePiperTtsStatus / 启动时探测缓存，避免首击前 await getTtsStatus；
 * - 状态仍未知时先同步走浏览器 TTS，再在后台刷新状态。
 */

import { api } from '../api';

/** 极短静音 WAV，用于在同一次用户点击内解锁媒体播放（尤其 iOS） */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

let cachedVoices = [];

function refreshVoices() {
  if (typeof speechSynthesis === 'undefined') return;
  cachedVoices = speechSynthesis.getVoices();
}

if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  refreshVoices();
}

let currentAudio = null;
/** null=未探测, true=Piper 可用, false=不可用 */
let piperResolved = null;

/** 复用同一 AudioContext，避免国产浏览器多次 new 导致异常；每次手势内 resume */
let sharedAudioCtx = null;

/**
 * 在用户点击等手势回调内同步调用（勿 await 之后再调）。
 * 国产 Android 自带浏览器常拦截首次播放；若只解锁一次且失败会全程无声，因此每次朗读都尝试解锁。
 */
export function unlockAudioPlayback() {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
      if (sharedAudioCtx.state === 'suspended') void sharedAudioCtx.resume();
      const buffer = sharedAudioCtx.createBuffer(1, 1, 22050);
      const src = sharedAudioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(sharedAudioCtx.destination);
      src.start(0);
    }
  } catch {
    /* ignore */
  }
  try {
    const a = new Audio(SILENT_WAV);
    a.volume = 0.01;
    if ('playsInline' in a) a.playsInline = true;
    a.setAttribute?.('playsinline', '');
    a.setAttribute?.('webkit-playsinline', '');
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Android / WebView 上常见：首次 getVoices 为空、合成处于 paused；需在用户手势内 resume 并刷新列表。
 */
function prepareBrowserTts() {
  if (typeof speechSynthesis === 'undefined') return;
  try {
    speechSynthesis.resume();
  } catch {
    /* ignore */
  }
  try {
    speechSynthesis.getVoices();
    speechSynthesis.getVoices();
  } catch {
    /* ignore */
  }
  refreshVoices();
}

/** 与 useTtsEngine 探测结果同步，避免朗读时再 await /tts/status 打断用户手势 */
export function primePiperTtsStatus(available) {
  piperResolved = !!available;
}

void api
  .getTtsStatus()
  .then((s) => primePiperTtsStatus(!!(s && s.available)))
  .catch(() => {
    if (piperResolved === null) primePiperTtsStatus(false);
  });

/** 在已加载的语音列表中选一个中文朗读声线（优先本地/常见中文命名） */
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
  const raw =
    typeof speechSynthesis !== 'undefined'
      ? cachedVoices.length
        ? cachedVoices
        : speechSynthesis.getVoices()
      : [];
  return pickPreferredZhVoice(raw);
}

/** 按句号等切分；无标点长段再按长度切开，便于浏览器 TTS 队列播放 */
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
  for (let i = 0; i < one.length; i += maxLen) {
    out.push(one.slice(i, i + maxLen));
  }
  return out;
}

/** 与服务器单次上限对齐；尽量整篇一次合成，减少多段 WAV 拼接导致的生硬停顿 */
const MAX_PIPER_CHUNK = 7800;

function splitHardByLength(s, maxLen) {
  const out = [];
  for (let i = 0; i < s.length; i += maxLen) {
    out.push(s.slice(i, i + maxLen));
  }
  return out;
}

/**
 * Piper 专用分段：不在分号、逗号处切段；只在句末（。！？）与换行处分段，再合并到不超过上限。
 */
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
      if (buf) {
        chunks.push(buf);
        buf = '';
      }
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function stopBrowserSpeech() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

function playWavBlob(blob) {
  return new Promise((resolve, reject) => {
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
      audio.remove();
      if (currentAudio === audio) currentAudio = null;
    };
    audio.addEventListener(
      'ended',
      () => {
        cleanup();
        resolve();
      },
      { once: true }
    );
    audio.addEventListener(
      'error',
      () => {
        cleanup();
        reject(new Error('audio playback'));
      },
      { once: true }
    );
    try {
      document.body.appendChild(audio);
    } catch {
      /* ignore */
    }
    audio.play().catch((e) => {
      cleanup();
      reject(e);
    });
  });
}

function speakBrowserWord(text, { rate = 0.82 } = {}) {
  if (typeof speechSynthesis === 'undefined' || !text) return;
  const run = () => {
    prepareBrowserTts();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = rate;
    u.volume = 1;
    const voice = getZhVoice();
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  };
  prepareBrowserTts();
  const noVoicesYet =
    speechSynthesis.getVoices().length === 0 && cachedVoices.length === 0;
  if (noVoicesYet) {
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    return;
  }
  run();
}

/**
 * 朗读短文本（生词、单句）。默认先 cancel 再播，避免叠音。
 */
export async function speakChineseWord(text, { rate = 0.82, cancelBefore = true } = {}) {
  if (!text) return;
  if (cancelBefore) stopChineseSpeech();
  unlockAudioPlayback();

  const runPiper = async () => {
    try {
      const blob = await api.ttsSpeak(text);
      await playWavBlob(blob);
    } catch (e) {
      if (e?.status === 503) primePiperTtsStatus(false);
      console.warn('Piper TTS:', e?.message || e);
      speakBrowserWord(text, { rate });
    }
  };

  if (piperResolved === true) {
    await runPiper();
    return;
  }
  if (piperResolved === false) {
    speakBrowserWord(text, { rate });
    return;
  }

  void api
    .getTtsStatus()
    .then((s) => primePiperTtsStatus(!!(s && s.available)))
    .catch(() => primePiperTtsStatus(false));
  speakBrowserWord(text, { rate });
}

function enqueueBrowserLongText(text, { rate = 0.92, onComplete, onError } = {}, voiceWarmupPass = 0) {
  if (typeof speechSynthesis === 'undefined') {
    onComplete?.();
    return;
  }
  prepareBrowserTts();
  const noVoicesYet =
    speechSynthesis.getVoices().length === 0 && cachedVoices.length === 0;
  if (noVoicesYet && voiceWarmupPass === 0) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() =>
        enqueueBrowserLongText(text, { rate, onComplete, onError }, 1)
      );
    });
    return;
  }
  const chunks = splitTextForTts(text);
  if (!chunks.length) {
    onComplete?.();
    return;
  }
  const voice = getZhVoice();
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = 'zh-CN';
    u.rate = rate;
    u.volume = 1;
    if (voice) u.voice = voice;
    const last = i === chunks.length - 1;
    if (last) {
      u.onend = () => onComplete?.();
      u.onerror = () => {
        onError?.();
        onComplete?.();
      };
    }
    speechSynthesis.speak(u);
  });
}

/**
 * 长文：优先 Piper 分段请求并顺序播放；否则 Web Speech 分段入队。
 */
export async function enqueueChineseLongText(text, { rate = 0.92, onComplete, onError } = {}) {
  unlockAudioPlayback();
  stopChineseSpeech();
  if (!String(text || '').trim()) {
    onComplete?.();
    return;
  }

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
      if (i < piperChunks.length - 1) {
        await sleep(160);
      }
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
  if (currentAudio) {
    const el = currentAudio;
    const src = el.src || '';
    try {
      el.pause();
    } catch {
      /* ignore */
    }
    try {
      el.remove?.();
    } catch {
      /* ignore */
    }
    if (src.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(src);
      } catch {
        /* ignore */
      }
    }
    currentAudio = null;
  }
}
