import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminStudents from './pages/admin/Students';
import AdminParents from './pages/admin/Parents';
import AdminContent from './pages/admin/Content';
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

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">加载中...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="loading">加载中...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={getHomePath(user.role)} replace /> : <Login />} />

      <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Layout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="students" element={<AdminStudents />} />
        <Route path="parents" element={<AdminParents />} />
        <Route path="content" element={<AdminContent />} />
      </Route>

      <Route path="/student" element={<ProtectedRoute roles={['student']}><Layout /></ProtectedRoute>}>
        <Route index element={<StudentHome />} />
        <Route path="dictation" element={<Dictation />} />
        <Route path="dictation/:listId" element={<DictationPractice />} />
        <Route path="mistakes" element={<MistakeBook />} />
        <Route path="recitation" element={<Recitation />} />
        <Route path="recitation/:textId" element={<RecitationPractice />} />
        <Route path="writing" element={<Writing />} />
        <Route path="writing/:sessionId" element={<WritingSession />} />
      </Route>

      <Route path="/parent" element={<ProtectedRoute roles={['parent']}><Layout /></ProtectedRoute>}>
        <Route index element={<ParentDashboard />} />
        <Route path="weekly/:studentId" element={<ParentWeekly />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? getHomePath(user.role) : '/login'} replace />} />
    </Routes>
  );
}

function getHomePath(role) {
  switch (role) {
    case 'admin': return '/admin';
    case 'student': return '/student';
    case 'parent': return '/parent';
    default: return '/login';
  }
}
