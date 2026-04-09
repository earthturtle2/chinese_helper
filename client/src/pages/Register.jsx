import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({
        username,
        password,
        displayName,
        inviteCode,
      });
      navigate('/student');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page login-page-register">
      <div className="login-top-bar">
        <Link to="/login" className="login-back-inline">← 返回登录</Link>
        <Link to="/admin/login" className="login-gear-btn" title="管理员登录" aria-label="管理员登录">
          <span className="login-gear-icon" aria-hidden>⚙</span>
        </Link>
      </div>
      <div className="login-card login-card-wide">
        <div className="login-header">
          <h1>学生注册</h1>
          <p>使用管理员提供的邀请码创建账户</p>
          <p className="register-hint">年级与教材可在登录后，在「默写」「背诵」等模块中自由选择。</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label htmlFor="invite">邀请码</label>
            <input
              id="invite"
              type="text"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="off"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="reg-username">用户名</label>
            <input
              id="reg-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="登录用户名"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="reg-display">显示名称</label>
            <input
              id="reg-display"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="可选，默认同用户名"
            />
          </div>
          <div className="form-group">
            <label htmlFor="reg-password">密码（至少 8 位）</label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="设置登录密码"
              minLength={8}
              required
            />
          </div>
          <button type="submit" className="btn-primary btn-full" disabled={loading}>
            {loading ? '注册中...' : '注册并登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
