import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function WritingSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [outline, setOutline] = useState({ opening: '', body: '', ending: '' });
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSession = useCallback(() => {
    api.getWritingSession(sessionId).then(s => {
      setSession(s);
      if (s.outline_json && Object.keys(s.outline_json).length) setOutline(s.outline_json);
      if (s.draft_text) setDraft(s.draft_text);
      if (s.feedback_json && Object.keys(s.feedback_json).length) setFeedback(s.feedback_json);
    }).catch(() => navigate('/student/writing'));
  }, [sessionId, navigate]);

  useEffect(() => { loadSession(); }, [loadSession]);

  const handleInspire = async () => {
    setLoading(true);
    try {
      const data = await api.inspireSession(sessionId);
      setQuestions(data.questions || []);
      loadSession();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSaveOutline = async () => {
    setSaving(true);
    await api.saveOutline(sessionId, outline);
    loadSession();
    setSaving(false);
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    await api.saveDraft(sessionId, draft);
    setSaving(false);
  };

  const handleGetFeedback = async () => {
    if (draft.replace(/\s/g, '').length < 20) {
      alert('写多一些再来获取反馈吧，至少写20个字哦！');
      return;
    }
    setLoading(true);
    await api.saveDraft(sessionId, draft);
    try {
      const fb = await api.getFeedback(sessionId);
      setFeedback(fb);
      loadSession();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (!session) return <div className="loading">加载中...</div>;

  const phase = session.phase;

  return (
    <div className="page writing-session">
      <div className="writing-header">
        <h2>{session.topic}</h2>
        <span className="type-badge">{session.topic_type}</span>
      </div>

      <div className="phase-nav">
        {['inspire', 'outline', 'draft', 'review'].map((p, i) => (
          <div key={p} className={`phase-step ${phase === p ? 'active' : ''} ${['inspire','outline','draft','review'].indexOf(phase) > i ? 'done' : ''}`}>
            {['素材启发', '搭建提纲', '写作', '反馈'][i]}
          </div>
        ))}
      </div>

      {phase === 'inspire' && (
        <div className="phase-content">
          <p className="phase-desc">让我们先想想可以写些什么...</p>
          {questions.length > 0 ? (
            <div className="questions-list">
              {questions.map((q, i) => (
                <div key={i} className="question-card">
                  <span className="q-number">{i + 1}</span>
                  <span className="q-text">{q}</span>
                </div>
              ))}
              <p className="hint-text">想好了吗？点击下方按钮进入提纲阶段</p>
              <button className="btn-primary" onClick={handleSaveOutline}>进入提纲</button>
            </div>
          ) : (
            <button className="btn-primary btn-lg" onClick={handleInspire} disabled={loading}>
              {loading ? '正在思考...' : '开始启发'}
            </button>
          )}
        </div>
      )}

      {phase === 'outline' && (
        <div className="phase-content">
          <p className="phase-desc">搭一个简单的框架，想想每部分写什么</p>
          <div className="outline-editor">
            <div className="outline-section">
              <label>开头（引入话题）</label>
              <textarea value={outline.opening} onChange={e => setOutline(o => ({ ...o, opening: e.target.value }))} placeholder="打算怎么开头？" rows={2} />
            </div>
            <div className="outline-section">
              <label>经过（主要内容）</label>
              <textarea value={outline.body} onChange={e => setOutline(o => ({ ...o, body: e.target.value }))} placeholder="中间要写哪些事情？" rows={3} />
            </div>
            <div className="outline-section">
              <label>结尾（总结感受）</label>
              <textarea value={outline.ending} onChange={e => setOutline(o => ({ ...o, ending: e.target.value }))} placeholder="打算怎么结尾？" rows={2} />
            </div>
          </div>
          <button className="btn-primary" onClick={handleSaveOutline} disabled={saving}>
            {saving ? '保存中...' : '保存提纲，开始写作'}
          </button>
        </div>
      )}

      {(phase === 'draft' || phase === 'review') && (
        <div className="phase-content">
          <div className="draft-editor">
            <div className="draft-toolbar">
              <span className="word-count">{draft.replace(/\s/g, '').length} 字</span>
              <button className="btn-sm" onClick={handleSaveDraft} disabled={saving}>
                {saving ? '保存中' : '保存草稿'}
              </button>
            </div>
            <textarea
              className="draft-textarea"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="开始写你的作文吧..."
              rows={15}
            />
          </div>

          {!feedback && (
            <button className="btn-primary btn-lg" onClick={handleGetFeedback} disabled={loading}>
              {loading ? '正在分析...' : '获取反馈'}
            </button>
          )}

          {feedback && (
            <div className="feedback-section">
              <h3>写作反馈</h3>
              {feedback.suggestions?.map((s, i) => (
                <div key={i} className="feedback-item">{s}</div>
              ))}
              {feedback.vocabularyHints?.length > 0 && (
                <div className="vocab-hints">
                  <h4>词汇小贴士</h4>
                  {feedback.vocabularyHints.map((v, i) => (
                    <div key={i} className="vocab-hint">
                      <span className="vocab-word">"{v.word}"</span>
                      <span className="vocab-arrow">→</span>
                      <span className="vocab-alts">{v.alternatives.join('、')}</span>
                    </div>
                  ))}
                </div>
              )}
              {feedback.llmFeedback && (
                <div className="llm-feedback">
                  <h4>老师点评</h4>
                  <p>{feedback.llmFeedback}</p>
                </div>
              )}
            </div>
          )}

          <button className="btn-secondary" onClick={() => navigate('/student/writing')}>返回</button>
        </div>
      )}
    </div>
  );
}
