import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminDashboard from './pages/admin/Dashboard';
import AdminStudents from './pages/admin/Students';
import AdminParents from './pages/admin/Parents';
import AdminContent from './pages/admin/Content';
import AdminInvitations from './pages/admin/Invitations';
import StudentHome from './pages/student/Home';
import Dictation from './pages/student/Dictation';
import DictationPractice from './pages/student/DictationPractice';
import MistakeBook from './pages/student/MistakeBook';
import Recitation from './pages/student/Recitation';
import RecitationPractice from './pages/student/RecitationPractice';
import Writing from './pages/student/Writing';
import WritingSession from './pages/student/WritingSession';
import ParentDashboard from './pages/parent/Dashboard';
import ParentWeekly from './pages/parent/Weekly';
import Layout from './components/Layout';

function getHomePath(role) {
  switch (role) {
    case 'admin': return '/admin';
    case 'student': return '/student';
    case 'parent': return '/parent';
    default: return '/login';
  }
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">加载中...</div>;
  if (!user) {
    const loginPath = roles?.length === 1 && roles[0] === 'admin' ? '/login?admin=1' : '/login';
    return <Navigate to={loginPath} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={getHomePath(user.role)} replace />;
  }
  return children;
}

/** RR7: each URL needs a parent Route with explicit path + index child, or Outlet stays empty. */
function AdminLayout() {
  return (
    <ProtectedRoute roles={['admin']}>
      <Layout />
    </ProtectedRoute>
  );
}

function StudentLayout() {
  return (
    <ProtectedRoute roles={['student']}>
      <Layout />
    </ProtectedRoute>
  );
}

function ParentLayout() {
  return (
    <ProtectedRoute roles={['parent']}>
      <Layout />
    </ProtectedRoute>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={getHomePath(user.role)} replace /> : <Login />} />
      <Route path="/admin/login" element={<Navigate to={user?.role === 'admin' ? '/admin' : '/login?admin=1'} replace />} />
      <Route path="/register" element={user ? <Navigate to={getHomePath(user.role)} replace /> : <Register />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
      </Route>
      <Route path="/admin/students" element={<AdminLayout />}>
        <Route index element={<AdminStudents />} />
      </Route>
      <Route path="/admin/parents" element={<AdminLayout />}>
        <Route index element={<AdminParents />} />
      </Route>
      <Route path="/admin/content" element={<AdminLayout />}>
        <Route index element={<AdminContent />} />
      </Route>
      <Route path="/admin/invitations" element={<AdminLayout />}>
        <Route index element={<AdminInvitations />} />
      </Route>

      <Route path="/student" element={<StudentLayout />}>
        <Route index element={<StudentHome />} />
      </Route>
      <Route path="/student/dictation" element={<StudentLayout />}>
        <Route index element={<Dictation />} />
      </Route>
      <Route path="/student/dictation/:listId" element={<StudentLayout />}>
        <Route index element={<DictationPractice />} />
      </Route>
      <Route path="/student/mistakes" element={<StudentLayout />}>
        <Route index element={<MistakeBook />} />
      </Route>
      <Route path="/student/recitation" element={<StudentLayout />}>
        <Route index element={<Recitation />} />
      </Route>
      <Route path="/student/recitation/:textId" element={<StudentLayout />}>
        <Route index element={<RecitationPractice />} />
      </Route>
      <Route path="/student/writing" element={<StudentLayout />}>
        <Route index element={<Writing />} />
      </Route>
      <Route path="/student/writing/:sessionId" element={<StudentLayout />}>
        <Route index element={<WritingSession />} />
      </Route>

      <Route path="/parent" element={<ParentLayout />}>
        <Route index element={<ParentDashboard />} />
      </Route>
      <Route path="/parent/weekly/:studentId" element={<ParentLayout />}>
        <Route index element={<ParentWeekly />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? getHomePath(user.role) : '/login'} replace />} />
    </Routes>
  );
}
