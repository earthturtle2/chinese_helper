import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import TianZiGeHandwriting from '../../components/TianZiGeHandwriting';
import DictationRecognitionReview from '../../components/DictationRecognitionReview';
import { speakChineseWord } from '../../utils/speechChinese';
import { useTtsEngine } from '../../hooks/useTtsEngine';
import TtsEngineBadge from '../../components/TtsEngineBadge';
import { buildDictationRecognitionResult } from '../../utils/dictationRecognition';

export default function DictationPractice() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const [words, setWords] = useState([]);
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState([]);
  const [phase, setPhase] = useState('loading');
  const [pendingResult, setPendingResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const startTime = useRef(0);
  const hwRef = useRef(null);
  const resultsRef = useRef([]);
  const ttsEngine = useTtsEngine();
  const [ttsError, setTtsError] = useState('');

  const skipAutoSpeak = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches,
    []
  );

  useEffect(() => {
    api.getWords(listId).then(w => {
      setWords(w);
      startTime.current = Date.now();
      setPhase('practice');
    }).catch(() => navigate('/student/dictation'));
  }, [listId, navigate]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  const word = words[current];

  const speakPinyin = useCallback(() => {
    if (!word) return;
    setTtsError('');
    void speakChineseWord(word.word, {
      rate: 0.8,
      cancelBefore: true,
      onError: () => setTtsError('朗读失败：请尝试使用 Chrome 浏览器，或检查系统中文语音设置。'),
    });
  }, [word]);

  useEffect(() => {
    if (skipAutoSpeak) return;
    if (phase === 'practice' && word) {
      void speakChineseWord(word.word, {
        rate: 0.8,
        cancelBefore: true,
        onError: () => setTtsError('朗读失败：请尝试使用 Chrome 浏览器，或检查系统中文语音设置。'),
      });
    }
  }, [current, phase, word, skipAutoSpeak]);

  const handleSubmit = async () => {
    if (!word || busy) return;
    setBusy(true);
    let recognition = null;
    try {
      recognition = await hwRef.current?.recognizeDetailed?.();
    } catch (e) {
      console.error(e);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!recognition?.text?.trim()) return;
    const result = buildDictationRecognitionResult(word, recognition);
    setPendingResult(result);
  };

  const commitResult = (result) => {
    const nextResults = [...resultsRef.current, result];
    setResults(nextResults);
    resultsRef.current = nextResults;

    if (current + 1 >= words.length) {
      finishWithResults(nextResults);
    } else {
      setPendingResult(null);
      setCurrent(c => c + 1);
    }
  };

  const retryCurrent = () => {
    setPendingResult(null);
    hwRef.current?.clear?.();
  };

  const acceptAsCorrect = () => {
    if (!pendingResult) return;
    commitResult({
      ...pendingResult,
      input: pendingResult.word,
      correct: true,
      mistakeType: null,
      recognizedInput: pendingResult.input,
    });
  };

  const finishWithResults = async (allResults) => {
    setPhase('submitting');
    const durationSec = Math.round((Date.now() - startTime.current) / 1000);
    try {
      const data = await api.submitDictation({ wordListId: parseInt(listId), results: allResults, durationSec });
      setSummary(data);
      setResults(data.results || allResults);
      setPhase('done');
    } catch { setPhase('done'); }
  };

  if (phase === 'loading') return <div className="loading">加载词表...</div>;

  if (phase === 'done') {
    return (
      <div className="page dictation-done">
        <div className="result-card">
          <h2>默写完成！</h2>
          <div className="result-score">{summary?.accuracy ?? 0}%</div>
          <p>正确 {summary?.correct ?? 0} / {summary?.total ?? words.length}</p>
          <div className="result-list">
            {results.map((r, i) => (
              <div key={i} className={`result-item ${r.correct ? 'correct' : 'wrong'}`}>
                <span className="result-word">{r.word}</span>
                <span className="result-pinyin">{r.pinyin}</span>
                {!r.correct && <span className="result-input">你写的：{r.input}</span>}
                <span className="result-mark">{r.correct ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
          <div className="result-actions">
            <button className="btn-primary" onClick={() => navigate('/student/dictation')}>返回词表</button>
            <button className="btn-secondary" onClick={() => navigate('/student/mistakes')}>查看错词本</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page dictation-practice">
      <div className="practice-header">
        <span className="progress">{current + 1} / {words.length}</span>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${((current + 1) / words.length) * 100}%` }} />
        </div>
      </div>

      <p className="dictation-tts-line">
        <TtsEngineBadge
          compact
          loading={ttsEngine.loading}
          piperAvailable={ttsEngine.piperAvailable}
          preferredEngine={ttsEngine.preferredEngine}
        />
      </p>
      {ttsError && <p className="hint-text" style={{ color: '#c00', margin: '0 16px 8px', fontSize: '13px' }}>{ttsError}</p>}

      <div className="practice-area">
        <div className="pinyin-display">{word?.pinyin}</div>
        <button className="btn-speak" onClick={speakPinyin} title="再听一次">🔊 听读音</button>

        <div className="input-area tianzige-input-area">
          <TianZiGeHandwriting
            key={`${listId}-${current}`}
            ref={hwRef}
            charCount={Math.max(1, word?.word?.length || 1)}
            disabled={busy || !!pendingResult}
          />
          {pendingResult ? (
            <DictationRecognitionReview
              result={pendingResult}
              isLast={current + 1 >= words.length}
              onRetry={retryCurrent}
              onAcceptAsCorrect={acceptAsCorrect}
              onContinue={() => commitResult(pendingResult)}
            />
          ) : (
            <button className="btn-primary" onClick={handleSubmit} disabled={busy}>{busy ? '识别中…' : '确认'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
