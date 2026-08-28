import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatMoney, todayISO } from '../lib/format'
import type { Lesson } from '../types'

interface LessonWithNames extends Lesson {
  student_name?: string
  tutor_name?: string
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [revenueMonth, setRevenueMonth] = useState(0)
  const [studentsTotal, setStudentsTotal] = useState(0)
  const [leadsTotal, setLeadsTotal] = useState(0)
  const [paidLeads, setPaidLeads] = useState(0)
  const [todayLessons, setTodayLessons] = useState<LessonWithNames[]>([])
  const [staleLeads, setStaleLeads] = useState(0)
  const [zeroBalanceStudents, setZeroBalanceStudents] = useState(0)

  useEffect(() => {
    void loadData()
  }, [profile])

  async function loadData() {
    if (!profile) return
    setLoading(true)
    const isTutor = profile.role === 'tutor'
    const monthAgo = new Date()
    monthAgo.setDate(1)
    const monthStartISO = monthAgo.toISOString().slice(0, 10)

    const paymentsQuery = supabase.from('payments').select('amount').gte('paid_at', monthStartISO)
    const studentsQuery = isTutor
      ? supabase.from('students').select('id', { count: 'exact', head: true }).eq('tutor_id', profile.id)
      : supabase.from('students').select('id', { count: 'exact', head: true })
    const leadsQuery = supabase.from('leads').select('id, status, created_at')

    const lessonsQuery = supabase
      .from('lessons')
      .select('*, students(child_name), profiles!lessons_tutor_id_fkey(full_name)')
      .eq('lesson_date', todayISO())
      .order('start_time', { ascending: true })

    const [{ data: payments }, { count: studentsCount }, { data: leads }, { data: lessons }] =
      await Promise.all([paymentsQuery, studentsQuery, leadsQuery, isTutor ? lessonsQuery.eq('tutor_id', profile.id) : lessonsQuery])

    setRevenueMonth((payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0))
    setStudentsTotal(studentsCount ?? 0)
    setLeadsTotal(leads?.length ?? 0)
    setPaidLeads((leads ?? []).filter((l) => l.status === 'paid').length)

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    setStaleLeads(
      (leads ?? []).filter(
        (l) => !['paid', 'rejected'].includes(l.status) && new Date(l.created_at).getTime() < sevenDaysAgo,
      ).length,
    )

    const { count: zeroBalance } = await supabase
      .from('students')
      .select('id', { count: 'exact', head: true })
      .lte('lessons_paid', 0)

    setZeroBalanceStudents(zeroBalance ?? 0)

    setTodayLessons(
      (lessons ?? []).map((l: any) => ({
        ...l,
        student_name: l.students?.child_name,
        tutor_name: l.profiles?.full_name,
      })),
    )
    setLoading(false)
  }

  const conversion = leadsTotal > 0 ? Math.round((paidLeads / leadsTotal) * 100) : 0
  const doneLessons = todayLessons.filter((l) => l.status === 'done').length

  if (loading) return <PageLoading />

  return (
    <div className="p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Сегодня</h1>
        <p className="text-sm text-muted">
          {new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date())}
        </p>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="ВЫРУЧКА, МЕСЯЦ" value={formatMoney(revenueMonth)} />
        <StatCard label="УЧЕНИКОВ ВСЕГО" value={String(studentsTotal)} />
        <StatCard label="УРОКОВ СЕГОДНЯ" value={`${doneLessons}/${todayLessons.length}`} />
        <StatCard label="КОНВЕРСИЯ В ОПЛАТУ" value={`${conversion}%`} />
      </div>

      {profile?.role !== 'tutor' && (staleLeads > 0 || zeroBalanceStudents > 0) && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-amber-900">Системные задачи</h2>
          <ul className="space-y-1 text-sm text-amber-800">
            {staleLeads > 0 && (
              <li className="flex items-center justify-between">
                <span>{staleLeads} лид(ов) без движения 7+ дней</span>
                <Link to="/leads" className="font-medium underline">
                  Посмотреть
                </Link>
              </li>
            )}
            {zeroBalanceStudents > 0 && (
              <li className="flex items-center justify-between">
                <span>{zeroBalanceStudents} учеников с нулевым балансом уроков</span>
                <Link to="/students" className="font-medium underline">
                  Посмотреть
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Расписание сегодня</h2>
          <Link to="/schedule" className="text-sm font-medium text-brand hover:underline">
            Открыть →
          </Link>
        </div>
        {todayLessons.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">Уроков на сегодня нет</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {todayLessons.map((lesson) => (
              <li key={lesson.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className="w-12 font-medium text-ink-soft">{lesson.start_time.slice(0, 5)}</span>
                  <span className="text-ink">
                    {lesson.student_name} {lesson.topic ? `— ${lesson.topic}` : ''}
                  </span>
                  <span className="text-faint">{lesson.tutor_name}</span>
                </div>
                <StatusPill status={lesson.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: 'bg-blue-50 text-blue-700',
    done: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-700',
  }
  const label: Record<string, string> = {
    scheduled: 'Запланирован',
    done: 'Проведён',
    cancelled: 'Отменён',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-surface-muted text-muted'}`}>
      {label[status] ?? status}
    </span>
  )
}

function PageLoading() {
  return <div className="p-6 text-sm text-faint">Загрузка…</div>
}
