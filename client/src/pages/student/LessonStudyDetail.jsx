import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import {
  enqueueChineseLongText,
  stopChineseSpeech,
  pauseFullTextSpeech,
  resumeFullTextSpeech,
} from '../../utils/speechChinese';
import { useTtsEngine } from '../../hooks/useTtsEngine';
import TtsEngineBadge from '../../components/TtsEngineBadge';

export default function LessonStudyDetail() {
  const { textId, studentId: parentStudentId } = useParams();
  const navigate = useNavigate();
  const isParent = Boolean(parentStudentId);
  const listPath = isParent
    ? `/parent/children/${parentStudentId}/lesson-study`
    : '/student/lesson-study';

  const apiQuery = useMemo(
    () => (isParent ? { studentId: Number(parentStudentId) } : undefined),
    [isParent, parentStudentId]
  );

  const [data, setData] = useState(null);
  const [reading, setReading] = useState(false);
  const [readingPaused, setReadingPaused] = useState(false);
  const [ttsError, setTtsError] = useState('');
  const [wordForm, setWordForm] = useState({ word: '' });
  const [wordMsg, setWordMsg] = useState('');
  const ttsEngine = useTtsEngine();

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
    stopChineseSpeech();
    setReading(false);
    setReadingPaused(false);
  }, []);

  const pauseReading = useCallback(() => {
    pauseFullTextSpeech();
    setReadingPaused(true);
  }, []);

  const resumeReading = useCallback(() => {
    resumeFullTextSpeech();
    setReadingPaused(false);
  }, []);

  const readFullText = useCallback(() => {
    if (!data?.content) return;
    setTtsError('');
    setReadingPaused(false);
    setReading(true);
    void enqueueChineseLongText(data.content, {
      rate: 0.92,
      onComplete: () => {
        setReading(false);
        setReadingPaused(false);
      },
      onError: () => {
        setReading(false);
        setReadingPaused(false);
        setTtsError('朗读失败：当前浏览器可能不支持中文语音，请尝试使用 Chrome 浏览器，或在系统设置中安装中文语音引擎。');
      },
    });
  }, [data]);

  useEffect(() => {
    return () => {
      stopChineseSpeech();
    };
  }, []);

  const addWord = async (wordOverride) => {
    const raw = wordOverride != null ? String(wordOverride) : wordForm.word;
    const w = raw.trim();
    if (!w) return;
    setWordMsg('');
    try {
      const body = { word: w };
      if (isParent) body.studentId = Number(parentStudentId);
      await api.addLessonWord(textId, body);
      setWordForm({ word: '' });
      setWordMsg('已添加，拼音已自动生成');
      load();
    } catch (e) {
      setWordMsg(e.message || '添加失败');
    }
  };

  const addSelectedFromLesson = async () => {
    const sel = window.getSelection();
    const t = sel && sel.toString ? sel.toString().trim() : '';
    if (!t) {
      setWordMsg('请先在课文正文中用手指或鼠标拖选要添加的字或词');
      return;
    }
    const cleaned = t.replace(/[^\u4e00-\u9fff]/g, '');
    if (!cleaned) {
      setWordMsg('请只选择汉字');
      return;
    }
    if (cleaned.length > 24) {
      setWordMsg('一次最多添加 24 个汉字');
      return;
    }
    await addWord(cleaned);
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
        <div className="lesson-reading-controls">
          {!reading && (
            <button type="button" className="btn-primary" onClick={readFullText} disabled={!data.content}>
              🔊 朗读全文
            </button>
          )}
          {reading && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={pauseReading}
                disabled={readingPaused}
              >
                ⏸ 暂停
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={resumeReading}
                disabled={!readingPaused}
              >
                ▶ 继续
              </button>
              <button type="button" className="btn-primary" onClick={stopReading}>
                ⏹ 停止
              </button>
            </>
          )}
        </div>
        {ttsError && <p className="hint-text" style={{ color: '#c00', margin: '8px 0' }}>{ttsError}</p>}
        <div className="lesson-toolbar-tts">
          <TtsEngineBadge
            loading={ttsEngine.loading}
            piperAvailable={ttsEngine.piperAvailable}
            preferredEngine={ttsEngine.preferredEngine}
          />
          <p className="hint-text lesson-toolbar-hint">
            {ttsEngine.loading
              ? '正在检测朗读方式…'
              : ttsEngine.preferredEngine === 'kokoro'
                ? '将优先在浏览器内使用 Kokoro 中文 ONNX（需下载约百兆级模型，首启较慢；长文自动分段）。失败时会依次尝试 Piper 与系统语音。'
                : ttsEngine.piperAvailable
                  ? '将优先使用 Piper 合成全文（长文按句分段）。Piper 对多音字、声调的预测有限，可能与教材不完全一致；需要浏览器端 Kokoro 时请管理员在后台切换（会下载较大模型）。'
                  : '将使用浏览器调用的系统中文语音；长课文会自动分段。可在系统设置中更换语音。'}
          </p>
        </div>
      </div>

      <div className="form-card lesson-original">
        <h3>课文正文</h3>
        <p className="hint-text">在下方正文中用手指或鼠标拖选字词，再点「将选中的字词加入生词」（拼音会自动生成）。</p>
        <div className="lesson-original-body lesson-original-selectable">{data.content}</div>
        <div className="lesson-selection-bar">
          <button type="button" className="btn-secondary" onClick={addSelectedFromLesson}>
            将选中的字词加入生词
          </button>
        </div>
      </div>

      <div className="form-card lesson-words-section">
        <h3>本课默写生词</h3>
        <p className="hint-text">
          {isParent
            ? '以下生词保存到孩子的账号；添加后拼音会自动生成，孩子可在「生词默写」中选用本课。'
            : '手动输入或在正文中选词添加；保存后拼音自动生成。已添加生词的课文会出现在「生词默写」中。'}
        </p>

        <div className="form-row lesson-word-form">
          <input
            placeholder="手动输入汉字（无需填拼音）"
            value={wordForm.word}
            onChange={(e) => setWordForm((f) => ({ ...f, word: e.target.value }))}
            maxLength={32}
          />
          <button type="button" className="btn-primary" onClick={() => addWord()}>
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
