import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';

export default function Dictation() {
  const [lists, setLists] = useState([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetcher = showAll ? api.getAllWordLists : api.getWordLists;
    fetcher().then(setLists).catch(console.error);
  }, [showAll]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>生词默写</h2>
        <label className="toggle-label">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
          显示所有年级
        </label>
      </div>

      <div className="card-list">
        {lists.map(list => (
          <Link key={list.id} to={`/student/dictation/${list.id}`} className="list-card">
            <div className="list-grade">{list.grade}年级</div>
            <div className="list-unit">第{list.unit}单元</div>
            <div className="list-title">{list.unit_title}</div>
          </Link>
        ))}
        {lists.length === 0 && <p className="empty-hint">暂无词表，请联系老师添加。</p>}
      </div>
    </div>
  );
}
