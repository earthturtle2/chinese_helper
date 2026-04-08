import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

export default function Recitation() {
  const [texts, setTexts] = useState([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetcher = showAll ? api.getAllRecitationTexts : api.getRecitationTexts;
    fetcher().then(setTexts).catch(console.error);
  }, [showAll]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>检查背诵</h2>
        <label className="toggle-label">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          显示所有年级
        </label>
      </div>

      <div className="card-list">
        {texts.map(t => (
          <Link key={t.id} to={`/student/recitation/${t.id}`} className="list-card">
            <div className="list-grade">{t.grade}年级</div>
            <div className="list-unit">第{t.unit}单元</div>
            <div className="list-title">{t.title}</div>
          </Link>
        ))}
        {texts.length === 0 && <p className="empty-hint">暂无课文，请联系老师添加。</p>}
      </div>
    </div>
  );
}
