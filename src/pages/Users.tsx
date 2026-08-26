import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Profile, Role } from '../types'
import { initials } from '../lib/format'

const ROLE_LABELS: Record<Role, string> = { admin: 'Администратор', manager: 'Менеджер', tutor: 'Репетитор' }

export default function Users() {
  const { profile: me } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setUsers((data as Profile[]) ?? [])
    setLoading(false)
  }

  async function changeRole(userId: string, role: Role) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)))
    await supabase.from('profiles').update({ role }).eq('id', userId)
  }

  async function changeRate(userId: string, rate: number) {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, rate_per_lesson: rate } : u)))
    await supabase.from('profiles').update({ rate_per_lesson: rate }).eq('id', userId)
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Загрузка…</div>

  return (
    <div className="p-6">
      <header className="mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
        <p className="text-sm text-gray-500">Назначайте роли и ставку за урок. Новые пользователи регистрируются на странице входа.</p>
      </header>

      <div className="my-4 grid grid-cols-3 gap-4 sm:max-w-md">
        <MiniStat label="Всего" value={users.length} />
        <MiniStat label="Админов" value={users.filter((u) => u.role === 'admin').length} />
        <MiniStat label="Репетиторов" value={users.filter((u) => u.role === 'tutor').length} />
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 text-sm font-semibold text-white">
                  {initials(u.full_name)}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {u.full_name} {u.id === me?.id && <span className="text-xs text-gray-400">(вы)</span>}
                  </p>
                  <p className="text-sm text-gray-500">{u.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                  Ставка/урок
                  <input
                    type="number"
                    min={0}
                    defaultValue={u.rate_per_lesson}
                    onBlur={(e) => changeRate(u.id, Number(e.target.value))}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>

                <select
                  value={u.role}
                  disabled={u.id === me?.id}
                  onChange={(e) => changeRole(u.id, e.target.value as Role)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:opacity-50"
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {u.id === me?.id && <p className="mt-2 text-xs text-gray-400">Нельзя изменить свою собственную роль</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
