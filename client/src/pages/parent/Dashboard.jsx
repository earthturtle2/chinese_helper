import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

export default function ParentDashboard() {
  const { user } = useAuth();
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [overview, setOverview] = useState(null);
  const [mistakes, setMistakes] = useState([]);
  const [dailyLimit, setDailyLimit] = useState(40);

  useEffect(() => {
    api.getChildren().then(kids => {
      setChildren(kids);
      if (kids.length > 0) setSelectedChild(kids[0]);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    api.getChildOverview(selectedChild.id).then(setOverview).catch(console.error);
    api.getChildMistakes(selectedChild.id).then(setMistakes).catch(console.error);
    setDailyLimit(selectedChild.daily_limit || 40);
  }, [selectedChild]);

  const handleLimitChange = async () => {
    await api.setChildDailyLimit(selectedChild.id, dailyLimit);
    alert(`已设置为每日${dailyLimit}分钟`);
  };

  if (children.length === 0) {
    return (
      <div className="page">
        <h2>家长看板</h2>
        <p className="empty-hint">暂未绑定学生，请联系管理员进行绑定。</p>
      </div>
    );
  }

  return (
    <div className="page parent-dashboard">
      <h2>家长看板</h2>

      {children.length > 1 && (
        <div className="child-tabs">
          {children.map(c => (
            <button
              key={c.id}
              className={`tab ${selectedChild?.id === c.id ? 'active' : ''}`}
              onClick={() => setSelectedChild(c)}
            >
              {c.display_name} ({c.grade}年级)
            </button>
          ))}
        </div>
      )}

      {overview && (
        <>
          <div className="overview-section">
            <h3>{overview.student.displayName} · 今日概览</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-number">{Math.round(overview.todayUsage)}</div>
                <div className="stat-label">今日学习(分钟)</div>
              </div>
              <div className="stat-card">
                <div className="stat-number">{overview.mistakeCount}</div>
                <div className="stat-label">待复习错词</div>
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-header">
              <h3>最近默写</h3>
            </div>
            {overview.recentDictation.length > 0 ? (
              <div className="record-list">
                {overview.recentDictation.map((d, i) => (
                  <div key={i} className="record-item">
                    <span>正确 {d.correct}/{d.total_words}</span>
                    <span className="record-score">{Math.round((d.correct / d.total_words) * 100)}%</span>
                    <span className="record-date">{d.created_at?.slice(5, 16)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="empty-hint">暂无记录</p>}
          </div>

          <div className="section">
            <h3>最近背诵</h3>
            {overview.recentRecitation.length > 0 ? (
              <div className="record-list">
                {overview.recentRecitation.map((r, i) => (
                  <div key={i} className="record-item">
                    <span>{r.text_title}</span>
                    <span className="record-score">{r.total_score}分</span>
                    <span className="record-date">{r.created_at?.slice(5, 16)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="empty-hint">暂无记录</p>}
          </div>

          <div className="section">
            <h3>错词本（前10个）</h3>
            {mistakes.length > 0 ? (
              <div className="mistake-list compact">
                {mistakes.slice(0, 10).map((m, i) => (
                  <span key={i} className="mistake-tag">
                    {m.word}<small>({m.pinyin})</small> × {m.mistake_count}
                  </span>
                ))}
              </div>
            ) : <p className="empty-hint">没有错词，很棒！</p>}
          </div>

          <div className="section">
            <h3>防沉迷设置</h3>
            <div className="limit-setting">
              <label>每日使用上限：</label>
              <input
                type="range"
                min="20"
                max="60"
                step="5"
                value={dailyLimit}
                onChange={e => setDailyLimit(+e.target.value)}
              />
              <span className="limit-value">{dailyLimit} 分钟</span>
              <button className="btn-primary btn-sm" onClick={handleLimitChange}>保存</button>
            </div>
          </div>

          <div className="parent-quick-links">
            <Link to={`/parent/children/${selectedChild.id}/lesson-study`} className="btn-secondary">
              课文学习 · 管理课内生词
            </Link>
            <Link to={`/parent/children/${selectedChild.id}/recitation`} className="btn-secondary">
              检查背诵 · 选段背诵
            </Link>
            <Link to={`/parent/weekly/${selectedChild.id}`} className="btn-secondary">查看本周详细报告</Link>
          </div>
        </>
      )}
    </div>
  );
}
