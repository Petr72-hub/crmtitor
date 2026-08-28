import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Profile, Student } from '../types'
import { initials } from '../lib/format'

export default function Students() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [tutors, setTutors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'sleeping' | 'debt'>('all')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    void loadStudents()
    void loadTutors()
  }, [profile])

  async function loadStudents() {
    setLoading(true)
    let query = supabase.from('students').select('*').order('child_name')
    if (profile?.role === 'tutor') query = query.eq('tutor_id', profile.id)
    const { data } = await query
    setStudents((data as Student[]) ?? [])
    setLoading(false)
  }

  async function loadTutors() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setTutors((data as Profile[]) ?? [])
  }

  async function addStudent(payload: Partial<Student>) {
    const { data } = await supabase.from('students').insert(payload).select().single()
    if (data) setStudents((prev) => [...prev, data as Student].sort((a, b) => a.child_name.localeCompare(b.child_name)))
    setShowForm(false)
  }

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (filter === 'active' && s.status !== 'active') return false
      if (filter === 'sleeping' && s.status !== 'sleeping') return false
      if (filter === 'debt' && s.lessons_paid - s.lessons_done >= 0) return false
      if (search && !`${s.parent_name} ${s.child_name}`.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [students, filter, search])

  const debtCount = students.filter((s) => s.lessons_paid - s.lessons_done < 0).length
  const activeCount = students.filter((s) => s.status === 'active').length

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">
          Ученики <span className="text-faint">{students.length} · активных {activeCount} · долги {debtCount}</span>
        </h1>
        {profile?.role !== 'tutor' && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + Добавить ученика
          </button>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Имя, ребёнок…"
          className="input max-w-xs"
        />
        {(
          [
            ['all', 'Все'],
            ['active', 'Активные'],
            ['sleeping', 'Спят'],
            ['debt', `С долгом · ${debtCount}`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === value ? 'bg-brand text-white' : 'bg-surface-muted text-muted hover:bg-line'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-faint">Загрузка…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">Имя</th>
                <th className="px-4 py-2">Класс</th>
                <th className="px-4 py-2">Цель</th>
                <th className="px-4 py-2">Репетитор</th>
                <th className="px-4 py-2">Уроки</th>
                <th className="px-4 py-2">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.map((s) => {
                const tutor = tutors.find((t) => t.id === s.tutor_id)
                const balance = s.lessons_paid - s.lessons_done
                return (
                  <tr key={s.id} onClick={() => navigate(`/students/${s.id}`)} className="cursor-pointer hover:bg-surface-muted">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
                          {initials(s.child_name)}
                        </div>
                        <div>
                          <p className="font-medium text-ink">{s.child_name}</p>
                          <p className="text-xs text-muted">{s.parent_name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft">{s.grade}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{s.goal}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{tutor?.full_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink-soft">
                      {s.lessons_done}/{s.lessons_paid}
                      {balance < 0 && <span className="ml-1 font-medium text-red-600">{balance}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-surface-muted text-muted'
                        }`}
                      >
                        {s.status === 'active' ? 'Активен' : 'Спит'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-faint">
                    Ничего не найдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && <StudentForm tutors={tutors} onClose={() => setShowForm(false)} onSubmit={addStudent} />}
    </div>
  )
}

function StudentForm({
  tutors,
  onClose,
  onSubmit,
}: {
  tutors: Profile[]
  onClose: () => void
  onSubmit: (payload: Partial<Student>) => void
}) {
  const [form, setForm] = useState({
    parent_name: '',
    child_name: '',
    grade: '',
    goal: '',
    tutor_id: '',
    lessons_paid: 0,
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({ ...form, tutor_id: form.tutor_id || null, status: 'active' } as Partial<Student>)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-ink">Новый ученик</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Имя родителя</span>
            <input required value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Имя ребёнка</span>
            <input required value={form.child_name} onChange={(e) => setForm({ ...form, child_name: e.target.value })} className="input" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Класс</span>
              <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Цель</span>
              <input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Репетитор</span>
            <select value={form.tutor_id} onChange={(e) => setForm({ ...form, tutor_id: e.target.value })} className="input">
              <option value="">Не назначен</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Оплачено уроков</span>
            <input
              type="number"
              min={0}
              value={form.lessons_paid}
              onChange={(e) => setForm({ ...form, lessons_paid: Number(e.target.value) })}
              className="input"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-muted">
              Отмена
            </button>
            <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
