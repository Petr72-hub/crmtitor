import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Lesson, LessonStatus, Profile, Student } from '../types'

interface LessonRow extends Lesson {
  student_name?: string
  tutor_name?: string
}

type ViewMode = 'day' | 'week' | 'month'

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isSameDay(a: Date, b: Date): boolean {
  return iso(a) === iso(b)
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const MONTH_NAMES = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

const DAY_TITLE_FORMAT = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })

export default function Schedule() {
  const { profile } = useAuth()
  const [view, setView] = useState<ViewMode>('week')
  const [cursor, setCursor] = useState(() => new Date())
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [tutors, setTutors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formDate, setFormDate] = useState<string>(iso(new Date()))

  const range = useMemo(() => {
    if (view === 'day') return { from: cursor, to: cursor }
    if (view === 'week') {
      const start = startOfWeek(cursor)
      return { from: start, to: addDays(start, 6) }
    }
    const monthStart = startOfMonth(cursor)
    const gridStart = startOfWeek(monthStart)
    return { from: gridStart, to: addDays(gridStart, 41) }
  }, [view, cursor])

  useEffect(() => {
    void loadLessons()
  }, [range.from.getTime(), range.to.getTime(), profile])

  useEffect(() => {
    void loadRefs()
  }, [])

  async function loadLessons() {
    setLoading(true)
    let query = supabase
      .from('lessons')
      .select('*, students(child_name), profiles!lessons_tutor_id_fkey(full_name)')
      .gte('lesson_date', iso(range.from))
      .lte('lesson_date', iso(range.to))
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
      supabase.from('profiles').select('*').in('role', ['owner', 'admin', 'tutor']).order('full_name'),
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
    const { data } = await supabase
      .from('lessons')
      .insert(payload)
      .select('*, students(child_name), profiles!lessons_tutor_id_fkey(full_name)')
      .single()
    if (data) {
      const row: any = data
      setLessons((prev) => [...prev, { ...row, student_name: row.students?.child_name, tutor_name: row.profiles?.full_name }])
    }
    setShowForm(false)
  }

  function openAddForm(date?: Date) {
    setFormDate(iso(date ?? cursor))
    setShowForm(true)
  }

  function goPrev() {
    if (view === 'day') setCursor((d) => addDays(d, -1))
    else if (view === 'week') setCursor((d) => addDays(d, -7))
    else setCursor((d) => addMonths(d, -1))
  }

  function goNext() {
    if (view === 'day') setCursor((d) => addDays(d, 1))
    else if (view === 'week') setCursor((d) => addDays(d, 7))
    else setCursor((d) => addMonths(d, 1))
  }

  const title = useMemo(() => {
    if (view === 'day') return capitalize(DAY_TITLE_FORMAT.format(cursor))
    if (view === 'week') {
      const start = startOfWeek(cursor)
      const end = addDays(start, 6)
      const sameMonth = start.getMonth() === end.getMonth()
      const startStr = `${start.getDate()}${sameMonth ? '' : ' ' + MONTH_NAMES[start.getMonth()]}`
      return `${startStr} — ${end.getDate()} ${MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`
    }
    return `${capitalize(MONTH_NAMES[cursor.getMonth()])} ${cursor.getFullYear()}`
  }, [view, cursor])

  return (
    <div className="flex h-full flex-col p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">{title}</h1>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                ['day', 'День'],
                ['week', 'Неделя'],
                ['month', 'Месяц'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setView(value)}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                  view === value ? 'bg-brand text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={goPrev} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-muted">
            ←
          </button>
          <button onClick={() => setCursor(new Date())} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-muted">
            Сегодня
          </button>
          <button onClick={goNext} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface-muted">
            →
          </button>
          <button
            onClick={() => openAddForm()}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + Урок
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-faint">Загрузка…</p>
      ) : view === 'month' ? (
        <MonthGrid
          cursor={cursor}
          lessons={lessons}
          onDayClick={(day) => {
            setCursor(day)
            setView('day')
          }}
          onAddClick={openAddForm}
        />
      ) : view === 'week' ? (
        <WeekGrid cursor={cursor} lessons={lessons} onToggleDone={toggleDone} />
      ) : (
        <DayAgenda cursor={cursor} lessons={lessons} onToggleDone={toggleDone} />
      )}

      {showForm && (
        <LessonForm
          students={students}
          tutors={tutors}
          defaultTutor={profile?.role === 'tutor' ? profile.id : ''}
          defaultDate={formDate}
          onClose={() => setShowForm(false)}
          onSubmit={addLesson}
        />
      )}
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function lessonPillClass(status: LessonStatus): string {
  if (status === 'done') return 'bg-green-50 text-green-700 line-through decoration-green-400'
  if (status === 'cancelled') return 'bg-red-50 text-red-500 line-through'
  return 'bg-brand/10 text-brand'
}

function WeekGrid({
  cursor,
  lessons,
  onToggleDone,
}: {
  cursor: Date
  lessons: LessonRow[]
  onToggleDone: (l: LessonRow) => void
}) {
  const weekStart = startOfWeek(cursor)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="grid grid-cols-7 gap-3">
      {weekDays.map((day, i) => {
        const dayLessons = lessons.filter((l) => l.lesson_date === iso(day))
        const isToday = isSameDay(day, new Date())
        return (
          <div key={i} className={`rounded-xl border bg-surface p-2 ${isToday ? 'border-brand/50 ring-1 ring-brand/30' : 'border-line'}`}>
            <div className="mb-2 text-center">
              <p className="text-xs font-medium uppercase text-faint">{WEEKDAYS[i]}</p>
              <p className={`text-sm font-bold ${isToday ? 'text-brand' : 'text-ink'}`}>{day.getDate()}</p>
            </div>
            <div className="space-y-1.5">
              {dayLessons.map((l) => (
                <button key={l.id} onClick={() => onToggleDone(l)} className={`w-full rounded-lg px-2 py-1.5 text-left text-xs ${lessonPillClass(l.status)}`}>
                  <p className="font-semibold">
                    {l.start_time.slice(0, 5)} {l.student_name}
                  </p>
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
  )
}

function MonthGrid({
  cursor,
  lessons,
  onDayClick,
  onAddClick,
}: {
  cursor: Date
  lessons: LessonRow[]
  onDayClick: (day: Date) => void
  onAddClick: (day: Date) => void
}) {
  const gridStart = startOfWeek(startOfMonth(cursor))
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const today = new Date()

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="border-r border-line px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted last:border-r-0">
            {wd}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((day, i) => {
          const dayLessons = lessons.filter((l) => l.lesson_date === iso(day))
          const inMonth = day.getMonth() === cursor.getMonth()
          const isToday = isSameDay(day, today)
          const visible = dayLessons.slice(0, 3)
          const overflow = dayLessons.length - visible.length

          return (
            <div
              key={i}
              onClick={() => onDayClick(day)}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onAddClick(day)
              }}
              className={`group relative min-h-[90px] cursor-pointer border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0 ${
                inMonth ? '' : 'bg-surface-muted/60'
              } hover:bg-surface-muted`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    isToday ? 'bg-brand text-white' : inMonth ? 'text-ink' : 'text-faint'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {visible.map((l) => (
                  <p key={l.id} className={`truncate rounded px-1 py-0.5 text-[11px] ${lessonPillClass(l.status)}`}>
                    {l.start_time.slice(0, 5)} {l.student_name}
                  </p>
                ))}
                {overflow > 0 && <p className="px-1 text-[11px] font-medium text-muted">ещё {overflow}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayAgenda({
  cursor,
  lessons,
  onToggleDone,
}: {
  cursor: Date
  lessons: LessonRow[]
  onToggleDone: (l: LessonRow) => void
}) {
  const dayLessons = lessons.filter((l) => l.lesson_date === iso(cursor)).sort((a, b) => a.start_time.localeCompare(b.start_time))

  return (
    <div className="mx-auto w-full max-w-xl space-y-2">
      {dayLessons.length === 0 && <p className="py-12 text-center text-sm text-faint">На этот день уроков нет</p>}
      {dayLessons.map((l) => (
        <button
          key={l.id}
          onClick={() => onToggleDone(l)}
          className={`flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-4 text-left hover:bg-surface-muted`}
        >
          <span className="w-14 shrink-0 text-lg font-bold text-ink">{l.start_time.slice(0, 5)}</span>
          <div className="min-w-0 flex-1">
            <p className={`font-semibold ${l.status === 'done' || l.status === 'cancelled' ? lessonPillClass(l.status) : 'text-ink'}`}>
              {l.student_name}
            </p>
            {l.topic && <p className="truncate text-sm text-muted">{l.topic}</p>}
            <p className="truncate text-xs text-faint">{l.tutor_name}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${lessonPillClass(l.status)}`}>
            {l.status === 'done' ? 'Проведён' : l.status === 'cancelled' ? 'Отменён' : 'Запланирован'}
          </span>
        </button>
      ))}
    </div>
  )
}

function LessonForm({
  students,
  tutors,
  defaultTutor,
  defaultDate,
  onClose,
  onSubmit,
}: {
  students: Student[]
  tutors: Profile[]
  defaultTutor: string
  defaultDate: string
  onClose: () => void
  onSubmit: (payload: Partial<Lesson>) => void
}) {
  const [form, setForm] = useState({
    student_id: '',
    tutor_id: defaultTutor,
    lesson_date: defaultDate,
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
