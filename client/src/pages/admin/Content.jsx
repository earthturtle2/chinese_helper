import { useState, useEffect } from 'react';
import { api } from '../../api';

export default function AdminContent() {
  const [wordLists, setWordLists] = useState([]);
  const [texts, setTexts] = useState([]);
  const [tab, setTab] = useState('words');

  useEffect(() => {
    api.getAdminWordLists().then(setWordLists).catch(console.error);
    api.getAdminRecitationTexts().then(setTexts).catch(console.error);
  }, []);

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
          <table className="data-table">
            <thead>
              <tr><th>教材</th><th>年级</th><th>单元</th><th>标题</th></tr>
            </thead>
            <tbody>
              {texts.map(t => (
                <tr key={t.id}>
                  <td>{t.textbook_version}</td>
                  <td>{t.grade}年级</td>
                  <td>第{t.unit}单元</td>
                  <td>{t.title}</td>
                </tr>
              ))}
              {texts.length === 0 && <tr><td colSpan="4" className="empty">暂无课文</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
