import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'
import { LEVEL_ENTRY_KINDS, type Homework, type Student, type StudentLevelEntry } from '../../types'
import { formatDate } from '../../lib/format'

export default function ParentPortal() {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [student, setStudent] = useState<Student | null>(null)
  const [levelEntries, setLevelEntries] = useState<StudentLevelEntry[]>([])
  const [homeworks, setHomeworks] = useState<Homework[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadData()
  }, [profile])

  async function loadData() {
    if (!profile?.parent_of) return
    setLoading(true)
    const [{ data: st }, { data: lvl }, { data: hw }] = await Promise.all([
      supabase.from('students').select('*').eq('id', profile.parent_of).single(),
      supabase
        .from('student_level_entries')
        .select('*')
        .eq('student_id', profile.parent_of)
        .order('entry_date', { ascending: false }),
      supabase.from('homeworks').select('*').eq('student_id', profile.parent_of).order('assigned_date', { ascending: false }),
    ])
    setStudent(st as Student | null)
    setLevelEntries((lvl as StudentLevelEntry[]) ?? [])
    setHomeworks((hw as Homework[]) ?? [])
    setLoading(false)
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-faint">Загрузка…</div>
  if (!student) return <div className="flex min-h-screen items-center justify-center text-sm text-faint">Карточка не найдена</div>

  const balance = student.lessons_paid - student.lessons_done

  return (
    <div className="min-h-screen bg-page">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-ink">{student.child_name}</h1>
          <p className="text-sm text-muted">
            {student.grade} {student.goal && `· ${student.goal}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-muted"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={() => signOut()} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-muted">
            Выход
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Уроков проведено" value={String(student.lessons_done)} />
          <Stat label="Уроков оплачено" value={String(student.lessons_paid)} />
          <Stat label="Баланс" value={String(balance)} warn={balance < 0} />
        </div>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold text-ink">Промежуточные результаты</h2>
          {levelEntries.length === 0 ? (
            <p className="text-sm text-faint">Пока нет записей</p>
          ) : (
            <div className="space-y-2">
              {levelEntries.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-line-soft p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      {LEVEL_ENTRY_KINDS.find((k) => k.value === entry.kind)?.label}
                    </span>
                    <span className="text-xs text-faint">{formatDate(entry.entry_date)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink-soft">{entry.notes}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold text-ink">Домашние задания</h2>
          {homeworks.length === 0 ? (
            <p className="text-sm text-faint">Пока нет заданий</p>
          ) : (
            <div className="space-y-2">
              {homeworks.map((hw) => (
                <div key={hw.id} className="rounded-lg border border-line-soft p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-faint">{formatDate(hw.assigned_date)}</span>
                    {hw.grade != null && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                        Оценка: {hw.grade}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-soft">{hw.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 text-center">
      <p className={`text-2xl font-bold ${warn ? 'text-red-600' : 'text-ink'}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}
