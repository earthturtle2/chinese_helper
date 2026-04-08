import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function ParentWeekly() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getChildWeekly(studentId).then(setData).catch(() => navigate('/parent'));
  }, [studentId, navigate]);

  if (!data) return <div className="loading">加载中...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate('/parent')}>← 返回</button>
        <h2>本周学习报告</h2>
      </div>

      <div className="weekly-section">
        <h3>默写统计</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{data.dictation.sessions}</div>
            <div className="stat-label">练习次数</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{data.dictation.totalWords}</div>
            <div className="stat-label">练习字数</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{data.dictation.accuracy}%</div>
            <div className="stat-label">正确率</div>
          </div>
        </div>
      </div>

      <div className="weekly-section">
        <h3>背诵统计</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">{data.recitation.sessions}</div>
            <div className="stat-label">背诵次数</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{data.recitation.avgScore}</div>
            <div className="stat-label">平均评分</div>
          </div>
        </div>
        {data.recitation.details.length > 0 && (
          <div className="record-list">
            {data.recitation.details.map((r, i) => (
              <div key={i} className="record-item">
                <span>{r.text_title}</span>
                <span>准确{r.accuracy}%</span>
                <span>评分{r.total_score}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="weekly-section">
        <h3>高频错字 Top 5</h3>
        {data.topMistakes.length > 0 ? (
          <div className="top-mistakes">
            {data.topMistakes.map((m, i) => (
              <div key={i} className="top-mistake-item">
                <span className="rank">#{i + 1}</span>
                <span className="word">{m.word}</span>
                <span className="pinyin">{m.pinyin}</span>
                <span className="count">错 {m.mistake_count} 次</span>
              </div>
            ))}
          </div>
        ) : <p className="empty-hint">本周没有错字，非常棒！</p>}
      </div>

      <div className="weekly-section">
        <h3>每日学习时长</h3>
        <div className="usage-chart">
          {data.usage.map((u, i) => (
            <div key={i} className="usage-day">
              <div className="usage-bar-v" style={{ height: `${Math.min(100, (u.minutes / 40) * 100)}%` }} />
              <span className="usage-date">{u.date.slice(5)}</span>
              <span className="usage-min">{Math.round(u.minutes)}分</span>
            </div>
          ))}
          {data.usage.length === 0 && <p className="empty-hint">本周暂无学习记录</p>}
        </div>
      </div>
    </div>
  );
}
