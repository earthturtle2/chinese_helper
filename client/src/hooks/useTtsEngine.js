import { useState, useEffect } from 'react';
import { api } from '../api';
import { primePiperTtsStatus } from '../utils/speechChinese';

/**
 * 探测服务端 Piper 是否可用（与 /api/tts/status 一致）。
 * 实际播放时若请求失败仍会回退浏览器，此处表示「将优先尝试」的引擎。
 * 同步到 speechChinese，避免用户点击「朗读」时再 await 状态接口而破坏 iOS 手势链。
 */
export function useTtsEngine() {
  const [state, setState] = useState({ loading: true, piperAvailable: false });
  useEffect(() => {
    let cancelled = false;
    api
      .getTtsStatus()
      .then((s) => {
        const ok = !!(s && s.available);
        primePiperTtsStatus(ok);
        if (!cancelled) setState({ loading: false, piperAvailable: ok });
      })
      .catch(() => {
        primePiperTtsStatus(false);
        if (!cancelled) setState({ loading: false, piperAvailable: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
