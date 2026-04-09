import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';

const TEXTBOOKS = ['统编版', '人教版', '苏教版', '北师大版'];
const VOLUMES = ['上册', '下册'];

/** 家长代子女浏览课文列表；筛选仅影响当前列表，不修改孩子账号设置 */
export default function ParentLessonStudy() {
  const { studentId } = useParams();
  const sid = studentId ? Number(studentId) : NaN;
  const [texts, setTexts] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [grade, setGrade] = useState(3);
  const [textbookVersion, setTextbookVersion] = useState('统编版');
  const [textbookVolume, setTextbookVolume] = useState('上册');
  const [childName, setChildName] = useState('');

  useEffect(() => {
    if (Number.isNaN(sid)) return;
    api.getChildren().then((kids) => {
      const c = kids.find((k) => k.id === sid);
      if (c) {
        setChildName(c.display_name || c.username);
        setGrade(c.grade ?? 3);
        setTextbookVersion(c.textbook_version || '统编版');
        setTextbookVolume(c.textbook_volume || '上册');
      }
    });
  }, [sid]);

  const loadTexts = useCallback(() => {
    if (Number.isNaN(sid)) return;
    const params = { grade, textbookVersion, textbookVolume, studentId: sid };
    const fetcher = showAll ? api.getAllLessonStudyTexts : api.getLessonStudyTexts;
    fetcher(params).then(setTexts).catch(console.error);
  }, [grade, textbookVersion, textbookVolume, showAll, sid]);

  useEffect(() => {
    loadTexts();
  }, [loadTexts]);

  if (Number.isNaN(sid)) {
    return (
      <div className="page">
        <p className="empty-hint">无效链接</p>
      </div>
    );
  }

  const base = `/parent/children/${sid}/lesson-study`;

  return (
    <div className="page">
      <div className="page-header page-header-study">
        <Link to="/parent" className="back-link">
          ← 返回家长看板
        </Link>
        <h2>课文学习（{childName || '…'}）</h2>
        <span className="hint-text">为孩子添加本课默写生词；默写练习请孩子登录学生账号完成</span>
        <div className="study-filters">
          <label className="study-filter">
            <span className="study-filter-label">年级</span>
            <select value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {[3, 4, 5, 6].map((g) => (
                <option key={g} value={g}>
                  {g}年级
                </option>
              ))}
            </select>
          </label>
          <label className="study-filter">
            <span className="study-filter-label">教材</span>
            <select value={textbookVersion} onChange={(e) => setTextbookVersion(e.target.value)}>
              {TEXTBOOKS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="study-filter">
            <span className="study-filter-label">分册</span>
            <select value={textbookVolume} onChange={(e) => setTextbookVolume(e.target.value)}>
              {VOLUMES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-label study-filter-toggle">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            显示所有年级
          </label>
        </div>
      </div>

      <div className="card-list">
        {texts.map((t) => (
          <Link key={t.id} to={`${base}/${t.id}`} className="list-card">
            <div className="list-grade">
              {t.grade}年级 · {t.volume}
            </div>
            <div className="list-unit">第{t.unit}单元</div>
            <div className="list-title">{t.title}</div>
          </Link>
        ))}
        {texts.length === 0 && <p className="empty-hint">暂无课文</p>}
      </div>
    </div>
  );
}
