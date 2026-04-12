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

let audioUnlockDone = false;

/**
 * 在用户点击等手势回调内同步调用（勿 await 之后再调）。
 * 解锁后同页的 Audio.play() 更易通过系统策略；与 Piper 返回的 blob 播放配合使用。
 */
export function unlockAudioPlayback() {
  if (typeof window === 'undefined' || audioUnlockDone) return;
  audioUnlockDone = true;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      if (ctx.state === 'suspended') void ctx.resume();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {
    /* ignore */
  }
  try {
    const a = new Audio(SILENT_WAV);
    a.volume = 0.001;
    if ('playsInline' in a) a.playsInline = true;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
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
  const voices = cachedVoices.length ? cachedVoices : typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices() : [];
  return pickPreferredZhVoice(voices);
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
    const audio = new Audio(url);
    if ('playsInline' in audio) audio.playsInline = true;
    audio.setAttribute?.('playsinline', '');
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(new Error('audio playback'));
    };
    audio.play().catch((e) => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(e);
    });
  });
}

function speakBrowserWord(text, { rate = 0.82 } = {}) {
  if (typeof speechSynthesis === 'undefined' || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = rate;
  const voice = getZhVoice();
  if (voice) u.voice = voice;
  speechSynthesis.speak(u);
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

function enqueueBrowserLongText(text, { rate = 0.92, onComplete, onError } = {}) {
  if (typeof speechSynthesis === 'undefined') {
    onComplete?.();
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
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}
