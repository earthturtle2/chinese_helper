/**
 * 显示当前将优先使用的朗读方式（由服务端 Piper 是否就绪决定）。
 */
export default function TtsEngineBadge({ loading, piperAvailable, compact = false }) {
  if (loading) {
    return (
      <span className="tts-engine-badge tts-engine-loading" aria-live="polite">
        {compact ? '朗读：检测中…' : '朗读引擎：检测中…'}
      </span>
    );
  }
  if (piperAvailable) {
    return (
      <span
        className="tts-engine-badge tts-engine-piper"
        title="Piper 为本地神经网络合成，对多音字、声调的判定有限，可能与课本不一致"
      >
        {compact ? 'Piper 朗读' : '朗读引擎：Piper 本地合成'}
      </span>
    );
  }
  return (
    <span className="tts-engine-badge tts-engine-browser" title="使用浏览器调用的系统中文语音">
      {compact ? '浏览器朗读' : '朗读引擎：浏览器（系统语音）'}
    </span>
  );
}
