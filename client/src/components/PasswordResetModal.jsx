import { useEffect, useState } from 'react';

export default function PasswordResetModal({ open, title, accountName, onClose, onSubmit }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setConfirmPassword('');
      setError('');
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextPassword = password.trim();
    setError('');

    if (nextPassword.length < 8) {
      setError('密码至少 8 位');
      return;
    }
    if (nextPassword !== confirmPassword.trim()) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(nextPassword);
      onClose();
    } catch (err) {
      setError(err.message || '密码修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={loading ? undefined : onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-reset-title"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="password-reset-title" className="modal-title">{title || '修改密码'}</h3>
        <form onSubmit={handleSubmit} className="login-form">
          {accountName && <p className="modal-hint">正在为 {accountName} 设置新密码</p>}
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label htmlFor="reset-password">新密码（至少 8 位）</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="reset-password-confirm">确认新密码</label>
            <input
              id="reset-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>取消</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '保存中...' : '保存新密码'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
