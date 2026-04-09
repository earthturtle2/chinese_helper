import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

const TEXTBOOKS = ['人教版', '苏教版', '北师大版'];

export default function Recitation() {
  const { user, refreshUser } = useAuth();
  const [texts, setTexts] = useState([]);
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

  const loadTexts = useCallback(() => {
    const params = { grade, textbookVersion };
    const fetcher = showAll ? api.getAllRecitationTexts : api.getRecitationTexts;
    fetcher(params).then(setTexts).catch(console.error);
  }, [grade, textbookVersion, showAll]);

  useEffect(() => {
    loadTexts();
  }, [loadTexts]);

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
        <h2>检查背诵</h2>
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
