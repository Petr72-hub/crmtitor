import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { initials } from '../lib/format'

const NAV_ITEMS = [
  { to: '/', label: 'Сегодня', icon: '🏠', roles: ['owner', 'admin', 'tutor'] },
  { to: '/schedule', label: 'Расписание', icon: '📅', roles: ['owner', 'admin', 'tutor'] },
  { to: '/leads', label: 'Лиды', icon: '🎯', roles: ['owner', 'admin'] },
  { to: '/students', label: 'Ученики', icon: '🎓', roles: ['owner', 'admin', 'tutor'] },
  { to: '/analytics', label: 'Аналитика', icon: '📊', roles: ['owner', 'admin'] },
  { to: '/finance', label: 'Финансы', icon: '💰', roles: ['owner', 'admin'] },
  { to: '/trial-lesson', label: 'Пробное занятие', icon: '🧪', roles: ['owner', 'admin', 'tutor'] },
  { to: '/content', label: 'Контент', icon: '📝', roles: ['owner', 'admin'] },
  { to: '/users', label: 'Пользователи', icon: '👥', roles: ['owner', 'admin'] },
  { to: '/profile', label: 'Профиль', icon: '⚙️', roles: ['owner', 'admin', 'tutor'] },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

  const items = NAV_ITEMS.filter((item) => !profile || item.roles.includes(profile.role))

  return (
    <div className="flex h-screen bg-surface-muted">
      <aside
        className={clsx(
          'flex flex-col border-r border-line bg-surface transition-all',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black p-1.5">
            <img src="/logo.svg" alt="КЭТАЛИЗАТОР" className="h-full w-full object-contain" />
          </div>
          {!collapsed && <span className="font-heading text-xl tracking-wide text-ink">КЭТАЛИЗАТОР</span>}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand/10 text-brand'
                    : 'text-muted hover:bg-surface-muted hover:text-ink',
                )
              }
            >
              <span>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
            className="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-muted hover:text-ink"
          >
            <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
            {!collapsed && <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>}
          </button>

          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white">
              {profile ? initials(profile.full_name) : '?'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{profile?.full_name}</p>
                <p className="truncate text-xs text-muted">{roleLabel(profile?.role)}</p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={() => signOut()}
                title="Выход"
                className="rounded p-1.5 text-faint hover:bg-surface-muted hover:text-ink-soft"
              >
                ⏻
              </button>
            )}
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="mt-2 w-full rounded p-1 text-xs text-faint hover:bg-surface-muted"
          >
            {collapsed ? '»' : '« Свернуть'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

function roleLabel(role?: string) {
  if (role === 'owner') return 'Владелец'
  if (role === 'admin') return 'Администратор'
  if (role === 'tutor') return 'Репетитор'
  return ''
}
