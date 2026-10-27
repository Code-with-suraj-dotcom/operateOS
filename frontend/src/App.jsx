import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { WorkspacesProvider } from './context/WorkspacesContext.jsx';
import AppShell from './components/AppShell.jsx';
import AuthPage from './pages/AuthPage.jsx';
import WorkspacesPage from './pages/WorkspacesPage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import AccountPage from './pages/AccountPage.jsx';

// One layout route for every signed-in page, so the sidebar (and its workspace list) persists between pages.
function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-sm text-ink-700">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <WorkspacesProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </WorkspacesProvider>
  );
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage mode="register" />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<WorkspacesPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/workspace/:wid" element={<WorkspacePage />} />
        <Route path="/workspace/:wid/audit" element={<AuditPage />} />
        <Route path="/workspace/:wid/search" element={<SearchPage />} />
        <Route path="/project/:pid" element={<ProjectPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
