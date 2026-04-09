import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

const TEXTBOOKS = ['人教版', '苏教版', '北师大版'];

export default function Dictation() {
  const { user, refreshUser } = useAuth();
  const [lists, setLists] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [grade, setGrade] = useState(3);
  const [textbookVersion, setTextbookVersion] = useState('人教版');

  useEffect(() => {
    if (user?.grade) setGrade(user.grade);
    if (user?.textbookVersion) setTextbookVersion(user.textbookVersion);
  }, [user?.grade, user?.textbookVersion]);

  const persistPrefs = useCallback(async (nextGrade, nextTextbook) => {
    try {
      await api.updateStudentProfile({ grade: nextGrade, textbookVersion: nextTextbook });
      await refreshUser();
    } catch (e) {
      console.error(e);
    }
  }, [refreshUser]);

  const loadLists = useCallback(() => {
    const params = { grade, textbookVersion };
    const fetcher = showAll ? api.getAllWordLists : api.getWordLists;
    fetcher(params).then(setLists).catch(console.error);
  }, [grade, textbookVersion, showAll]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const onGradeChange = async (e) => {
    const g = Number(e.target.value);
    setGrade(g);
    await persistPrefs(g, textbookVersion);
  };

  const onTextbookChange = async (e) => {
    const t = e.target.value;
    setTextbookVersion(t);
    await persistPrefs(grade, t);
  };

  return (
    <div className="page">
      <div className="page-header page-header-study">
        <h2>生词默写</h2>
        <div className="study-filters">
          <label className="study-filter">
            <span className="study-filter-label">年级</span>
            <select value={grade} onChange={onGradeChange}>
              {[3, 4, 5, 6].map(g => (
                <option key={g} value={g}>{g}年级</option>
              ))}
            </select>
          </label>
          <label className="study-filter">
            <span className="study-filter-label">教材</span>
            <select value={textbookVersion} onChange={onTextbookChange}>
              {TEXTBOOKS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="toggle-label study-filter-toggle">
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            显示所有年级
          </label>
        </div>
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
