import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Schedule from './pages/Schedule'
import Leads from './pages/Leads'
import Students from './pages/Students'
import Analytics from './pages/Analytics'
import Finance from './pages/Finance'
import Users from './pages/Users'
import ProfilePage from './pages/Profile'
import type { Role } from './types'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoading />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { profile } = useAuth()
  if (profile && !roles.includes(profile.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

function FullScreenLoading() {
  return <div className="flex h-screen items-center justify-center text-sm text-gray-400">Загрузка…</div>
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) return <FullScreenLoading />

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route
          path="/leads"
          element={
            <RequireRole roles={['admin', 'manager']}>
              <Leads />
            </RequireRole>
          }
        />
        <Route path="/students" element={<Students />} />
        <Route
          path="/analytics"
          element={
            <RequireRole roles={['admin', 'manager']}>
              <Analytics />
            </RequireRole>
          }
        />
        <Route
          path="/finance"
          element={
            <RequireRole roles={['admin']}>
              <Finance />
            </RequireRole>
          }
        />
        <Route
          path="/users"
          element={
            <RequireRole roles={['admin']}>
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
