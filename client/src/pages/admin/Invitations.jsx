import { useState, useEffect } from 'react';
import { api } from '../../api';

export default function AdminInvitations() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ note: '', maxUses: 1, expiresInDays: '' });
  const [creating, setCreating] = useState(false);
  const [lastCode, setLastCode] = useState(null);

  const load = () => {
    api.getInvitationCodes().then(setRows).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const createCode = async (e) => {
    e.preventDefault();
    setCreating(true);
    setLastCode(null);
    try {
      const data = await api.createInvitationCode({
        note: form.note,
        maxUses: form.maxUses,
        expiresInDays: form.expiresInDays === '' ? undefined : form.expiresInDays,
      });
      setLastCode(data.code);
      setForm({ note: '', maxUses: 1, expiresInDays: '' });
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('确定删除该邀请码记录？未使用的次数将作废。')) return;
    try {
      await api.deleteInvitationCode(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <div className="page admin-invitations">
      <h2>邀请码</h2>
      <p className="page-hint">邀请码仅在生成时显示一次；服务器只保存哈希，无法找回明文。</p>

      {lastCode && (
        <div className="invite-code-banner">
          <strong>新生成的邀请码（请立即复制保存）：</strong>
          <code className="invite-code-plain">{lastCode}</code>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => { navigator.clipboard.writeText(lastCode); }}
          >
            复制
          </button>
          <button type="button" className="btn-text" onClick={() => setLastCode(null)}>关闭</button>
        </div>
      )}

      <form className="form-card" onSubmit={createCode}>
        <h3>生成邀请码</h3>
        <div className="form-row">
          <input
            placeholder="备注（可选）"
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
          />
          <input
            type="number"
            min={1}
            placeholder="最大使用次数"
            value={form.maxUses}
            onChange={e => setForm(f => ({ ...f, maxUses: Number(e.target.value) || 1 }))}
          />
          <input
            type="number"
            min={1}
            placeholder="有效天数（空为不限）"
            value={form.expiresInDays}
            onChange={e => setForm(f => ({ ...f, expiresInDays: e.target.value }))}
          />
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? '生成中...' : '生成'}
          </button>
        </div>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>备注</th>
            <th>次数</th>
            <th>过期</th>
            <th>创建时间</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="empty">暂无邀请码</td></tr>
          ) : (
            rows.map(r => (
              <tr key={r.id}>
                <td>{r.note || '—'}</td>
                <td>{r.used_count} / {r.max_uses}</td>
                <td>{r.expires_at ? new Date(r.expires_at).toLocaleString() : '不限'}</td>
                <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                <td className="actions">
                  <button type="button" className="btn-danger-outline btn-sm" onClick={() => remove(r.id)}>删除</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
