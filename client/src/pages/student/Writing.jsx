import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function Writing() {
  const navigate = useNavigate();
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [customTopic, setCustomTopic] = useState('');
  const [selectedType, setSelectedType] = useState('记事');

  useEffect(() => {
    api.getTopics().then(setTopics).catch(console.error);
    api.getWritingSessions().then(setSessions).catch(console.error);
  }, []);

  const startSession = async (topic, type) => {
    const data = await api.createWritingSession({ topic, topicType: type });
    navigate(`/student/writing/${data.id}`);
  };

  const handleCustom = async () => {
    if (!customTopic.trim()) return;
    await startSession(customTopic.trim(), selectedType);
  };

  return (
    <div className="page">
      <h2>写作指导</h2>

      <div className="writing-start">
        <h3>选择一个题目开始</h3>
        {topics.map(cat => (
          <div key={cat.type} className="topic-category">
            <h4>{cat.type}</h4>
            <div className="topic-list">
              {cat.examples.map(t => (
                <button key={t} className="topic-chip" onClick={() => startSession(t, cat.type)}>{t}</button>
              ))}
            </div>
          </div>
        ))}

        <div className="custom-topic">
          <h4>或自定义题目</h4>
          <div className="form-row">
            <input
              placeholder="输入你的作文题目"
              value={customTopic}
              onChange={e => setCustomTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCustom()}
            />
            <select value={selectedType} onChange={e => setSelectedType(e.target.value)}>
              {['记事', '写人', '写景', '状物', '想象'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="btn-primary" onClick={handleCustom} disabled={!customTopic.trim()}>开始写作</button>
          </div>
        </div>
      </div>

      {sessions.length > 0 && (
        <div className="recent-sessions">
          <h3>继续写作</h3>
          <div className="session-list">
            {sessions.map(s => (
              <div key={s.id} className="session-card" onClick={() => navigate(`/student/writing/${s.id}`)}>
                <div className="session-topic">{s.topic}</div>
                <div className="session-meta">
                  <span className="session-type">{s.topic_type}</span>
                  <span>{s.word_count}字</span>
                  <span className={`phase-badge phase-${s.phase}`}>{formatPhase(s.phase)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatPhase(phase) {
  const map = { inspire: '素材启发', outline: '搭建提纲', draft: '写作中', review: '已完成' };
  return map[phase] || phase;
}
