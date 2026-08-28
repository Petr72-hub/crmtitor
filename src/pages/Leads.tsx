import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { LEAD_SOURCES, LEAD_STATUSES, type Lead, type LeadStatus, type Profile } from '../types'
import { initials } from '../lib/format'

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [tutors, setTutors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    void loadLeads()
    void loadTutors()
  }, [])

  async function loadLeads() {
    setLoading(true)
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    setLeads((data as Lead[]) ?? [])
    setLoading(false)
  }

  async function loadTutors() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setTutors((data as Profile[]) ?? [])
  }

  async function updateStatus(id: string, status: LeadStatus) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
    await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  }

  async function addLead(payload: Partial<Lead>) {
    const { data } = await supabase.from('leads').insert(payload).select().single()
    if (data) setLeads((prev) => [data as Lead, ...prev])
    setShowForm(false)
  }

  const total = leads.length

  return (
    <div className="flex h-full flex-col p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Лиды · {total}</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Добавить лида
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-faint">Загрузка…</p>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-3 pb-4" style={{ minWidth: 'max-content' }}>
            {LEAD_STATUSES.map((col) => {
              const colLeads = leads.filter((l) => l.status === col.value)
              return (
                <div key={col.value} className="flex w-72 shrink-0 flex-col rounded-xl bg-surface-muted">
                  <div className="flex items-center justify-between rounded-t-xl border-b border-line px-3 py-2">
                    <span className="text-sm font-semibold text-ink-soft">{col.label}</span>
                    <span className="rounded-full bg-line px-2 py-0.5 text-xs font-medium text-muted">
                      {colLeads.length}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                    {colLeads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} tutors={tutors} onStatusChange={updateStatus} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showForm && <LeadForm tutors={tutors} onClose={() => setShowForm(false)} onSubmit={addLead} />}
    </div>
  )
}

function LeadCard({
  lead,
  tutors,
  onStatusChange,
}: {
  lead: Lead
  tutors: Profile[]
  onStatusChange: (id: string, status: LeadStatus) => void
}) {
  const tutor = tutors.find((t) => t.id === lead.assigned_tutor)
  const daysAgo = Math.floor((Date.now() - new Date(lead.updated_at).getTime()) / 86400000)

  return (
    <div className="rounded-lg border border-line bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
            {initials(lead.parent_name)}
          </div>
          <div>
            <p className="text-sm font-medium leading-tight text-ink">{lead.parent_name}</p>
            <p className="text-xs leading-tight text-muted">
              {lead.child_name} {lead.grade && `· ${lead.grade}`}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
        <span className="rounded bg-surface-muted px-1.5 py-0.5">{lead.source}</span>
        {tutor && <span className="rounded bg-surface-muted px-1.5 py-0.5">{tutor.full_name}</span>}
        <span>{daysAgo === 0 ? 'обновлён сегодня' : `${daysAgo}д тишина`}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="rounded bg-surface-muted px-2 py-1 text-xs hover:bg-surface-muted" title="Позвонить">
            📞
          </a>
        )}
        {lead.telegram && (
          <a
            href={`https://t.me/${lead.telegram.replace('@', '')}`}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-surface-muted px-2 py-1 text-xs hover:bg-surface-muted"
            title="Telegram"
          >
            ✈️
          </a>
        )}
        <select
          value={lead.status}
          onChange={(e) => onStatusChange(lead.id, e.target.value as LeadStatus)}
          className="ml-auto rounded border border-line bg-surface px-1.5 py-1 text-xs"
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function LeadForm({
  tutors,
  onClose,
  onSubmit,
}: {
  tutors: Profile[]
  onClose: () => void
  onSubmit: (payload: Partial<Lead>) => void
}) {
  const [form, setForm] = useState({
    parent_name: '',
    child_name: '',
    grade: '',
    goal: '',
    source: LEAD_SOURCES[0],
    phone: '',
    telegram: '',
    assigned_tutor: '',
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      ...form,
      assigned_tutor: form.assigned_tutor || null,
      status: 'new',
    } as Partial<Lead>)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-ink">Новый лид</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Имя родителя">
            <input
              required
              value={form.parent_name}
              onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Имя ребёнка">
            <input
              required
              value={form.child_name}
              onChange={(e) => setForm({ ...form, child_name: e.target.value })}
              className="input"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Класс">
              <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="input" />
            </Field>
            <Field label="Цель">
              <input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Источник">
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="input">
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Телефон">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
            </Field>
            <Field label="Telegram">
              <input value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="Репетитор">
            <select
              value={form.assigned_tutor}
              onChange={(e) => setForm({ ...form, assigned_tutor: e.target.value })}
              className="input"
            >
              <option value="">Не назначен</option>
              {tutors.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </Field>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  )
}
