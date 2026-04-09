import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';

const BATCH_JSON_HINT = `[\n  {\n    "textbookVersion": "统编版",\n    "grade": 3,\n    "volume": "上册",\n    "unit": 1,\n    "title": "课文标题",\n    "content": "正文全文……",\n    "sortOrder": 0\n  }\n]`;

export default function AdminContent() {
  const [wordLists, setWordLists] = useState([]);
  const [texts, setTexts] = useState([]);
  const [tab, setTab] = useState('words');
  const [textForm, setTextForm] = useState({
    textbookVersion: '统编版',
    grade: 3,
    volume: '上册',
    unit: 1,
    title: '',
    content: '',
    sortOrder: 0,
  });
  const [batchJson, setBatchJson] = useState('');
  const [textMsg, setTextMsg] = useState('');
  const [textErr, setTextErr] = useState('');

  const loadTexts = useCallback(() => {
    api.getAdminRecitationTexts().then(setTexts).catch(console.error);
  }, []);

  useEffect(() => {
    api.getAdminWordLists().then(setWordLists).catch(console.error);
    loadTexts();
  }, [loadTexts]);

  return (
    <div className="page">
      <h2>内容管理</h2>
      <div className="tab-bar">
        <button className={`tab ${tab === 'words' ? 'active' : ''}`} onClick={() => setTab('words')}>词表管理</button>
        <button className={`tab ${tab === 'texts' ? 'active' : ''}`} onClick={() => setTab('texts')}>课文管理</button>
      </div>

      {tab === 'words' && (
        <div>
          <table className="data-table">
            <thead>
              <tr><th>教材</th><th>年级</th><th>单元</th><th>标题</th></tr>
            </thead>
            <tbody>
              {wordLists.map(wl => (
                <tr key={wl.id}>
                  <td>{wl.textbook_version}</td>
                  <td>{wl.grade}年级</td>
                  <td>第{wl.unit}单元</td>
                  <td>{wl.unit_title}</td>
                </tr>
              ))}
              {wordLists.length === 0 && <tr><td colSpan="4" className="empty">暂无词表</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'texts' && (
        <div>
          <div className="form-card" style={{ marginBottom: '1.5rem' }}>
            <h3>单条录入</h3>
            {textErr && <div className="error-msg">{textErr}</div>}
            {textMsg && <div className="success-msg">{textMsg}</div>}
            <div className="form-row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <select
                value={textForm.textbookVersion}
                onChange={e => setTextForm(f => ({ ...f, textbookVersion: e.target.value }))}
              >
                <option value="统编版">统编版</option>
                <option value="人教版">人教版</option>
              </select>
              <select
                value={textForm.grade}
                onChange={e => setTextForm(f => ({ ...f, grade: +e.target.value }))}
              >
                {[3, 4, 5, 6].map(g => (
                  <option key={g} value={g}>{g}年级</option>
                ))}
              </select>
              <select
                value={textForm.volume}
                onChange={e => setTextForm(f => ({ ...f, volume: e.target.value }))}
              >
                <option value="上册">上册</option>
                <option value="下册">下册</option>
              </select>
              <label>
                单元
                <input
                  type="number"
                  min={1}
                  value={textForm.unit}
                  onChange={e => setTextForm(f => ({ ...f, unit: +e.target.value || 1 }))}
                  style={{ width: '4rem', marginLeft: '0.25rem' }}
                />
              </label>
              <label>
                排序
                <input
                  type="number"
                  min={0}
                  value={textForm.sortOrder}
                  onChange={e => setTextForm(f => ({ ...f, sortOrder: +e.target.value || 0 }))}
                  style={{ width: '4rem', marginLeft: '0.25rem' }}
                />
              </label>
            </div>
            <div className="form-row">
              <input
                placeholder="课文标题"
                value={textForm.title}
                onChange={e => setTextForm(f => ({ ...f, title: e.target.value }))}
                style={{ flex: 1, minWidth: '12rem' }}
              />
            </div>
            <textarea
              placeholder="课文正文（背诵评测以此为标准）"
              value={textForm.content}
              onChange={e => setTextForm(f => ({ ...f, content: e.target.value }))}
              rows={8}
              style={{ width: '100%', marginTop: '0.5rem' }}
            />
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: '0.75rem' }}
              onClick={async () => {
                setTextErr('');
                setTextMsg('');
                try {
                  await api.createRecitationText({
                    textbookVersion: textForm.textbookVersion,
                    grade: textForm.grade,
                    volume: textForm.volume,
                    unit: textForm.unit,
                    title: textForm.title.trim(),
                    content: textForm.content,
                    sortOrder: textForm.sortOrder,
                  });
                  setTextMsg('已保存');
                  setTextForm(f => ({ ...f, title: '', content: '' }));
                  loadTexts();
                } catch (e) {
                  setTextErr(e.message || '保存失败');
                }
              }}
            >
              保存本条
            </button>
          </div>

          <div className="form-card" style={{ marginBottom: '1.5rem' }}>
            <h3>批量导入（JSON）</h3>
            <p className="hint-text">
              将数组粘贴到下方，字段名与单条录入一致：<code>textbookVersion</code>、<code>grade</code>、
              <code>volume</code>、<code>unit</code>、<code>title</code>、<code>content</code>；
              <code>sortOrder</code> 可选，缺省按数组顺序。
            </p>
            <textarea
              value={batchJson}
              onChange={e => setBatchJson(e.target.value)}
              placeholder={BATCH_JSON_HINT}
              rows={12}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            <button
              type="button"
              className="btn-primary"
              style={{ marginTop: '0.75rem' }}
              onClick={async () => {
                setTextErr('');
                setTextMsg('');
                try {
                  const items = JSON.parse(batchJson || '[]');
                  if (!Array.isArray(items) || items.length === 0) {
                    setTextErr('请粘贴有效的 JSON 数组');
                    return;
                  }
                  const data = await api.importRecitationTextsBatch(items);
                  setTextMsg(data.message || `已导入 ${data.count} 条`);
                  setBatchJson('');
                  loadTexts();
                } catch (e) {
                  if (e instanceof SyntaxError) {
                    setTextErr('JSON 格式错误，请检查括号与引号');
                  } else {
                    setTextErr(e.message || '导入失败');
                  }
                }
              }}
            >
              导入批量
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr><th>教材</th><th>年级</th><th>分册</th><th>单元</th><th>标题</th></tr>
            </thead>
            <tbody>
              {texts.map(t => (
                <tr key={t.id}>
                  <td>{t.textbook_version}</td>
                  <td>{t.grade}年级</td>
                  <td>{t.volume || '上册'}</td>
                  <td>第{t.unit}单元</td>
                  <td>{t.title}</td>
                </tr>
              ))}
              {texts.length === 0 && <tr><td colSpan="5" className="empty">暂无课文</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
