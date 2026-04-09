import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

export default function StudentHome() {
  const { user } = useAuth();
  const [history, setHistory] = useState({ dictation: [], recitation: [], writing: [] });

  useEffect(() => {
    Promise.all([
      api.getDictationHistory().catch(() => []),
      api.getRecitationHistory().catch(() => []),
      api.getWritingSessions().catch(() => []),
    ]).then(([d, r, w]) => setHistory({ dictation: d.slice(0, 3), recitation: r.slice(0, 3), writing: w.slice(0, 3) }));
  }, []);

  const usagePercent = user?.dailyLimit ? Math.min(100, Math.round((user.todayUsage / user.dailyLimit) * 100)) : 0;

  return (
    <div className="page student-home">
      <div className="welcome-section">
        <h2>你好，{user?.displayName || user?.username}！</h2>
        <p className="subtitle">
          默写、背诵中可按年级与教材版本浏览 · 当前 {user?.grade}年级 · {user?.textbookVersion}
          {user?.textbookVolume ? ` · ${user.textbookVolume}` : ''}
        </p>
        <div className="usage-bar">
          <div className="usage-fill" style={{ width: `${usagePercent}%` }} />
          <span className="usage-text">今日已学习 {Math.round(user?.todayUsage || 0)} / {user?.dailyLimit || 40} 分钟</span>
        </div>
      </div>

      <div className="module-grid">
        <Link to="/student/dictation" className="module-card card-dictation">
          <div className="module-icon">✍️</div>
          <h3>生词默写</h3>
          <p>听读音写汉字，巩固生字词</p>
        </Link>
        <Link to="/student/recitation" className="module-card card-recitation">
          <div className="module-icon">🎤</div>
          <h3>检查背诵</h3>
          <p>朗读课文，检测准确度</p>
        </Link>
        <Link to="/student/writing" className="module-card card-writing">
          <div className="module-icon">📝</div>
          <h3>写作指导</h3>
          <p>引导启发，一步步写好作文</p>
        </Link>
        <Link to="/student/mistakes" className="module-card card-mistakes">
          <div className="module-icon">📖</div>
          <h3>错词本</h3>
          <p>复习写错的字词</p>
        </Link>
      </div>

      <div className="recent-section">
        <h3>最近练习</h3>
        {history.dictation.length === 0 && history.recitation.length === 0 && history.writing.length === 0 ? (
          <p className="empty-hint">还没有练习记录，点击上方模块开始吧！</p>
        ) : (
          <div className="recent-list">
            {history.dictation.map((d, i) => (
              <div key={`d${i}`} className="recent-item">
                <span className="recent-type">默写</span>
                <span>{d.unit_title}</span>
                <span className="recent-score">{Math.round((d.correct / d.total_words) * 100)}%</span>
                <span className="recent-date">{d.created_at?.slice(5, 10)}</span>
              </div>
            ))}
            {history.recitation.map((r, i) => (
              <div key={`r${i}`} className="recent-item">
                <span className="recent-type type-recitation">背诵</span>
                <span>{r.text_title}</span>
                <span className="recent-score">{r.total_score}分</span>
                <span className="recent-date">{r.created_at?.slice(5, 10)}</span>
              </div>
            ))}
            {history.writing.map((w, i) => (
              <div key={`w${i}`} className="recent-item">
                <span className="recent-type type-writing">写作</span>
                <span>{w.topic}</span>
                <span className="recent-score">{w.word_count}字</span>
                <span className="recent-date">{w.updated_at?.slice(5, 10)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
