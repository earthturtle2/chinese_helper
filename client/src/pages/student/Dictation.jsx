import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

const TEXTBOOKS = ['统编版', '人教版', '苏教版', '北师大版'];
const VOLUMES = ['上册', '下册'];

export default function Dictation() {
  const { user, refreshUser } = useAuth();
  const [lists, setLists] = useState([]);
  const [lessonTexts, setLessonTexts] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [grade, setGrade] = useState(3);
  const [textbookVersion, setTextbookVersion] = useState('统编版');
  const [textbookVolume, setTextbookVolume] = useState('上册');

  useEffect(() => {
    if (user?.grade) setGrade(user.grade);
    if (user?.textbookVersion) setTextbookVersion(user.textbookVersion);
    if (user?.textbookVolume) setTextbookVolume(user.textbookVolume);
  }, [user?.grade, user?.textbookVersion, user?.textbookVolume]);

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

  const loadLists = useCallback(() => {
    const params = { grade, textbookVersion };
    const fetcher = showAll ? api.getAllWordLists : api.getWordLists;
    fetcher(params).then(setLists).catch(console.error);
  }, [grade, textbookVersion, showAll]);

  const loadLessonTexts = useCallback(() => {
    const params = { grade, textbookVersion, textbookVolume, all: showAll };
    api.getLessonDictationTexts(params).then(setLessonTexts).catch(console.error);
  }, [grade, textbookVersion, textbookVolume, showAll]);

  useEffect(() => {
    loadLists();
    loadLessonTexts();
  }, [loadLists, loadLessonTexts]);

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
          <label className="study-filter">
            <span className="study-filter-label">分册</span>
            <select value={textbookVolume} onChange={onVolumeChange}>
              {VOLUMES.map((v) => (
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

      <h3 className="dictation-subsection-title">课文生词</h3>
      <p className="hint-text dictation-subsection-hint">
        与「课文学习」联动：仅列出你已为本课添加过默写生词的课文；点击进入默写。
      </p>
      <div className="card-list">
        {lessonTexts.map((t) => (
          <Link
            key={`lesson-${t.id}`}
            to={`/student/lesson-study/${t.id}/dictation`}
            className="list-card list-card-lesson"
          >
            <div className="list-grade">{t.grade}年级 · {t.volume}</div>
            <div className="list-unit">第{t.unit}单元</div>
            <div className="list-title">{t.title}</div>
            <div className="list-meta">共 {t.word_count} 个生词</div>
          </Link>
        ))}
        {lessonTexts.length === 0 && (
          <p className="empty-hint">暂无课文生词。请先在「课文学习」中添加本课默写生词。</p>
        )}
      </div>

      <h3 className="dictation-subsection-title">单元词表</h3>
      <p className="hint-text dictation-subsection-hint">系统预置单元词表默写。</p>
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
