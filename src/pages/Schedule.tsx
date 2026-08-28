import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Lesson, LessonStatus, Profile, Student } from '../types'

interface LessonRow extends Lesson {
  student_name?: string
  tutor_name?: string
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export default function Schedule() {
  const { profile } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [tutors, setTutors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  useEffect(() => {
    void loadLessons()
    void loadRefs()
  }, [weekStart, profile])

  async function loadLessons() {
    setLoading(true)
    const from = iso(weekStart)
    const to = iso(addDays(weekStart, 6))
    let query = supabase
      .from('lessons')
      .select('*, students(child_name), profiles!lessons_tutor_id_fkey(full_name)')
      .gte('lesson_date', from)
      .lte('lesson_date', to)
      .order('start_time')
    if (profile?.role === 'tutor') query = query.eq('tutor_id', profile.id)
    const { data } = await query
    setLessons(
      (data ?? []).map((l: any) => ({ ...l, student_name: l.students?.child_name, tutor_name: l.profiles?.full_name })),
    )
    setLoading(false)
  }

  async function loadRefs() {
    const [{ data: st }, { data: tu }] = await Promise.all([
      supabase.from('students').select('*').order('child_name'),
      supabase.from('profiles').select('*').order('full_name'),
    ])
    setStudents((st as Student[]) ?? [])
    setTutors((tu as Profile[]) ?? [])
  }

  async function toggleDone(lesson: LessonRow) {
    const newStatus: LessonStatus = lesson.status === 'done' ? 'scheduled' : 'done'
    setLessons((prev) => prev.map((l) => (l.id === lesson.id ? { ...l, status: newStatus } : l)))
    await supabase.from('lessons').update({ status: newStatus }).eq('id', lesson.id)
  }

  async function addLesson(payload: Partial<Lesson>) {
    const { data } = await supabase.from('lessons').insert(payload).select('*, students(child_name), profiles!lessons_tutor_id_fkey(full_name)').single()
    if (data) {
      const row: any = data
      setLessons((prev) => [...prev, { ...row, student_name: row.students?.child_name, tutor_name: row.profiles?.full_name }])
    }
    setShowForm(false)
  }

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Расписание</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-muted">
            ←
          </button>
          <span className="text-sm font-medium text-ink-soft">
            {iso(weekStart)} — {iso(addDays(weekStart, 6))}
          </span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-muted">
            →
          </button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-muted">
            Сегодня
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + Урок
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-faint">Загрузка…</p>
      ) : (
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map((day, i) => {
            const dayLessons = lessons.filter((l) => l.lesson_date === iso(day))
            const isToday = iso(day) === iso(new Date())
            return (
              <div key={i} className={`rounded-xl border bg-surface p-2 ${isToday ? 'border-brand/50 ring-1 ring-brand/30' : 'border-line'}`}>
                <div className="mb-2 text-center">
                  <p className="text-xs font-medium uppercase text-faint">{WEEKDAYS[i]}</p>
                  <p className={`text-sm font-bold ${isToday ? 'text-brand' : 'text-ink'}`}>{day.getDate()}</p>
                </div>
                <div className="space-y-1.5">
                  {dayLessons.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => toggleDone(l)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-xs ${
                        l.status === 'done'
                          ? 'bg-green-50 text-green-700 line-through decoration-green-400'
                          : l.status === 'cancelled'
                            ? 'bg-red-50 text-red-500 line-through'
                            : 'bg-brand/10 text-brand'
                      }`}
                    >
                      <p className="font-semibold">{l.start_time.slice(0, 5)} {l.student_name}</p>
                      {l.topic && <p className="truncate opacity-80">{l.topic}</p>}
                      <p className="truncate opacity-60">{l.tutor_name}</p>
                    </button>
                  ))}
                  {dayLessons.length === 0 && <p className="py-4 text-center text-xs text-faint">—</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <LessonForm students={students} tutors={tutors} defaultTutor={profile?.role === 'tutor' ? profile.id : ''} onClose={() => setShowForm(false)} onSubmit={addLesson} />
      )}
    </div>
  )
}

function LessonForm({
  students,
  tutors,
  defaultTutor,
  onClose,
  onSubmit,
}: {
  students: Student[]
  tutors: Profile[]
  defaultTutor: string
  onClose: () => void
  onSubmit: (payload: Partial<Lesson>) => void
}) {
  const [form, setForm] = useState({
    student_id: '',
    tutor_id: defaultTutor,
    lesson_date: iso(new Date()),
    start_time: '10:00',
    duration_minutes: 60,
    topic: '',
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.student_id || !form.tutor_id) return
    onSubmit({ ...form, status: 'scheduled' } as Partial<Lesson>)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-ink">Новый урок</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Ученик</span>
            <select required value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} className="input">
              <option value="">Выберите ученика</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.child_name} ({s.parent_name})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Репетитор</span>
            <select required value={form.tutor_id} onChange={(e) => setForm({ ...form, tutor_id: e.target.value })} className="input">
              <option value="">Выберите репетитора</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Дата</span>
              <input type="date" required value={form.lesson_date} onChange={(e) => setForm({ ...form, lesson_date: e.target.value })} className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-soft">Время</span>
              <input type="time" required value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="input" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Тема (необязательно)</span>
            <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="input" />
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
