export default function DictationRecognitionReview({
  result,
  isLast,
  onRetry,
  onContinue,
  onAcceptAsCorrect,
}) {
  if (!result) return null;

  const correct = result.correct;
  const continueText = isLast ? '查看结果' : '下一个';

  return (
    <div className={`recognition-review ${correct ? 'correct' : 'wrong'}`}>
      <div className="recognition-review-status">
        {correct ? '识别正确' : '请核对识别结果'}
      </div>

      <div className="recognition-compare-grid">
        <div className="recognition-compare-card expected">
          <span>标准答案</span>
          <strong>{result.word}</strong>
          {result.pinyin && <small>{result.pinyin}</small>}
        </div>
        <div className="recognition-compare-card recognized">
          <span>识别结果</span>
          <strong>{result.input || '未识别'}</strong>
          {!correct && <small>和标准答案不一致</small>}
        </div>
      </div>

      {!correct && (
        <p className="hint-text recognition-review-hint">
          如果模型识别错了但你确实写对了，可以点“我写对了”；想重新写一遍可以点“重写”。
        </p>
      )}

      <div className="recognition-review-actions">
        {!correct && (
          <>
            <button type="button" className="btn-secondary" onClick={onRetry}>
              重写
            </button>
            <button type="button" className="btn-secondary" onClick={onAcceptAsCorrect}>
              我写对了
            </button>
          </>
        )}
        <button type="button" className="btn-primary" onClick={onContinue}>
          {continueText}
        </button>
      </div>
    </div>
  );
}
