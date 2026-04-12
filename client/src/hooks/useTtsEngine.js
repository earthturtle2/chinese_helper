import { useState, useEffect } from 'react';
import { api } from '../api';
import { primeTtsFromStatus, primePiperTtsStatus } from '../utils/speechChinese';

/**
 * 与 /api/tts/status 一致：首选引擎（Kokoro / Piper）及 Piper 是否就绪。
 * 同步到 speechChinese，避免用户点击「朗读」时再 await 状态接口而破坏 iOS 手势链。
 */
export function useTtsEngine() {
  const [state, setState] = useState({
    loading: true,
    piperAvailable: false,
    preferredEngine: 'kokoro',
  });
  useEffect(() => {
    let cancelled = false;
    api
      .getTtsStatus()
      .then((s) => {
        primeTtsFromStatus(s);
        const ok = !!(s && s.available);
        const pe = String(s?.preferredEngine || 'kokoro').toLowerCase() === 'piper' ? 'piper' : 'kokoro';
        if (!cancelled) setState({ loading: false, piperAvailable: ok, preferredEngine: pe });
      })
      .catch(() => {
        primePiperTtsStatus(false);
        if (!cancelled) setState({ loading: false, piperAvailable: false, preferredEngine: 'kokoro' });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
