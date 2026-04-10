import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import TianZiGeHandwriting from '../../components/TianZiGeHandwriting';
import { speakChineseWord } from '../../utils/speechChinese';

export default function DictationPractice() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const [words, setWords] = useState([]);
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState([]);
  const [phase, setPhase] = useState('loading');
  const [showAnswer, setShowAnswer] = useState(false);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const startTime = useRef(Date.now());
  const hwRef = useRef(null);

  useEffect(() => {
    api.getWords(listId).then(w => {
      setWords(w);
      setPhase('practice');
    }).catch(() => navigate('/student/dictation'));
  }, [listId, navigate]);

  const word = words[current];

  const speakPinyin = useCallback(() => {
    if (!word) return;
    void speakChineseWord(word.word, { rate: 0.8, cancelBefore: true });
  }, [word]);

  useEffect(() => {
    if (phase === 'practice' && word) {
      speakPinyin();
    }
  }, [current, phase, word, speakPinyin]);

  const handleSubmit = async () => {
    if (!word || busy) return;
    setBusy(true);
    let text = '';
    try {
      text = (await hwRef.current?.recognize?.())?.trim() ?? '';
    } catch (e) {
      console.error(e);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!text) return;
    const correct = text === word.word;
    const result = {
      word: word.word,
      pinyin: word.pinyin,
      input: text,
      correct,
      mistakeType: correct ? null : 'unknown',
    };
    setResults(prev => [...prev, result]);

    if (!correct) {
      setShowAnswer(true);
    } else {
      goNext();
    }
  };

  const goNext = () => {
    setShowAnswer(false);
    if (current + 1 >= words.length) {
      finishPractice();
    } else {
      setCurrent(c => c + 1);
    }
  };

  const finishPractice = async () => {
    setPhase('submitting');
    const durationSec = Math.round((Date.now() - startTime.current) / 1000);
    const allResults = [...results];
    try {
      const data = await api.submitDictation({ wordListId: parseInt(listId), results: allResults, durationSec });
      setSummary(data);
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

      <div className="practice-area">
        <div className="pinyin-display">{word?.pinyin}</div>
        <button className="btn-speak" onClick={speakPinyin} title="再听一次">🔊 听读音</button>

        {showAnswer ? (
          <div className="answer-reveal">
            <div className="correct-word">{word?.word}</div>
            <p className="hint-text">正确答案是这个字哦，记住它的样子！</p>
            <button className="btn-primary" onClick={goNext}>
              {current + 1 >= words.length ? '查看结果' : '下一个'}
            </button>
          </div>
        ) : (
          <div className="input-area tianzige-input-area">
            <TianZiGeHandwriting
              key={`${listId}-${current}`}
              ref={hwRef}
              charCount={Math.max(1, word?.word?.length || 1)}
            />
            <button className="btn-primary" onClick={handleSubmit} disabled={busy}>{busy ? '识别中…' : '确认'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
