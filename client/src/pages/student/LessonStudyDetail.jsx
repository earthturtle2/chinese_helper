import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';

export default function LessonStudyDetail() {
  const { textId, studentId: parentStudentId } = useParams();
  const navigate = useNavigate();
  const isParent = Boolean(parentStudentId);
  const listPath = isParent
    ? `/parent/children/${parentStudentId}/lesson-study`
    : '/student/lesson-study';

  const apiQuery = isParent ? { studentId: Number(parentStudentId) } : undefined;

  const [data, setData] = useState(null);
  const [reading, setReading] = useState(false);
  const utterRef = useRef(null);
  const [wordForm, setWordForm] = useState({ word: '', pinyin: '' });
  const [wordMsg, setWordMsg] = useState('');

  const load = useCallback(() => {
    api
      .getLessonStudyText(textId, apiQuery)
      .then(setData)
      .catch(() => navigate(listPath));
  }, [textId, apiQuery, navigate, listPath]);

  useEffect(() => {
    load();
  }, [load]);

  const stopReading = useCallback(() => {
    speechSynthesis.cancel();
    setReading(false);
    utterRef.current = null;
  }, []);

  const readFullText = useCallback(() => {
    if (!data?.content) return;
    stopReading();
    const u = new SpeechSynthesisUtterance(data.content);
    u.lang = 'zh-CN';
    u.rate = 0.92;
    u.onend = () => setReading(false);
    u.onerror = () => setReading(false);
    utterRef.current = u;
    setReading(true);
    speechSynthesis.speak(u);
  }, [data?.content, stopReading]);

  useEffect(() => {
    return () => {
      speechSynthesis.cancel();
    };
  }, []);

  const addWord = async () => {
    const w = wordForm.word.trim();
    if (!w) return;
    setWordMsg('');
    try {
      const body = { word: w, pinyin: wordForm.pinyin.trim() };
      if (isParent) body.studentId = Number(parentStudentId);
      await api.addLessonWord(textId, body);
      setWordForm({ word: '', pinyin: '' });
      setWordMsg('已添加');
      load();
    } catch (e) {
      setWordMsg(e.message || '添加失败');
    }
  };

  const removeWord = async (wordId) => {
    if (!confirm('确定删除该生词？')) return;
    try {
      await api.deleteLessonWord(wordId);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  if (!data) return <div className="loading">加载中...</div>;

  const words = data.lessonWords || [];

  return (
    <div className="page lesson-study-detail">
      <div className="page-header page-header-study">
        <Link to={listPath} className="back-link">
          ← 返回课文列表
        </Link>
        <h2>{data.title}</h2>
        <p className="hint-text">
          {data.grade}年级 · {data.volume} · 第{data.unit}单元
        </p>
      </div>

      <div className="lesson-toolbar">
        <button
          type="button"
          className="btn-primary"
          onClick={reading ? stopReading : readFullText}
          disabled={!data.content}
        >
          {reading ? '⏹ 停止朗读' : '🔊 朗读全文'}
        </button>
        <span className="hint-text">使用浏览器语音合成朗读，可在系统设置中更换中文语音</span>
      </div>

      <div className="form-card lesson-original">
        <h3>课文正文</h3>
        <div className="lesson-original-body">{data.content}</div>
      </div>

      <div className="form-card lesson-words-section">
        <h3>本课默写生词</h3>
        <p className="hint-text">
          {isParent
            ? '以下生词保存到孩子的账号，孩子登录后可在本页默写。'
            : '自行添加本课要默写的字词；也可请家长在「家长看板」中代你添加。'}
        </p>

        <div className="form-row lesson-word-form">
          <input
            placeholder="汉字"
            value={wordForm.word}
            onChange={(e) => setWordForm((f) => ({ ...f, word: e.target.value }))}
          />
          <input
            placeholder="拼音"
            value={wordForm.pinyin}
            onChange={(e) => setWordForm((f) => ({ ...f, pinyin: e.target.value }))}
          />
          <button type="button" className="btn-primary" onClick={addWord}>
            添加
          </button>
        </div>
        {wordMsg && <p className="hint-text">{wordMsg}</p>}

        {words.length === 0 ? (
          <p className="empty-hint">尚未添加生词，请在上面的输入框中添加。</p>
        ) : (
          <>
            <ul className="lesson-word-chips editable">
              {words.map((w) => (
                <li key={w.id}>
                  <span className="lesson-word-chars">{w.word}</span>
                  <span className="lesson-word-py">{w.pinyin}</span>
                  <button type="button" className="btn-text lesson-word-remove" onClick={() => removeWord(w.id)}>
                    删除
                  </button>
                </li>
              ))}
            </ul>
            {!isParent && (
              <button
                type="button"
                className="btn-primary btn-lg"
                onClick={() => navigate(`/student/lesson-study/${textId}/dictation`)}
              >
                开始默写本课生词
              </button>
            )}
            {isParent && (
              <p className="hint-text">默写请让孩子使用学生账号进入本课，点击「开始默写本课生词」。</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
