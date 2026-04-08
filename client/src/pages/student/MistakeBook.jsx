import { useState, useEffect } from 'react';
import { api } from '../../api';

export default function MistakeBook() {
  const [mistakes, setMistakes] = useState([]);
  const [reviewWords, setReviewWords] = useState([]);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    api.getMistakes().then(setMistakes).catch(console.error);
    api.getReviewMistakes().then(setReviewWords).catch(console.error);
  }, []);

  const display = tab === 'review' ? reviewWords : mistakes;

  return (
    <div className="page">
      <h2>错词本</h2>
      <div className="tab-bar">
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          全部错词 ({mistakes.length})
        </button>
        <button className={`tab ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}>
          今日待复习 ({reviewWords.length})
        </button>
      </div>

      <div className="mistake-list">
        {display.map((m, i) => (
          <div key={i} className="mistake-card">
            <div className="mistake-word">{m.word}</div>
            <div className="mistake-pinyin">{m.pinyin}</div>
            <div className="mistake-info">
              <span className="mistake-type">{formatType(m.mistake_type)}</span>
              {m.mistake_count && <span className="mistake-count">错 {m.mistake_count} 次</span>}
            </div>
          </div>
        ))}
        {display.length === 0 && (
          <p className="empty-hint">{tab === 'review' ? '今天没有需要复习的错词，太棒了！' : '还没有错词，继续保持！'}</p>
        )}
      </div>
    </div>
  );
}

function formatType(type) {
  const map = { similar: '形近混淆', missing_stroke: '笔画缺失', unknown: '待分类' };
  return map[type] || type || '待分类';
}
