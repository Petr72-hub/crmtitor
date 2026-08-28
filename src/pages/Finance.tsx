import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { TARIFFS, type Payment, type Payout, type Profile, type Student, type TariffKey, type TariffPurchase } from '../types'
import { formatMoney, formatDate, todayISO } from '../lib/format'

export default function Finance() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [tutors, setTutors] = useState<Profile[]>([])
  const [tariffPurchases, setTariffPurchases] = useState<TariffPurchase[]>([])
  const [lessonCounts, setLessonCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [showTariff, setShowTariff] = useState(false)
  const [showTax, setShowTax] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: pay }, { data: po }, { data: st }, { data: tu }, { data: lessons }, { data: tp }] = await Promise.all([
      supabase.from('payments').select('*').order('paid_at', { ascending: false }),
      supabase.from('payouts').select('*').order('paid_at', { ascending: false }),
      supabase.from('students').select('*'),
      supabase.from('profiles').select('*').in('role', ['owner', 'admin', 'tutor']).order('full_name'),
      supabase.from('lessons').select('tutor_id').eq('status', 'done'),
      supabase.from('tariff_purchases').select('*').order('created_at', { ascending: false }),
    ])
    setPayments((pay as Payment[]) ?? [])
    setPayouts((po as Payout[]) ?? [])
    setStudents((st as Student[]) ?? [])
    setTutors((tu as Profile[]) ?? [])
    setTariffPurchases((tp as TariffPurchase[]) ?? [])

    const counts: Record<string, number> = {}
    for (const l of lessons ?? []) counts[l.tutor_id] = (counts[l.tutor_id] ?? 0) + 1
    setLessonCounts(counts)
    setLoading(false)
  }

  async function addPayment(payload: Partial<Payment>) {
    await supabase.from('payments').insert(payload)
    setShowPayment(false)
    void loadAll()
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

  async function createTariffPurchase(studentId: string, tariffKey: TariffKey) {
    const student = students.find((s) => s.id === studentId)
    const tariff = TARIFFS.find((t) => t.key === tariffKey)
    if (!student || !tariff) return
    const {
      data: { user },
    } = await supabase.auth.getUser()
    await supabase.from('tariff_purchases').insert({
      student_id: studentId,
      tariff: tariffKey,
      paid_lessons: tariff.paidLessons,
      free_lessons: tariff.freeLessons,
      total_lessons: tariff.paidLessons + tariff.freeLessons,
      price_per_lesson: student.price_per_lesson,
      amount: tariff.paidLessons * student.price_per_lesson,
      created_by: user?.id,
    })
    setShowTariff(false)
    void loadAll()
  }

  async function confirmTariffPurchase(tp: TariffPurchase) {
    setBusyId(tp.id)
    const student = students.find((s) => s.id === tp.student_id)
    const tariffLabel = TARIFFS.find((t) => t.key === tp.tariff)?.label ?? tp.tariff
    await supabase.from('payments').insert({
      student_id: tp.student_id,
      amount: tp.amount,
      paid_at: todayISO(),
      method: `Тариф «${tariffLabel}»`,
    })
    await supabase
      .from('tariff_purchases')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', tp.id)
    if (student) {
      await supabase
        .from('students')
        .update({ lessons_paid: student.lessons_paid + tp.total_lessons })
        .eq('id', student.id)
    }
    setBusyId(null)
    void loadAll()
  }

  async function cancelTariffPurchase(tp: TariffPurchase) {
    setBusyId(tp.id)
    await supabase.from('tariff_purchases').update({ status: 'cancelled' }).eq('id', tp.id)
    setBusyId(null)
    void loadAll()
  }

  const paymentsByStudent = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of payments) map[p.student_id] = (map[p.student_id] ?? 0) + Number(p.amount)
    return map
  }, [payments])

  const totalIncome = payments.reduce((s, p) => s + Number(p.amount), 0)
  const totalPaidOut = payouts.reduce((s, p) => s + Number(p.amount), 0)
  const netProfit = totalIncome - totalPaidOut

  const debtors = useMemo(
    () =>
      students
        .map((s) => ({ student: s, balance: (paymentsByStudent[s.id] ?? 0) - s.lessons_done * s.price_per_lesson }))
        .filter((d) => d.balance < -0.01),
    [students, paymentsByStudent],
  )

  const pendingTariffs = tariffPurchases.filter((t) => t.status === 'pending')

  const payoutRows = useMemo(
    () =>
      tutors
        .filter((t) => t.role === 'tutor' || t.role === 'admin')
        .map((t) => {
          const doneLessons = lessonCounts[t.id] ?? 0
          const earned = doneLessons * Number(t.rate_per_lesson || 0)
          const paidOut = payouts.filter((p) => p.tutor_id === t.id).reduce((s, p) => s + Number(p.amount), 0)
          return { tutor: t, doneLessons, earned, paidOut, owed: Math.max(earned - paidOut, 0) }
        }),
    [tutors, lessonCounts, payouts],
  )

  if (loading) return <div className="p-6 text-sm text-faint">Загрузка…</div>

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Финансы</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowTax(true)}
            className="rounded-lg bg-surface-muted px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-line"
          >
            Налоги
          </button>
          <button
            onClick={() => setShowTariff(true)}
            className="rounded-lg bg-brand/10 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/15"
          >
            Тариф
          </button>
          <button
            onClick={() => setShowPayment(true)}
            className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark"
          >
            + Зафиксировать оплату
          </button>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="ЧИСТАЯ ПРИБЫЛЬ" value={formatMoney(netProfit)} />
        <Stat label="ПОСТУПЛЕНИЯ" value={formatMoney(totalIncome)} sub={`${payments.length} оплат`} />
        <Stat label="ВЫПЛАЧЕНО РЕПЕТИТОРАМ" value={formatMoney(totalPaidOut)} />
        <Stat
          label="ДОЛЖНИКИ"
          value={String(debtors.length)}
          sub={`недоплата ${formatMoney(Math.abs(debtors.reduce((s, d) => s + d.balance, 0)))}`}
        />
      </div>

      {pendingTariffs.length > 0 && (
        <div className="mb-6 rounded-xl border border-brand/30 bg-brand/5 p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Ожидают подтверждения оплаты</h2>
          <div className="space-y-2">
            {pendingTariffs.map((tp) => {
              const student = students.find((s) => s.id === tp.student_id)
              const tariff = TARIFFS.find((t) => t.key === tp.tariff)
              return (
                <div key={tp.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-3">
                  <div className="text-sm">
                    <span className="font-medium text-ink">{student?.child_name ?? 'Ученик'}</span>
                    <span className="text-muted"> · тариф «{tariff?.label}» · {tp.total_lessons} занятий · </span>
                    <span className="font-semibold text-ink">{formatMoney(tp.amount)}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => cancelTariffPurchase(tp)}
                      disabled={busyId === tp.id}
                      className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-line disabled:opacity-50"
                    >
                      Отменить
                    </button>
                    <button
                      onClick={() => confirmTariffPurchase(tp)}
                      disabled={busyId === tp.id}
                      className="rounded-lg bg-lime px-3 py-1.5 text-xs font-semibold text-lime-ink hover:bg-lime-dark disabled:opacity-50"
                    >
                      Родитель оплатил
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="mb-6 overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line-soft px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Расчёт выплат по репетиторам</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted">
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
          <tbody className="divide-y divide-line-soft">
            {payoutRows.map((row) => (
              <tr key={row.tutor.id}>
                <td className="px-4 py-2.5 font-medium text-ink">{row.tutor.full_name}</td>
                <td className="px-4 py-2.5 text-ink-soft">{formatMoney(row.tutor.rate_per_lesson)}</td>
                <td className="px-4 py-2.5 text-ink-soft">{row.doneLessons}</td>
                <td className="px-4 py-2.5 text-ink-soft">{formatMoney(row.earned)}</td>
                <td className="px-4 py-2.5 text-ink-soft">{formatMoney(row.paidOut)}</td>
                <td className="px-4 py-2.5 font-semibold text-ink">{formatMoney(row.owed)}</td>
                <td className="px-4 py-2.5 text-right">
                  {row.owed > 0 && (
                    <button
                      onClick={() => payTutor(row.tutor.id, row.owed, row.doneLessons)}
                      className="rounded-lg bg-surface-muted px-3 py-1 text-xs font-medium text-ink-soft hover:bg-line"
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
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line-soft px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Последние платежи</h2>
          </div>
          <ul className="divide-y divide-line-soft">
            {payments.slice(0, 10).map((p) => {
              const student = students.find((s) => s.id === p.student_id)
              return (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-ink-soft">
                    {student?.child_name ?? 'Ученик'} · {p.method} · {formatDate(p.paid_at)}
                  </span>
                  <span className="font-semibold text-green-600">+{formatMoney(p.amount)}</span>
                </li>
              )
            })}
            {payments.length === 0 && <li className="px-4 py-6 text-center text-faint">Платежей ещё нет</li>}
          </ul>
        </div>

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="border-b border-line-soft px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Ученики с задолженностью</h2>
          </div>
          <ul className="divide-y divide-line-soft">
            {debtors.map((d) => (
              <li key={d.student.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-ink-soft">{d.student.child_name}</span>
                <span className="font-semibold text-red-600">−{formatMoney(Math.abs(d.balance))}</span>
              </li>
            ))}
            {debtors.length === 0 && <li className="px-4 py-6 text-center text-faint">Должников нет</li>}
          </ul>
        </div>
      </div>

      {showPayment && <PaymentForm students={students} onClose={() => setShowPayment(false)} onSubmit={addPayment} />}
      {showTariff && (
        <TariffForm students={students} onClose={() => setShowTariff(false)} onSubmit={createTariffPurchase} />
      )}
      {showTax && <TaxModal payments={payments} onClose={() => setShowTax(false)} />}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-faint">{sub}</p>}
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
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-ink">Новая оплата</h2>
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
            <span className="mb-1 block text-sm font-medium text-ink-soft">Сумма, ₽</span>
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
            <span className="mb-1 block text-sm font-medium text-ink-soft">Способ оплаты</span>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} className="input">
              <option>Карта</option>
              <option>Наличные</option>
              <option>Перевод</option>
            </select>
          </label>
          <p className="text-xs text-faint">
            Для произвольной оплаты не по тарифу. Уроки на баланс ученика не начисляются — для этого используйте кнопку «Тариф».
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-muted">
              Отмена
            </button>
            <button type="submit" className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark">
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TariffForm({
  students,
  onClose,
  onSubmit,
}: {
  students: Student[]
  onClose: () => void
  onSubmit: (studentId: string, tariff: TariffKey) => void
}) {
  const [studentId, setStudentId] = useState('')
  const [tariffKey, setTariffKey] = useState<TariffKey>('start')

  const student = students.find((s) => s.id === studentId)
  const tariff = TARIFFS.find((t) => t.key === tariffKey)!
  const amount = student ? student.price_per_lesson * tariff.paidLessons : 0
  const priceMissing = !!student && student.price_per_lesson <= 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!studentId || priceMissing) return
    onSubmit(studentId, tariffKey)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-ink">Оплата тарифа</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Ученик</span>
            <select required value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input">
              <option value="">Выберите ученика</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.child_name} ({s.parent_name})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Тариф</span>
            <select value={tariffKey} onChange={(e) => setTariffKey(e.target.value as TariffKey)} className="input">
              {TARIFFS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} — {t.paidLessons} занятий + {t.freeLessons} в подарок
                </option>
              ))}
            </select>
          </label>

          {priceMissing && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              У ученика не задана стоимость урока — укажите её в карточке ученика (вкладка «Информация»).
            </p>
          )}

          {student && !priceMissing && (
            <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-soft">
              {tariff.paidLessons} занятий × {formatMoney(student.price_per_lesson)} ={' '}
              <span className="font-semibold text-ink">{formatMoney(amount)}</span>
              <br />
              Итого на баланс: {tariff.paidLessons + tariff.freeLessons} занятий (из них {tariff.freeLessons} в подарок)
            </div>
          )}

          <p className="text-xs text-faint">
            Создастся заявка на оплату. Занятия зачислятся ученику только после того, как вы подтвердите, что родитель заплатил.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-muted">
              Отмена
            </button>
            <button
              type="submit"
              disabled={!studentId || priceMissing}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Создать заявку
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const TAX_DEDUCTION_KEY = 'npd_deduction_remaining'
const TAX_RATE = 0.04
const TAX_DEDUCTION_RATE = 0.01
const TAX_DEDUCTION_TOTAL = 10000

function TaxModal({ payments, onClose }: { payments: Payment[]; onClose: () => void }) {
  const [startDeduction, setStartDeduction] = useState<number>(() => {
    const stored = localStorage.getItem(TAX_DEDUCTION_KEY)
    return stored ? Number(stored) : TAX_DEDUCTION_TOTAL
  })

  useEffect(() => {
    localStorage.setItem(TAX_DEDUCTION_KEY, String(startDeduction))
  }, [startDeduction])

  const rows = useMemo(() => {
    const byMonth: Record<string, number> = {}
    for (const p of payments) {
      const month = p.paid_at.slice(0, 7)
      byMonth[month] = (byMonth[month] ?? 0) + Number(p.amount)
    }
    const months = Object.keys(byMonth).sort()
    let pool = startDeduction
    return months.map((month) => {
      const income = byMonth[month]
      const baseTax = income * TAX_RATE
      const deduction = Math.min(pool, income * TAX_DEDUCTION_RATE)
      pool -= deduction
      const netTax = baseTax - deduction
      const [y, m] = month.split('-').map(Number)
      const dueDate = new Date(y, m, 28)
      return { month, income, baseTax, deduction, netTax, dueDate, poolLeft: pool }
    })
  }, [payments, startDeduction])

  const totalTax = rows.reduce((s, r) => s + r.netTax, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface p-6 shadow-lg">
        <h2 className="mb-1 text-lg font-bold text-ink">Налог для самозанятого (НПД)</h2>
        <p className="mb-4 text-sm text-muted">
          Оценка по ставке 4% с доходов от физлиц (родителей). Официальную сумму и счёт формирует ФНС в приложении
          «Мой налог» — здесь только прикидка для планирования. Ставка одинакова по всей России, от региона не зависит.
        </p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-ink-soft">
            Остаток налогового вычета (разовый, максимум {formatMoney(TAX_DEDUCTION_TOTAL)} с начала деятельности)
          </span>
          <input
            type="number"
            min={0}
            max={TAX_DEDUCTION_TOTAL}
            value={startDeduction}
            onChange={(e) => setStartDeduction(Number(e.target.value))}
            className="input max-w-xs"
          />
        </label>

        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Месяц</th>
                <th className="px-3 py-2">Доход</th>
                <th className="px-3 py-2">Налог 4%</th>
                <th className="px-3 py-2">Вычет</th>
                <th className="px-3 py-2">К оплате</th>
                <th className="px-3 py-2">Срок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => (
                <tr key={r.month}>
                  <td className="px-3 py-2 text-ink-soft">{r.month}</td>
                  <td className="px-3 py-2 text-ink-soft">{formatMoney(r.income)}</td>
                  <td className="px-3 py-2 text-ink-soft">{formatMoney(r.baseTax)}</td>
                  <td className="px-3 py-2 text-ink-soft">−{formatMoney(r.deduction)}</td>
                  <td className="px-3 py-2 font-semibold text-ink">{formatMoney(r.netTax)}</td>
                  <td className="px-3 py-2 text-faint">{formatDate(r.dueDate.toISOString())}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-faint">
                    Пока нет платежей для расчёта
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-sm text-ink-soft">
          Итого налогов за всё время: <span className="font-semibold text-ink">{formatMoney(totalTax)}</span>
        </p>

        <div className="flex justify-end pt-4">
          <button onClick={onClose} className="rounded-lg bg-surface-muted px-4 py-2 text-sm font-medium text-ink-soft hover:bg-line">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
