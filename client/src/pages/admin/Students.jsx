import { useState, useEffect } from 'react';
import { api } from '../../api';
import PasswordResetModal from '../../components/PasswordResetModal';

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [parents, setParents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    username: '',
    displayName: '',
    password: '',
    grade: 3,
    textbookVersion: '统编版',
    textbookVolume: '上册',
  });
  const [error, setError] = useState('');

  const load = () => {
    api.getStudents()
      .then(data => setStudents(Array.isArray(data) ? data : []))
      .catch(console.error);
    api.getParents()
      .then(data => setParents(Array.isArray(data) ? data : []))
      .catch(console.error);
  };
  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api.createStudent(form);
      setForm({
        username: '',
        displayName: '',
        password: '',
        grade: 3,
        textbookVersion: '统编版',
        textbookVolume: '上册',
      });
      setShowForm(false);
      load();
    } catch (err) { setError(err.message); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`确定删除学生 ${name} 吗？所有学习数据将被清除。`)) return;
    setNotice('');
    await api.deleteStudent(id);
    load();
  };

  const handleBind = async (studentId, parentId) => {
    setNotice('');
    await api.bindStudentParent(studentId, parentId || null);
    load();
  };

  const handleResetPwd = async (password) => {
    if (!resetTarget) return;
    await api.resetStudentPassword(resetTarget.id, password);
    setNotice(`已更新 ${resetTarget.display_name || resetTarget.username} 的密码`);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>学生管理</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '取消' : '+ 新建学生'}
        </button>
      </div>

      {notice && <div className="success-msg">{notice}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="form-card">
          {error && <div className="error-msg">{error}</div>}
          <div className="form-row">
            <input placeholder="用户名" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
            <input placeholder="昵称" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            <input placeholder="密码" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <div className="form-row">
            <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: +e.target.value }))}>
              {[3,4,5,6].map(g => <option key={g} value={g}>{g}年级</option>)}
            </select>
            <select value={form.textbookVersion} onChange={e => setForm(f => ({ ...f, textbookVersion: e.target.value }))}>
              <option value="统编版">统编版</option>
              <option value="人教版">人教版</option>
              <option value="苏教版">苏教版</option>
              <option value="北师大版">北师大版</option>
            </select>
            <select value={form.textbookVolume} onChange={e => setForm(f => ({ ...f, textbookVolume: e.target.value }))}>
              <option value="上册">上册</option>
              <option value="下册">下册</option>
            </select>
            <button type="submit" className="btn-primary">创建</button>
          </div>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>用户名</th><th>昵称</th><th>年级</th><th>教材</th><th>分册</th><th>绑定家长</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {students.map(s => (
            <tr key={s.id}>
              <td>{s.username}</td>
              <td>{s.display_name}</td>
              <td>{s.grade}年级</td>
              <td>{s.textbook_version}</td>
              <td>
                <select
                  value={s.textbook_volume || '上册'}
                  onChange={async (e) => {
                    await api.updateStudent(s.id, { textbookVolume: e.target.value });
                    load();
                  }}
                >
                  <option value="上册">上册</option>
                  <option value="下册">下册</option>
                </select>
              </td>
              <td>
                <select
                  value={s.parent_id != null && s.parent_id !== '' ? String(s.parent_id) : ''}
                  onChange={e => handleBind(s.id, e.target.value)}
                >
                  <option value="">未绑定</option>
                  {parents.map(p => (
                    <option key={p.id} value={String(p.id)}>{p.username}</option>
                  ))}
                </select>
              </td>
              <td className="actions">
                <button type="button" className="btn-sm" onClick={() => { setNotice(''); setResetTarget(s); }}>修改密码</button>
                <button className="btn-sm btn-danger" onClick={() => handleDelete(s.id, s.display_name)}>删除</button>
              </td>
            </tr>
          ))}
          {students.length === 0 && <tr><td colSpan="7" className="empty">暂无学生</td></tr>}
        </tbody>
      </table>

      <PasswordResetModal
        open={!!resetTarget}
        title="修改学生密码"
        accountName={resetTarget?.display_name || resetTarget?.username}
        onClose={() => setResetTarget(null)}
        onSubmit={handleResetPwd}
      />
    </div>
  );
}
