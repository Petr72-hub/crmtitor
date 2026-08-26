import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { initials } from '../lib/format'

const ROLE_LABELS: Record<string, string> = { admin: 'Администратор', manager: 'Менеджер', tutor: 'Репетитор' }

export default function ProfilePage() {
  const { profile, session, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwSaving, setPwSaving] = useState(false)

  async function handleSaveName(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', profile.id)
    await refreshProfile()
    setSaving(false)
    setSavedMsg('Сохранено')
    setTimeout(() => setSavedMsg(null), 2000)
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) {
      setPwMsg('Пароль должен быть не короче 6 символов')
      return
    }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    setPwMsg(error ? error.message : 'Пароль обновлён')
    setNewPassword('')
    setTimeout(() => setPwMsg(null), 3000)
  }

  if (!profile) return null

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Профиль</h1>

      <div className="mb-6 flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800 text-lg font-semibold text-white">
          {initials(profile.full_name)}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{profile.full_name}</p>
          <p className="text-sm text-gray-500">{session?.user.email}</p>
          <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {ROLE_LABELS[profile.role]}
          </span>
        </div>
      </div>

      <form onSubmit={handleSaveName} className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Имя</h2>
        <div className="flex gap-2">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          <button type="submit" disabled={saving} className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            Сохранить
          </button>
        </div>
        {savedMsg && <p className="mt-2 text-sm text-green-600">{savedMsg}</p>}
      </form>

      <form onSubmit={handleChangePassword} className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Сменить пароль</h2>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="Новый пароль"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input"
          />
          <button type="submit" disabled={pwSaving} className="shrink-0 rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50">
            Обновить
          </button>
        </div>
        {pwMsg && <p className="mt-2 text-sm text-gray-600">{pwMsg}</p>}
      </form>
    </div>
  )
}
