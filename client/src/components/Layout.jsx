import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = {
  admin: [
    { path: '/admin', label: '总览', icon: '📊' },
    { path: '/admin/students', label: '学生管理', icon: '👨‍🎓' },
    { path: '/admin/parents', label: '家长管理', icon: '👨‍👩‍👧' },
    { path: '/admin/content', label: '内容管理', icon: '📚' },
    { path: '/admin/invitations', label: '邀请码', icon: '🎫' },
  ],
  student: [
    { path: '/student', label: '首页', icon: '🏠' },
    { path: '/student/dictation', label: '生词默写', icon: '✍️' },
    { path: '/student/recitation', label: '检查背诵', icon: '🎤' },
    { path: '/student/writing', label: '写作指导', icon: '📝' },
    { path: '/student/mistakes', label: '错词本', icon: '📖' },
  ],
  parent: [
    { path: '/parent', label: '学习报告', icon: '📋' },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = NAV_ITEMS[user?.role] || [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel = { admin: '管理员', student: '同学', parent: '家长' };

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">语文小助手</h1>
        </div>
        <nav className="header-nav">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="header-right">
          <span className="user-info">
            {user?.displayName || user?.username}
            <span className="role-badge">{roleLabel[user?.role]}</span>
          </span>
          <button className="btn-logout" onClick={handleLogout}>退出</button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
