import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminLoginModal from '../components/AdminLoginModal';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') !== '1') return;
    setAdminModalOpen(true);
    params.delete('admin');
    const qs = params.toString();
    navigate(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { replace: true });
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(username.trim(), password);
      const paths = { admin: '/admin', student: '/student', parent: '/parent' };
      navigate(paths[user.role] || '/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <AdminLoginModal open={adminModalOpen} onClose={() => setAdminModalOpen(false)} />
      <div className="login-top-actions-row">
        <Link to="/register" className="login-register-link">学生注册</Link>
        <button
          type="button"
          className="login-gear-btn"
          title="管理员登录"
          aria-label="管理员登录"
          onClick={() => setAdminModalOpen(true)}
        >
          <span className="login-gear-icon" aria-hidden>⚙</span>
        </button>
      </div>
      <div className="login-card">
        <div className="login-header">
          <h1>语文小助手</h1>
          <p>学生 / 家长登录</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
            />
          </div>
          <button type="submit" className="btn-primary btn-full" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
