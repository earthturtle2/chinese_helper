import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import TianZiGeHandwriting from '../../components/TianZiGeHandwriting';

export default function LessonDictationPractice() {
  const { textId } = useParams();
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
  const resultsRef = useRef([]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    api
      .getLessonStudyText(textId)
      .then((d) => {
        const list = (d.lessonWords || []).map((w) => ({
          word: w.word,
          pinyin: w.pinyin || '',
        }));
        if (list.length === 0) {
          setPhase('empty');
          return;
        }
        setWords(list);
        setPhase('practice');
      })
      .catch(() => navigate('/student/lesson-study'));
  }, [textId, navigate]);

  const word = words[current];

  const speakPinyin = useCallback(() => {
    if (!word) return;
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.8;
    speechSynthesis.speak(utterance);
  }, [word]);

  useEffect(() => {
    if (phase === 'practice' && word) {
      speakPinyin();
    }
  }, [current, phase, word, speakPinyin]);

  const finishWithResults = async (allResults) => {
    setPhase('submitting');
    const durationSec = Math.round((Date.now() - startTime.current) / 1000);
    try {
      const data = await api.submitDictation({
        recitationTextId: parseInt(textId, 10),
        results: allResults,
        durationSec,
      });
      setSummary(data);
      setResults(allResults);
      setPhase('done');
    } catch {
      setPhase('done');
    }
  };

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
    const nextResults = [...resultsRef.current, result];
    setResults(nextResults);
    resultsRef.current = nextResults;

    if (!correct) {
      setShowAnswer(true);
    } else if (current + 1 >= words.length) {
      finishWithResults(nextResults);
    } else {
      setCurrent((c) => c + 1);
    }
  };

  const goNext = () => {
    setShowAnswer(false);
    if (current + 1 >= words.length) {
      finishWithResults(resultsRef.current);
    } else {
      setCurrent((c) => c + 1);
    }
  };

  if (phase === 'loading') return <div className="loading">加载生词...</div>;

  if (phase === 'empty') {
    return (
      <div className="page">
        <p className="empty-hint">本课尚未配置默写生词。</p>
        <button className="btn-primary" onClick={() => navigate(`/student/lesson-study/${textId}`)}>
          返回课文
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="page dictation-done">
        <div className="result-card">
          <h2>默写完成！</h2>
          <div className="result-score">{summary?.accuracy ?? 0}%</div>
          <p>
            正确 {summary?.correct ?? 0} / {summary?.total ?? words.length}
          </p>
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
            <button className="btn-primary" onClick={() => navigate(`/student/lesson-study/${textId}`)}>
              返回课文
            </button>
            <button className="btn-secondary" onClick={() => navigate('/student/mistakes')}>
              查看错词本
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'submitting') return <div className="loading">提交中...</div>;

  return (
    <div className="page dictation-practice">
      <div className="practice-header">
        <span className="progress">
          {current + 1} / {words.length}
        </span>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${((current + 1) / words.length) * 100}%` }} />
        </div>
      </div>

      <div className="practice-area">
        <div className="pinyin-display">{word?.pinyin}</div>
        <button className="btn-speak" onClick={speakPinyin} title="再听一次">
          🔊 听读音
        </button>

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
              key={`${textId}-${current}`}
              ref={hwRef}
              charCount={Math.max(1, word?.word?.length || 1)}
            />
            <button className="btn-primary" onClick={handleSubmit} disabled={busy}>
              {busy ? '识别中…' : '确认'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
