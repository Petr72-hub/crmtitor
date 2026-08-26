import { NavLink, Outlet } from 'react-router-dom'
import { useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'
import { initials } from '../lib/format'

const NAV_ITEMS = [
  { to: '/', label: 'Сегодня', icon: '🏠', roles: ['admin', 'manager', 'tutor'] },
  { to: '/schedule', label: 'Расписание', icon: '📅', roles: ['admin', 'manager', 'tutor'] },
  { to: '/leads', label: 'Лиды', icon: '🎯', roles: ['admin', 'manager'] },
  { to: '/students', label: 'Ученики', icon: '🎓', roles: ['admin', 'manager', 'tutor'] },
  { to: '/analytics', label: 'Аналитика', icon: '📊', roles: ['admin', 'manager'] },
  { to: '/finance', label: 'Финансы', icon: '💰', roles: ['admin'] },
  { to: '/users', label: 'Пользователи', icon: '👥', roles: ['admin'] },
  { to: '/profile', label: 'Профиль', icon: '⚙️', roles: ['admin', 'manager', 'tutor'] },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  const items = NAV_ITEMS.filter((item) => !profile || item.roles.includes(profile.role))

  return (
    <div className="flex h-screen bg-gray-100">
      <aside
        className={clsx(
          'flex flex-col border-r border-gray-200 bg-white transition-all',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            C
          </div>
          {!collapsed && <span className="text-lg font-bold text-gray-800">MyCRM</span>}
        </div>

        <nav className="flex-1 space-y-1 px-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )
              }
            >
              <span>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white">
              {profile ? initials(profile.full_name) : '?'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{profile?.full_name}</p>
                <p className="truncate text-xs text-gray-500">{roleLabel(profile?.role)}</p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={() => signOut()}
                title="Выход"
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                ⏻
              </button>
            )}
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="mt-2 w-full rounded p-1 text-xs text-gray-400 hover:bg-gray-100"
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
  if (role === 'admin') return 'Администратор'
  if (role === 'manager') return 'Менеджер'
  if (role === 'tutor') return 'Репетитор'
  return ''
}
