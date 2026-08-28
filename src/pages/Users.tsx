import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Profile, Role } from '../types'
import { initials } from '../lib/format'
import { createStaffAccount, deleteAccount, resetAccountPassword } from '../lib/manageUsers'

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  tutor: 'Репетитор',
  parent: 'Родитель',
}

export default function Users() {
  const { profile: me } = useAuth()
  const isOwner = me?.role === 'owner'
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['owner', 'admin', 'tutor'])
      .order('created_at')
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

  async function handleDelete(userId: string, name: string) {
    if (!confirm(`Удалить аккаунт «${name}»? Это действие нельзя отменить.`)) return
    setBusyId(userId)
    const { error } = await deleteAccount(userId)
    setBusyId(null)
    if (error) return setError(error)
    setUsers((prev) => prev.filter((u) => u.id !== userId))
  }

  async function handleResetPassword(userId: string) {
    const password = prompt('Новый пароль (минимум 6 символов):')
    if (!password) return
    setBusyId(userId)
    const { error } = await resetAccountPassword(userId, password)
    setBusyId(null)
    if (error) setError(error)
    else alert('Пароль обновлён')
  }

  if (loading) return <div className="p-6 text-sm text-faint">Загрузка…</div>

  return (
    <div className="p-6">
      <header className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Пользователи</h1>
          <p className="text-sm text-muted">
            {isOwner
              ? 'Добавляйте и удаляйте админов и репетиторов, назначайте роли и ставку за урок.'
              : 'Ставку за урок можно менять. Добавлять и удалять аккаунты может только владелец.'}
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + Добавить сотрудника
          </button>
        )}
      </header>

      {error && (
        <div className="my-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <div className="my-4 grid grid-cols-3 gap-4 sm:max-w-md">
        <MiniStat label="Всего" value={users.length} />
        <MiniStat label="Админов" value={users.filter((u) => u.role === 'admin').length} />
        <MiniStat label="Репетиторов" value={users.filter((u) => u.role === 'tutor').length} />
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 text-sm font-semibold text-white">
                  {initials(u.full_name)}
                </div>
                <div>
                  <p className="font-medium text-ink">
                    {u.full_name} {u.id === me?.id && <span className="text-xs text-faint">(вы)</span>}
                  </p>
                  <p className="text-sm text-muted">{u.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm text-muted">
                  Ставка/урок
                  <input
                    type="number"
                    min={0}
                    defaultValue={u.rate_per_lesson}
                    onBlur={(e) => changeRate(u.id, Number(e.target.value))}
                    className="w-20 rounded-lg border border-line px-2 py-1 text-sm"
                  />
                </label>

                <select
                  value={u.role}
                  disabled={!isOwner || u.id === me?.id || u.role === 'owner'}
                  onChange={(e) => changeRole(u.id, e.target.value as Role)}
                  className="rounded-lg border border-line px-2 py-1.5 text-sm disabled:opacity-50"
                >
                  {(['owner', 'admin', 'tutor'] as Role[]).map((r) => (
                    <option key={r} value={r} disabled={r === 'owner'}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>

                {isOwner && u.id !== me?.id && u.role !== 'owner' && (
                  <>
                    <button
                      onClick={() => handleResetPassword(u.id)}
                      disabled={busyId === u.id}
                      className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-line disabled:opacity-50"
                    >
                      Сбросить пароль
                    </button>
                    <button
                      onClick={() => handleDelete(u.id, u.full_name)}
                      disabled={busyId === u.id}
                      className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      Удалить
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <CreateStaffForm
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            void loadUsers()
          }}
        />
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 text-center">
      <p className="text-xl font-bold text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function CreateStaffForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ role: 'tutor' as 'admin' | 'tutor', full_name: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await createStaffAccount(form)
    setSaving(false)
    if (error) return setError(error)
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-ink">Новый сотрудник</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Роль</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'tutor' })}
              className="input"
            >
              <option value="tutor">Репетитор</option>
              <option value="admin">Администратор</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Имя</span>
            <input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Email</span>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Пароль</span>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input"
            />
          </label>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-muted">
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? 'Создаём…' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
