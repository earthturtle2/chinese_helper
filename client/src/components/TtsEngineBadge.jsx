/**
 * 显示当前将优先使用的朗读方式（管理端 tts_engine + 服务端 Piper 是否就绪）。
 */
export default function TtsEngineBadge({ loading, piperAvailable, preferredEngine = 'kokoro', compact = false }) {
  if (loading) {
    return (
      <span className="tts-engine-badge tts-engine-loading" aria-live="polite">
        {compact ? '朗读：检测中…' : '朗读引擎：检测中…'}
      </span>
    );
  }
  if (preferredEngine === 'kokoro') {
    return (
      <span
        className="tts-engine-badge tts-engine-kokoro"
        title="Kokoro 在浏览器内加载 ONNX 模型，首次可能较慢；音色见管理端 Kokoro 设置"
      >
        {compact ? 'Kokoro 朗读' : '朗读引擎：Kokoro（浏览器·中文）'}
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
    <span className="tts-engine-badge tts-engine-browser" title="使用浏览器调用的系统中文语音（Piper 未就绪）">
      {compact ? '浏览器朗读' : '朗读引擎：浏览器（系统语音）'}
    </span>
  );
}
