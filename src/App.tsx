import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Schedule from './pages/Schedule'
import Leads from './pages/Leads'
import Students from './pages/Students'
import StudentDetail from './pages/StudentDetail'
import Analytics from './pages/Analytics'
import Finance from './pages/Finance'
import Users from './pages/Users'
import ProfilePage from './pages/Profile'
import ContentNotes from './pages/ContentNotes'
import TrialPlaybook from './pages/TrialPlaybook'
import ParentLogin from './pages/parent/ParentLogin'
import ParentPortal from './pages/parent/ParentPortal'
import type { Role } from './types'

function RequireStaffAuth({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <FullScreenLoading />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.role === 'parent') return <Navigate to="/parent" replace />
  return <>{children}</>
}

function RequireParentAuth({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <FullScreenLoading />
  if (!session) return <Navigate to="/parent/login" replace />
  if (profile && profile.role !== 'parent') return <Navigate to="/" replace />
  return <>{children}</>
}

function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { profile } = useAuth()
  if (profile && !roles.includes(profile.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function FullScreenLoading() {
  return <div className="flex h-screen items-center justify-center text-sm text-faint">Загрузка…</div>
}

function AppRoutes() {
  const { session, profile, loading } = useAuth()

  if (loading) return <FullScreenLoading />

  return (
    <Routes>
      <Route
        path="/login"
        element={session && profile?.role !== 'parent' ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/parent/login"
        element={session && profile?.role === 'parent' ? <Navigate to="/parent" replace /> : <ParentLogin />}
      />
      <Route
        path="/parent"
        element={
          <RequireParentAuth>
            <ParentPortal />
          </RequireParentAuth>
        }
      />

      <Route
        element={
          <RequireStaffAuth>
            <Layout />
          </RequireStaffAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route
          path="/leads"
          element={
            <RequireRole roles={['owner', 'admin']}>
              <Leads />
            </RequireRole>
          }
        />
        <Route path="/students" element={<Students />} />
        <Route path="/students/:id" element={<StudentDetail />} />
        <Route
          path="/analytics"
          element={
            <RequireRole roles={['owner', 'admin']}>
              <Analytics />
            </RequireRole>
          }
        />
        <Route
          path="/finance"
          element={
            <RequireRole roles={['owner', 'admin']}>
              <Finance />
            </RequireRole>
          }
        />
        <Route path="/trial-lesson" element={<TrialPlaybook />} />
        <Route
          path="/content"
          element={
            <RequireRole roles={['owner', 'admin']}>
              <ContentNotes />
            </RequireRole>
          }
        />
        <Route
          path="/users"
          element={
            <RequireRole roles={['owner', 'admin']}>
              <Users />
            </RequireRole>
          }
        />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
