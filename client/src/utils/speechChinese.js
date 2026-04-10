/**
 * 中文朗读：优先使用服务端 Piper（本地神经网络），不可用时回退到 Web Speech API。
 */

import { api } from '../api';

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

/** 按句号等切分；无标点长段再按长度切开，便于 TTS 队列播放 */
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

function stopBrowserSpeech() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

function playWavBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
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

async function shouldUsePiper() {
  if (piperResolved === false) return false;
  if (piperResolved === true) return true;
  try {
    const s = await api.getTtsStatus();
    piperResolved = !!(s && s.available);
  } catch {
    piperResolved = false;
  }
  return piperResolved;
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

  const usePiper = await shouldUsePiper();
  if (usePiper) {
    try {
      const blob = await api.ttsSpeak(text);
      await playWavBlob(blob);
      return;
    } catch (e) {
      if (e?.status === 503) piperResolved = false;
      console.warn('Piper TTS:', e?.message || e);
    }
  }
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
  stopChineseSpeech();
  const chunks = splitTextForTts(text);
  if (!chunks.length) {
    onComplete?.();
    return;
  }

  const usePiper = await shouldUsePiper();
  if (usePiper) {
    try {
      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        const blob = await api.ttsSpeak(chunk);
        await playWavBlob(blob);
      }
      onComplete?.();
    } catch (e) {
      console.warn('Piper 长文朗读失败，改用浏览器语音', e);
      stopBrowserSpeech();
      enqueueBrowserLongText(text, { rate, onComplete, onError });
    }
    return;
  }

  enqueueBrowserLongText(text, { rate, onComplete, onError });
}

export function stopChineseSpeech() {
  stopBrowserSpeech();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}
