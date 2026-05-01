import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import Layout from './components/Layout';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminStudents = lazy(() => import('./pages/admin/Students'));
const AdminParents = lazy(() => import('./pages/admin/Parents'));
const AdminContent = lazy(() => import('./pages/admin/Content'));
const AdminInvitations = lazy(() => import('./pages/admin/Invitations'));
const StudentHome = lazy(() => import('./pages/student/Home'));
const Dictation = lazy(() => import('./pages/student/Dictation'));
const DictationPractice = lazy(() => import('./pages/student/DictationPractice'));
const MistakeBook = lazy(() => import('./pages/student/MistakeBook'));
const Recitation = lazy(() => import('./pages/student/Recitation'));
const RecitationPractice = lazy(() => import('./pages/student/RecitationPractice'));
const LessonStudy = lazy(() => import('./pages/student/LessonStudy'));
const LessonStudyDetail = lazy(() => import('./pages/student/LessonStudyDetail'));
const LessonDictationPractice = lazy(() => import('./pages/student/LessonDictationPractice'));
const Writing = lazy(() => import('./pages/student/Writing'));
const WritingSession = lazy(() => import('./pages/student/WritingSession'));
const ParentDashboard = lazy(() => import('./pages/parent/Dashboard'));
const ParentWeekly = lazy(() => import('./pages/parent/Weekly'));
const ParentLessonStudy = lazy(() => import('./pages/parent/ParentLessonStudy'));
const ParentRecitation = lazy(() => import('./pages/parent/ParentRecitation'));

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
    <Suspense fallback={<div className="loading">加载中...</div>}>
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
      <Route path="/student/lesson-study" element={<StudentLayout />}>
        <Route index element={<LessonStudy />} />
      </Route>
      <Route path="/student/lesson-study/:textId" element={<StudentLayout />}>
        <Route index element={<LessonStudyDetail />} />
      </Route>
      <Route path="/student/lesson-study/:textId/dictation" element={<StudentLayout />}>
        <Route index element={<LessonDictationPractice />} />
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
      <Route path="/parent/children/:studentId/lesson-study" element={<ParentLayout />}>
        <Route index element={<ParentLessonStudy />} />
      </Route>
      <Route path="/parent/children/:studentId/lesson-study/:textId" element={<ParentLayout />}>
        <Route index element={<LessonStudyDetail />} />
      </Route>
      <Route path="/parent/children/:studentId/recitation" element={<ParentLayout />}>
        <Route index element={<ParentRecitation />} />
      </Route>
      <Route path="/parent/children/:studentId/recitation/:textId" element={<ParentLayout />}>
        <Route index element={<RecitationPractice />} />
      </Route>

        <Route path="*" element={<Navigate to={user ? getHomePath(user.role) : '/login'} replace />} />
      </Routes>
    </Suspense>
  );
}
