import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { usernameToParentEmail } from '../../lib/parentAuth'

export default function ParentLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToParentEmail(username),
      password,
    })
    setLoading(false)
    if (error) setError('Неверный логин или пароль')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-black p-3">
            <img src="/logo.svg" alt="КЭТАЛИЗАТОР" className="h-full w-full object-contain" />
          </div>
          <h1 className="font-heading text-2xl tracking-wide text-ink">Кабинет родителя</h1>
          <p className="mt-1 text-sm text-muted">Успеваемость вашего ребёнка</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-soft">Логин</label>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              placeholder="выданный логин"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink-soft">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark disabled:opacity-50"
          >
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
