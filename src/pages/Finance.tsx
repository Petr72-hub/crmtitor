import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Payment, Payout, Profile, Student } from '../types'
import { formatMoney, formatDate, todayISO } from '../lib/format'

export default function Finance() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [tutors, setTutors] = useState<Profile[]>([])
  const [lessonCounts, setLessonCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: pay }, { data: po }, { data: st }, { data: tu }, { data: lessons }] = await Promise.all([
      supabase.from('payments').select('*').order('paid_at', { ascending: false }),
      supabase.from('payouts').select('*').order('paid_at', { ascending: false }),
      supabase.from('students').select('*'),
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('lessons').select('tutor_id').eq('status', 'done'),
    ])
    setPayments((pay as Payment[]) ?? [])
    setPayouts((po as Payout[]) ?? [])
    setStudents((st as Student[]) ?? [])
    setTutors((tu as Profile[]) ?? [])

    const counts: Record<string, number> = {}
    for (const l of lessons ?? []) counts[l.tutor_id] = (counts[l.tutor_id] ?? 0) + 1
    setLessonCounts(counts)
    setLoading(false)
  }

  async function addPayment(payload: Partial<Payment>) {
    const { data } = await supabase.from('payments').insert(payload).select().single()
    if (data) {
      setPayments((prev) => [data as Payment, ...prev])
      await supabase
        .from('students')
        .update({ lessons_paid: (students.find((s) => s.id === payload.student_id)?.lessons_paid ?? 0) + 8 })
        .eq('id', payload.student_id)
      void loadAll()
    }
    setShowPayment(false)
  }

  async function payTutor(tutorId: string, amount: number, lessonsCount: number) {
    const payload = {
      tutor_id: tutorId,
      amount,
      lessons_count: lessonsCount,
      period_start: todayISO(),
      period_end: todayISO(),
      paid_at: todayISO(),
    }
    const { data } = await supabase.from('payouts').insert(payload).select().single()
    if (data) setPayouts((prev) => [data as Payout, ...prev])
  }

  const totalIncome = payments.reduce((s, p) => s + Number(p.amount), 0)
  const totalPaidOut = payouts.reduce((s, p) => s + Number(p.amount), 0)
  const netProfit = totalIncome - totalPaidOut
  const debtors = students.filter((s) => s.lessons_paid - s.lessons_done < 0)

  const payoutRows = useMemo(
    () =>
      tutors
        .filter((t) => t.role === 'tutor' || t.role === 'manager')
        .map((t) => {
          const doneLessons = lessonCounts[t.id] ?? 0
          const earned = doneLessons * Number(t.rate_per_lesson || 0)
          const paidOut = payouts.filter((p) => p.tutor_id === t.id).reduce((s, p) => s + Number(p.amount), 0)
          return { tutor: t, doneLessons, earned, paidOut, owed: Math.max(earned - paidOut, 0) }
        }),
    [tutors, lessonCounts, payouts],
  )

  if (loading) return <div className="p-6 text-sm text-gray-400">Загрузка…</div>

  return (
    <div className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Финансы</h1>
        <button
          onClick={() => setShowPayment(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + Зафиксировать оплату
        </button>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ЧИСТАЯ ПРИБЫЛЬ" value={formatMoney(netProfit)} />
        <Stat label="ПОСТУПЛЕНИЯ" value={formatMoney(totalIncome)} sub={`${payments.length} оплат`} />
        <Stat label="ВЫПЛАЧЕНО РЕПЕТИТОРАМ" value={formatMoney(totalPaidOut)} />
        <Stat label="ДОЛЖНИКИ" value={String(debtors.length)} sub={`${debtors.reduce((s, d) => s + (d.lessons_paid - d.lessons_done), 0)} уроков`} />
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">Расчёт выплат по репетиторам</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Репетитор</th>
              <th className="px-4 py-2">Ставка</th>
              <th className="px-4 py-2">Проведено уроков</th>
              <th className="px-4 py-2">Начислено</th>
              <th className="px-4 py-2">Выплачено</th>
              <th className="px-4 py-2">К выплате</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payoutRows.map((row) => (
              <tr key={row.tutor.id}>
                <td className="px-4 py-2.5 font-medium text-gray-900">{row.tutor.full_name}</td>
                <td className="px-4 py-2.5 text-gray-700">{formatMoney(row.tutor.rate_per_lesson)}</td>
                <td className="px-4 py-2.5 text-gray-700">{row.doneLessons}</td>
                <td className="px-4 py-2.5 text-gray-700">{formatMoney(row.earned)}</td>
                <td className="px-4 py-2.5 text-gray-700">{formatMoney(row.paidOut)}</td>
                <td className="px-4 py-2.5 font-semibold text-gray-900">{formatMoney(row.owed)}</td>
                <td className="px-4 py-2.5 text-right">
                  {row.owed > 0 && (
                    <button
                      onClick={() => payTutor(row.tutor.id, row.owed, row.doneLessons)}
                      className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      Выплатить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">Последние платежи</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {payments.slice(0, 10).map((p) => {
              const student = students.find((s) => s.id === p.student_id)
              return (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-700">
                    {student?.child_name ?? 'Ученик'} · {formatDate(p.paid_at)}
                  </span>
                  <span className="font-semibold text-green-600">+{formatMoney(p.amount)}</span>
                </li>
              )
            })}
            {payments.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Платежей ещё нет</li>}
          </ul>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">Ученики с задолженностью</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {debtors.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-700">{s.child_name}</span>
                <span className="font-semibold text-red-600">{s.lessons_paid - s.lessons_done} урока</span>
              </li>
            ))}
            {debtors.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Должников нет</li>}
          </ul>
        </div>
      </div>

      {showPayment && <PaymentForm students={students} onClose={() => setShowPayment(false)} onSubmit={addPayment} />}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function PaymentForm({
  students,
  onClose,
  onSubmit,
}: {
  students: Student[]
  onClose: () => void
  onSubmit: (payload: Partial<Payment>) => void
}) {
  const [form, setForm] = useState({ student_id: '', amount: 0, method: 'Карта', paid_at: todayISO() })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.student_id || form.amount <= 0) return
    onSubmit(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Новая оплата</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Ученик</span>
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
            <span className="mb-1 block text-sm font-medium text-gray-700">Сумма, ₽</span>
            <input
              type="number"
              required
              min={1}
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Способ оплаты</span>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="input">
              <option>Карта</option>
              <option>Наличные</option>
              <option>Перевод</option>
            </select>
          </label>
          <p className="text-xs text-gray-400">Оплата автоматически прибавит 8 уроков на баланс ученика.</p>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Отмена
            </button>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
