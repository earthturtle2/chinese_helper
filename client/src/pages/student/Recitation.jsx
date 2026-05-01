import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/useAuth';

const TEXTBOOKS = ['统编版', '人教版', '苏教版', '北师大版'];
const VOLUMES = ['上册', '下册'];

export default function Recitation() {
  const { user, refreshUser } = useAuth();
  const [texts, setTexts] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [grade, setGrade] = useState(user?.grade || 3);
  const [textbookVersion, setTextbookVersion] = useState(user?.textbookVersion || '统编版');
  const [textbookVolume, setTextbookVolume] = useState(user?.textbookVolume || '上册');

  const persistPrefs = useCallback(async (nextGrade, nextTextbook, nextVolume) => {
    try {
      await api.updateStudentProfile({
        grade: nextGrade,
        textbookVersion: nextTextbook,
        textbookVolume: nextVolume,
      });
      await refreshUser();
    } catch (e) {
      console.error(e);
    }
  }, [refreshUser]);

  const loadTexts = useCallback(() => {
    const params = { grade, textbookVersion, textbookVolume };
    const fetcher = showAll ? api.getAllRecitationTexts : api.getRecitationTexts;
    fetcher(params).then(setTexts).catch(console.error);
  }, [grade, textbookVersion, textbookVolume, showAll]);

  useEffect(() => {
    loadTexts();
  }, [loadTexts]);

  const onGradeChange = async (e) => {
    const g = Number(e.target.value);
    setGrade(g);
    await persistPrefs(g, textbookVersion, textbookVolume);
  };

  const onTextbookChange = async (e) => {
    const t = e.target.value;
    setTextbookVersion(t);
    await persistPrefs(grade, t, textbookVolume);
  };

  const onVolumeChange = async (e) => {
    const v = e.target.value;
    setTextbookVolume(v);
    await persistPrefs(grade, textbookVersion, v);
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
          <label className="study-filter">
            <span className="study-filter-label">分册</span>
            <select value={textbookVolume} onChange={onVolumeChange}>
              {VOLUMES.map(v => (
                <option key={v} value={v}>{v}</option>
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
            <div className="list-grade">{t.grade}年级 · {t.volume}</div>
            <div className="list-unit">第{t.unit}单元</div>
            <div className="list-title">{t.title}</div>
          </Link>
        ))}
        {texts.length === 0 && <p className="empty-hint">暂无课文，请联系老师添加。</p>}
      </div>
    </div>
  );
}
