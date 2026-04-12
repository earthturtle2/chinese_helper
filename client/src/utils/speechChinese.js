/**
 * 中文朗读：默认浏览器 Kokoro 中文 ONNX；管理端可选 Piper（服务端），否则回退 Web Speech API。
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
 *     a) 解锁 AudioContext（供 Kokoro / Piper 的 WAV）
 *     b) 首次 speechSynthesis.speak() 激活引擎（warmup）
 *   - 浏览器 TTS 的 speak() 延迟 150ms，避开 cancel-speak 竞态
 *   - Kokoro / Piper 返回的 WAV 通过已解锁的 AudioContext.decodeAudioData 播放
 *   - speakChineseWord / enqueueChineseLongText 带短间隔 + 互斥，防止连续猛点重复触发
 */

import { api } from '../api';
import { abortKokoroSynthesis, synthesizeKokoroZh, splitTextForKokoro } from './kokoroZhTts';

/** 防止连续猛点：短句最小间隔 + 互斥；长文最小间隔 + 互斥（含浏览器分段读完） */
const SPEAK_WORD_MIN_GAP_MS = 420;
const LONG_TEXT_MIN_GAP_MS = 700;

let speakWordBusy = false;
let lastSpeakWordAt = 0;

let longTextBusy = false;
let lastLongTextAt = 0;

/** 全文朗读暂停：分段合成/播放之间会等待此处恢复 */
let fullTextPaused = false;
const fullTextPauseResolvers = [];

export function getFullTextSpeechPaused() {
  return fullTextPaused;
}

export async function waitUntilFullTextResumed() {
  while (fullTextPaused) {
    await new Promise((resolve) => {
      fullTextPauseResolvers.push(resolve);
    });
  }
}

/**
 * 暂停全文朗读（Web Audio / HTML audio / speechSynthesis）。
 * 短句单字朗读勿调用；与 continue 成对使用。
 */
export function pauseFullTextSpeech() {
  fullTextPaused = true;
  try {
    if (sharedAudioCtx && sharedAudioCtx.state === 'running') void sharedAudioCtx.suspend();
  } catch { /* ignore */ }
  try {
    if (currentAudio && !currentAudio.paused) currentAudio.pause();
  } catch { /* ignore */ }
  try {
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking && !speechSynthesis.paused) {
      speechSynthesis.pause();
    }
  } catch { /* ignore */ }
}

/**
 * 继续全文朗读。
 */
export function resumeFullTextSpeech() {
  fullTextPaused = false;
  while (fullTextPauseResolvers.length) {
    const r = fullTextPauseResolvers.pop();
    try {
      r();
    } catch { /* ignore */ }
  }
  try {
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') void sharedAudioCtx.resume();
  } catch { /* ignore */ }
  try {
    if (currentAudio && currentAudio.paused) void currentAudio.play();
  } catch { /* ignore */ }
  try {
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.paused) {
      speechSynthesis.resume();
    }
  } catch { /* ignore */ }
}

function clearFullTextPauseState() {
  fullTextPaused = false;
  while (fullTextPauseResolvers.length) {
    const r = fullTextPauseResolvers.pop();
    try {
      r();
    } catch { /* ignore */ }
  }
}

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
export async function playWavBlob(blob) {
  await waitUntilFullTextResumed();
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

/** @type {'kokoro'|'piper'} */
let preferredTtsEngine = 'kokoro';

let kokoroClientOptions = {
  modelId: 'onnx-community/Kokoro-82M-v1.1-zh-ONNX',
  voice: 'zf_001',
};

export function primePiperTtsStatus(available) {
  piperResolved = !!available;
}

/**
 * 与 /api/tts/status 对齐：首选引擎（Kokoro 浏览器 / Piper 服务端）及 Kokoro 参数。
 */
export function primeTtsFromStatus(s) {
  if (!s) return;
  primePiperTtsStatus(!!(s && s.available));
  const pe = String(s.preferredEngine || 'kokoro').trim().toLowerCase();
  preferredTtsEngine = pe === 'piper' ? 'piper' : 'kokoro';
  if (s.kokoro && typeof s.kokoro === 'object') {
    kokoroClientOptions = {
      modelId: String(s.kokoro.modelId || kokoroClientOptions.modelId).trim() || kokoroClientOptions.modelId,
      voice: String(s.kokoro.voice || 'zf_001').trim() || 'zf_001',
    };
  }
}

void api
  .getTtsStatus()
  .then((s) => primeTtsFromStatus(s))
  .catch(() => {
    if (piperResolved === null) primePiperTtsStatus(false);
  });

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
 * onError 可选：当引擎实际未播放时触发（onend 无 onstart）。
 * 返回在一句播放结束或出错时 resolve 的 Promise，便于与防抖互斥配合。
 */
function speakBrowserWord(text, { rate = 0.82, onError } = {}) {
  if (typeof speechSynthesis === 'undefined' || !text) {
    onError?.();
    return Promise.resolve();
  }
  cancelBrowserSpeechTimer();
  return new Promise((resolve) => {
    const gen = ++browserSpeechGen;
    browserSpeechTimer = setTimeout(() => {
      browserSpeechTimer = null;
      if (gen !== browserSpeechGen) {
        resolve();
        return;
      }
      prepareBrowserTts();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = rate;
      u.volume = 1;
      const voice = getZhVoice();
      if (voice) u.voice = voice;
      let started = false;
      u.onstart = () => { started = true; };
      const done = () => {
        resolve();
      };
      u.onend = () => {
        if (!started) onError?.();
        done();
      };
      u.onerror = () => {
        onError?.();
        done();
      };
      speechSynthesis.speak(u);
    }, 150);
  });
}

/**
 * 长文浏览器朗读（分句入队）。延迟 150ms 以避开 cancel 竞态。
 * 第一句设置 onstart 检测；若引擎未真正播放，触发 onError。
 * 返回在队列末尾播放完成或出错时 resolve 的 Promise。
 */
function enqueueBrowserLongText(text, { rate = 0.92, onComplete, onError } = {}) {
  if (typeof speechSynthesis === 'undefined') {
    onError?.();
    onComplete?.();
    return Promise.resolve();
  }
  cancelBrowserSpeechTimer();
  return new Promise((resolve) => {
    const gen = ++browserSpeechGen;
    const finish = () => {
      resolve();
    };
    browserSpeechTimer = setTimeout(() => {
      void (async () => {
      browserSpeechTimer = null;
      if (gen !== browserSpeechGen) {
        finish();
        return;
      }
      await waitUntilFullTextResumed();
      prepareBrowserTts();
      const chunks = splitTextForTts(text);
      if (!chunks.length) {
        onComplete?.();
        finish();
        return;
      }
      const voice = getZhVoice();
      let anyStarted = false;
      chunks.forEach((chunk, i) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = 'zh-CN';
        u.rate = rate;
        u.volume = 1;
        if (voice) u.voice = voice;
        u.onstart = () => { anyStarted = true; };
        if (i === chunks.length - 1) {
          u.onend = () => {
            if (!anyStarted) onError?.();
            onComplete?.();
            finish();
          };
          u.onerror = () => {
            onError?.();
            onComplete?.();
            finish();
          };
        }
        speechSynthesis.speak(u);
      });
      })();
    }, 150);
  });
}

/* ─── 工具 ─── */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ─── 公开 API ─── */

/**
 * 朗读短文本（生词、单句）。
 * onError 可选：当 Kokoro、Piper 与浏览器 TTS 都失败时触发。
 * 连续点击会在上一段尚未结束或间隔过短时忽略（防抖）。
 */
export async function speakChineseWord(text, { rate = 0.82, cancelBefore = true, onError } = {}) {
  if (!text) return;
  const now = Date.now();
  if (speakWordBusy) return;
  if (now - lastSpeakWordAt < SPEAK_WORD_MIN_GAP_MS) return;
  lastSpeakWordAt = now;
  speakWordBusy = true;
  try {
    unlockAudioPlayback();
    if (cancelBefore) stopChineseSpeech();

    if (preferredTtsEngine === 'kokoro') {
      try {
        const raw = await synthesizeKokoroZh(text, kokoroClientOptions);
        await playWavBlob(raw.toBlob());
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
        console.warn('Kokoro TTS failed:', e?.message || e);
      }
    }

    if (piperResolved === true) {
      try {
        const blob = await api.ttsSpeak(text);
        await playWavBlob(blob);
        return;
      } catch (e) {
        primePiperTtsStatus(false);
        console.warn('Piper TTS failed, disabling for this session:', e?.message || e);
      }
    }

    if (piperResolved === null) {
      void api
        .getTtsStatus()
        .then((s) => primeTtsFromStatus(s))
        .catch(() => primePiperTtsStatus(false));
    }
    await speakBrowserWord(text, { rate, onError });
  } finally {
    speakWordBusy = false;
  }
}

/**
 * 长文朗读：首选 Kokoro 时分段合成；否则 Piper → WebAudio；再否则浏览器 TTS。
 * 连续点击会在上一段尚未结束或间隔过短时忽略（防抖）。
 */
export async function enqueueChineseLongText(text, { rate = 0.92, onComplete, onError } = {}) {
  const now = Date.now();
  if (longTextBusy) return;
  if (now - lastLongTextAt < LONG_TEXT_MIN_GAP_MS) return;
  lastLongTextAt = now;
  longTextBusy = true;
  try {
    unlockAudioPlayback();
    stopChineseSpeech();
    if (!String(text || '').trim()) {
      onComplete?.();
      return;
    }

    if (preferredTtsEngine === 'kokoro') {
      try {
        const parts = splitTextForKokoro(text);
        for (let i = 0; i < parts.length; i++) {
          await waitUntilFullTextResumed();
          const chunk = parts[i];
          if (!chunk.trim()) continue;
          const raw = await synthesizeKokoroZh(chunk, kokoroClientOptions);
          await playWavBlob(raw.toBlob());
          if (i < parts.length - 1) await sleep(120);
        }
        onComplete?.();
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
        console.warn('Kokoro 长文朗读失败:', e?.message || e);
      }
    }

    if (piperResolved === false) {
      await enqueueBrowserLongText(text, { rate, onComplete, onError });
      return;
    }

    if (piperResolved === null) {
      void api
        .getTtsStatus()
        .then((s) => primeTtsFromStatus(s))
        .catch(() => primePiperTtsStatus(false));
      await enqueueBrowserLongText(text, { rate, onComplete, onError });
      return;
    }

    try {
      const piperChunks = splitTextForPiper(text);
      for (let i = 0; i < piperChunks.length; i++) {
        await waitUntilFullTextResumed();
        const chunk = piperChunks[i];
        if (!chunk.trim()) continue;
        const blob = await api.ttsSpeak(chunk);
        await playWavBlob(blob);
        if (i < piperChunks.length - 1) await sleep(160);
      }
      onComplete?.();
    } catch (e) {
      primePiperTtsStatus(false);
      console.warn('Piper 长文朗读失败, disabling for this session:', e?.message || e);
      await enqueueBrowserLongText(text, { rate, onComplete, onError });
    }
  } finally {
    longTextBusy = false;
  }
}

export function stopChineseSpeech() {
  abortKokoroSynthesis();
  clearFullTextPauseState();
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
