import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function RecitationPractice() {
  const { textId } = useParams();
  const navigate = useNavigate();
  const [text, setText] = useState(null);
  const [phase, setPhase] = useState('preview');
  const [recognized, setRecognized] = useState('');
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState(null);
  const [usedHints, setUsedHints] = useState(0);
  const startTime = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    api.getRecitationText(textId).then(setText).catch(() => navigate('/student/recitation'));
  }, [textId, navigate]);

  const startRecording = () => {
    setRecognized('');
    setRecording(true);
    startTime.current = Date.now();

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;

      let finalText = '';
      recognition.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            finalText += e.results[i][0].transcript;
          } else {
            interim = e.results[i][0].transcript;
          }
        }
        setRecognized(finalText + interim);
      };

      recognition.onerror = () => setRecording(false);
      recognition.onend = () => {
        if (recording) setRecognized(finalText);
      };

      recognition.start();
      recognitionRef.current = recognition;
    }
    setPhase('recording');
  };

  const stopRecording = () => {
    setRecording(false);
    recognitionRef.current?.stop();
    setPhase('reviewing');
  };

  const handleSubmit = async () => {
    setPhase('submitting');
    const durationSec = Math.round((Date.now() - startTime.current) / 1000);
    try {
      const data = await api.submitRecitation({
        textId: parseInt(textId),
        recognizedText: recognized,
        durationSec,
        usedHints,
      });
      setResult(data);
      setPhase('done');
    } catch {
      setPhase('reviewing');
    }
  };

  const showHint = () => {
    setUsedHints(h => h + 1);
  };

  if (!text) return <div className="loading">加载中...</div>;

  if (phase === 'done' && result) {
    return (
      <div className="page recitation-done">
        <div className="result-card">
          <h2>背诵评估完成</h2>
          <div className="score-circle">
            <div className="score-value">{result.totalScore}</div>
            <div className="score-label">综合评分</div>
          </div>
          <div className="score-details">
            <div className="score-item">
              <span>准确率</span><span>{result.accuracy}%</span>
            </div>
            <div className="score-item">
              <span>流利度</span><span>{result.fluency}%</span>
            </div>
            <div className="score-item">
              <span>完整度</span><span>{result.completeness}%</span>
            </div>
          </div>
          {result.details?.sentences && (
            <div className="sentence-feedback">
              <h3>逐句反馈</h3>
              {result.details.sentences.map((s, i) => (
                <div key={i} className={`sentence-item status-${s.status}`}>
                  <div className="sentence-original">{s.original}</div>
                  {s.status !== 'correct' && s.recognized && (
                    <div className="sentence-recognized">你说的：{s.recognized}</div>
                  )}
                  <span className="sentence-badge">
                    {s.status === 'correct' ? '✓ 正确' : s.status === 'missing' ? '✗ 遗漏' : s.status === 'error' ? '✗ 有误' : '~ 接近'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="result-actions">
            <button className="btn-primary" onClick={() => navigate('/student/recitation')}>返回</button>
            <button className="btn-secondary" onClick={() => { setPhase('preview'); setResult(null); setRecognized(''); }}>再试一次</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page recitation-practice">
      <h2>{text.title}</h2>

      {phase === 'preview' && (
        <div className="preview-section">
          <p className="hint-text">先看看原文，准备好了就开始背诵吧！</p>
          <div className="original-text">{text.content}</div>
          <button className="btn-primary btn-lg" onClick={startRecording}>开始背诵</button>
        </div>
      )}

      {(phase === 'recording' || phase === 'reviewing') && (
        <div className="recording-section">
          {phase === 'recording' && (
            <div className="recording-indicator">
              <div className="pulse-dot" />
              <span>正在录音...</span>
            </div>
          )}

          <div className="recognized-text">
            <h3>识别内容</h3>
            <p>{recognized || '（等待语音输入...）'}</p>
          </div>

          {phase === 'recording' ? (
            <div className="recording-actions">
              <button className="btn-hint" onClick={showHint}>💡 提示</button>
              <button className="btn-danger btn-lg" onClick={stopRecording}>停止录音</button>
            </div>
          ) : (
            <div className="review-actions">
              <textarea
                className="edit-recognized"
                value={recognized}
                onChange={e => setRecognized(e.target.value)}
                placeholder="如果语音识别不准确，可以在这里手动修改"
                rows={5}
              />
              <p className="hint-text">可以手动修正识别内容后再提交</p>
              <div className="btn-group">
                <button className="btn-secondary" onClick={startRecording}>重新录音</button>
                <button className="btn-primary btn-lg" onClick={handleSubmit}>提交评估</button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'submitting' && <div className="loading">正在评估...</div>}
    </div>
  );
}
