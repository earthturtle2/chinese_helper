import { useState, useEffect } from 'react';
import { api } from '../../api';

export default function AdminParents() {
  const [parents, setParents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', phone: '' });
  const [error, setError] = useState('');

  const load = () => api.getParents().then(setParents).catch(console.error);
  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.createParent(form);
      setForm({ username: '', password: '', phone: '' });
      setShowForm(false);
      load();
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`确定删除家长 ${name} 吗？`)) return;
    await api.deleteParent(id);
    load();
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>家长管理</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '取消' : '+ 新建家长'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="form-card">
          {error && <div className="error-msg">{error}</div>}
          <div className="form-row">
            <input placeholder="用户名" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
            <input placeholder="密码" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            <input placeholder="手机号（选填）" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            <button type="submit" className="btn-primary">创建</button>
          </div>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr><th>用户名</th><th>手机号</th><th>绑定学生</th><th>创建时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          {parents.map(p => (
            <tr key={p.id}>
              <td>{p.username}</td>
              <td>{p.phone || '-'}</td>
              <td>{p.children_names || '未绑定'}</td>
              <td>{p.created_at?.slice(0, 10)}</td>
              <td><button className="btn-sm btn-danger" onClick={() => handleDelete(p.id, p.username)}>删除</button></td>
            </tr>
          ))}
          {parents.length === 0 && <tr><td colSpan="5" className="empty">暂无家长</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
