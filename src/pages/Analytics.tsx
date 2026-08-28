import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from '../lib/supabase'
import { LEAD_STATUSES, type Lead, type Payment } from '../types'
import { formatMoney } from '../lib/format'

const RANGE_OPTIONS = [
  { value: 7, label: '7 дней' },
  { value: 30, label: '30 дней' },
  { value: 90, label: '90 дней' },
  { value: 365, label: '365 дней' },
]

export default function Analytics() {
  const [range, setRange] = useState(30)
  const [leads, setLeads] = useState<Lead[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadData()
  }, [range])

  async function loadData() {
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - range)
    const sinceISO = since.toISOString()

    const [{ data: leadsData }, { data: paymentsData }] = await Promise.all([
      supabase.from('leads').select('*').gte('created_at', sinceISO),
      supabase.from('payments').select('*').gte('paid_at', sinceISO.slice(0, 10)),
    ])
    setLeads((leadsData as Lead[]) ?? [])
    setPayments((paymentsData as Payment[]) ?? [])
    setLoading(false)
  }

  const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0)
  const paidLeads = leads.filter((l) => l.status === 'paid').length
  const conversion = leads.length > 0 ? Math.round((paidLeads / leads.length) * 100) : 0

  const bySource = useMemo(() => {
    const map = new Map<string, { source: string; leads: number; paid: number }>()
    for (const lead of leads) {
      const entry = map.get(lead.source) ?? { source: lead.source, leads: 0, paid: 0 }
      entry.leads += 1
      if (lead.status === 'paid') entry.paid += 1
      map.set(lead.source, entry)
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, conversion: e.leads ? Math.round((e.paid / e.leads) * 100) : 0 }))
      .sort((a, b) => b.leads - a.leads)
  }, [leads])

  const funnel = LEAD_STATUSES.map((s) => ({
    status: s.label,
    count: leads.filter((l) => l.status === s.value).length,
  }))

  if (loading) return <div className="p-6 text-sm text-faint">Загрузка…</div>

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Аналитика</h1>
        <div className="flex gap-1.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                range === opt.value ? 'bg-lime text-lime-ink' : 'bg-surface-muted text-muted hover:bg-line'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="ДОХОД" value={formatMoney(totalRevenue)} />
        <Stat label="КОНВЕРСИЯ" value={`${conversion}%`} />
        <Stat label="ЛИДОВ ВСЕГО" value={String(leads.length)} />
      </div>

      <div className="mb-6 rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Воронка по статусам</h2>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={funnel} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="status" width={140} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#4169ff" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line-soft px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Источники по эффективности</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">Источник</th>
              <th className="px-4 py-2">Лиды</th>
              <th className="px-4 py-2">Конверсия</th>
              <th className="px-4 py-2">Оплат</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {bySource.map((row) => (
              <tr key={row.source}>
                <td className="px-4 py-2.5 font-medium text-ink">{row.source}</td>
                <td className="px-4 py-2.5 text-ink-soft">{row.leads}</td>
                <td className="px-4 py-2.5 text-ink-soft">{row.conversion}%</td>
                <td className="px-4 py-2.5 text-ink-soft">{row.paid}</td>
              </tr>
            ))}
            {bySource.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-faint">
                  Нет данных за период
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}
