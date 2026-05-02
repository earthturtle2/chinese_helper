function formatProbability(value) {
  const pct = Number(value || 0) * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

export default function DictationRecognitionReview({
  result,
  isLast,
  onRetry,
  onContinue,
  onAcceptAsCorrect,
}) {
  if (!result) return null;

  const correct = result.reviewState === 'correct';
  const uncertain = result.reviewState === 'uncertain';
  const continueText = isLast ? '查看结果' : '下一个';
  const previews = (result.charReviews || []).filter((r) => r.modelInputPreview);

  return (
    <div className={`recognition-review ${correct ? 'correct' : uncertain ? 'uncertain' : 'wrong'}`}>
      <div className="recognition-review-status">
        {correct ? '识别正确' : uncertain ? '模型不确定，请确认' : '请核对识别结果'}
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

      {result.charReviews?.some((r) => r.candidates?.length > 1) && (
        <div className="recognition-candidates">
          {(result.charReviews || []).map((r, i) => (
            <div key={`${r.expected}-${i}`} className="recognition-candidate-row">
              <span>{r.expected}</span>
              <em>
                {(r.candidates || []).slice(0, 5).map((c) => (
                  `${c.char}${formatProbability(c.probability)}`
                )).join(' / ')}
              </em>
            </div>
          ))}
        </div>
      )}

      {previews.length > 0 && (
        <details className="recognition-debug">
          <summary>模型看到的 64×64 输入</summary>
          <div className="recognition-debug-images">
            {previews.map((r, i) => (
              <figure key={`${r.expected}-${i}`}>
                <img src={r.modelInputPreview} alt={`模型输入 ${r.expected}`} />
                <figcaption>{r.expected}</figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}

      {!correct && (
        <p className="hint-text recognition-review-hint">
          {uncertain
            ? '标准字出现在候选里，模型不够确定；如果你写对了，建议点“我写对了”。'
            : '如果模型识别错了但你确实写对了，可以点“我写对了”；想重新写一遍可以点“重写”。'}
        </p>
      )}

      <div className="recognition-review-actions">
        {!correct && (
          <>
            <button type="button" className="btn-secondary" onClick={onRetry}>
              重写
            </button>
            <button type="button" className="btn-secondary" onClick={onContinue}>
              按识别结果继续
            </button>
            <button type="button" className="btn-primary" onClick={onAcceptAsCorrect}>
              我写对了{uncertain ? '，继续' : ''}
            </button>
          </>
        )}
        {correct && (
          <button type="button" className="btn-primary" onClick={onContinue}>
            {continueText}
          </button>
        )}
      </div>
    </div>
  );
}
