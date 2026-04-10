import { useState, useEffect } from 'react';
import { api } from '../api';

/**
 * 探测服务端 Piper 是否可用（与 /api/tts/status 一致）。
 * 实际播放时若请求失败仍会回退浏览器，此处表示「将优先尝试」的引擎。
 */
export function useTtsEngine() {
  const [state, setState] = useState({ loading: true, piperAvailable: false });
  useEffect(() => {
    let cancelled = false;
    api
      .getTtsStatus()
      .then((s) => {
        if (!cancelled) setState({ loading: false, piperAvailable: !!(s && s.available) });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, piperAvailable: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
