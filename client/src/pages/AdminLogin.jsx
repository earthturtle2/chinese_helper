import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginAdmin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginAdmin(username, password);
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page login-page-has-back">
      <Link to="/login" className="login-back-link">← 学生 / 家长登录</Link>
      <div className="login-card login-card-admin">
        <div className="login-header">
          <h1>管理员登录</h1>
          <p>后台管理入口</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label htmlFor="admin-username">用户名</label>
            <input
              id="admin-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="管理员用户名"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="admin-password">密码</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="密码"
              required
            />
          </div>
          <button type="submit" className="btn-primary btn-full" disabled={loading}>
            {loading ? '登录中...' : '进入管理后台'}
          </button>
        </form>
      </div>
    </div>
  );
}
