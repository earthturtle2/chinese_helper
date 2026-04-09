import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function RecitationPractice() {
  const { textId, studentId: studentIdParam } = useParams();
  const navigate = useNavigate();
  const studentId = studentIdParam != null && studentIdParam !== '' ? Number(studentIdParam) : null;

  const [text, setText] = useState(null);
  /** select: 在全文里划选；preview: 确认选段后看要点；recording / reviewing / submitting / done */
  const [phase, setPhase] = useState('select');
  const [selectedSegment, setSelectedSegment] = useState('');
  const [recognized, setRecognized] = useState('');
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState(null);
  const [usedHints, setUsedHints] = useState(0);
  const startTime = useRef(null);
  const recognitionRef = useRef(null);
  const articleRef = useRef(null);

  const recitationListPath =
    studentId != null && !Number.isNaN(studentId)
      ? `/parent/children/${studentId}/recitation`
      : '/student/recitation';

  useEffect(() => {
    api
      .getRecitationText(textId)
      .then(setText)
      .catch(() => navigate(recitationListPath));
  }, [textId, navigate, recitationListPath]);

  const captureSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const raw = sel.toString();
    const t = raw.replace(/\u200b/g, '').trim();
    if (t.length < 2) {
      alert('请先按住鼠标拖选一段课文（至少两个字）');
      return;
    }
    setSelectedSegment(t);
    setPhase('preview');
    sel.removeAllRanges();
  };

  const useFullText = () => {
    if (!text?.content) return;
    setSelectedSegment(text.content.trim());
    setPhase('preview');
  };

  const startRecording = () => {
    if (!selectedSegment.trim()) {
      alert('请先选段或选择背诵全文');
      return;
    }
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
        setRecognized(finalText);
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
    const body = {
      textId: parseInt(textId, 10),
      recognizedText: recognized,
      durationSec,
      usedHints,
      selectedContent: selectedSegment.trim(),
    };
    if (studentId != null && !Number.isNaN(studentId)) {
      body.studentId = studentId;
    }
    try {
      const data = await api.submitRecitation(body);
      setResult(data);
      setPhase('done');
    } catch {
      setPhase('reviewing');
    }
  };

  const showHint = () => {
    setUsedHints((h) => h + 1);
  };

  const resetPractice = () => {
    setPhase('select');
    setSelectedSegment('');
    setResult(null);
    setRecognized('');
    setUsedHints(0);
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
              <span>准确率</span>
              <span>{result.accuracy}%</span>
            </div>
            <div className="score-item">
              <span>流利度</span>
              <span>{result.fluency}%</span>
            </div>
            <div className="score-item">
              <span>完整度</span>
              <span>{result.completeness}%</span>
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
                    {s.status === 'correct'
                      ? '✓ 正确'
                      : s.status === 'missing'
                        ? '✗ 遗漏'
                        : s.status === 'error'
                          ? '✗ 有误'
                          : '~ 接近'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="result-actions">
            <button className="btn-primary" onClick={() => navigate(recitationListPath)}>
              返回
            </button>
            <button className="btn-secondary" onClick={resetPractice}>
              再试一次
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page recitation-practice">
      <h2>{text.title}</h2>
      <p className="hint-text">
        {text.grade}年级 · {text.volume || '上册'} · 第{text.unit}单元
      </p>

      {phase === 'select' && (
        <div className="preview-section recitation-select-phase">
          <p className="hint-text">
            在下方课文中<strong>用鼠标拖选一段</strong>，点「使用选中内容」；或点「背诵全文」。
          </p>
          <div ref={articleRef} className="original-text recitation-selectable">
            {text.content}
          </div>
          <div className="recitation-select-actions">
            <button type="button" className="btn-secondary" onClick={captureSelection}>
              使用选中内容
            </button>
            <button type="button" className="btn-primary" onClick={useFullText}>
              背诵全文
            </button>
          </div>
        </div>
      )}

      {phase === 'preview' && (
        <div className="preview-section">
          <p className="hint-text">本次背诵范围如下，准备好后点击「开始背诵」。</p>
          <div className="original-text recitation-segment-preview">{selectedSegment}</div>
          <div className="btn-group" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={() => setPhase('select')}>
              重新选段
            </button>
            <button type="button" className="btn-primary btn-lg" onClick={startRecording}>
              开始背诵
            </button>
          </div>
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
              <button type="button" className="btn-hint" onClick={showHint}>
                💡 提示
              </button>
              <button type="button" className="btn-danger btn-lg" onClick={stopRecording}>
                停止录音
              </button>
            </div>
          ) : (
            <div className="review-actions">
              <textarea
                className="edit-recognized"
                value={recognized}
                onChange={(e) => setRecognized(e.target.value)}
                placeholder="如果语音识别不准确，可以在这里手动修改"
                rows={5}
              />
              <p className="hint-text">可以手动修正识别内容后再提交</p>
              <div className="btn-group">
                <button type="button" className="btn-secondary" onClick={startRecording}>
                  重新录音
                </button>
                <button type="button" className="btn-primary btn-lg" onClick={handleSubmit}>
                  提交评估
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'submitting' && <div className="loading">正在评估...</div>}
    </div>
  );
}
