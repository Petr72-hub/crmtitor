import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { CONTENT_PLATFORMS, type ContentNote, type ContentPlatform } from '../types'
import { formatDate } from '../lib/format'

export default function ContentNotes() {
  const [notes, setNotes] = useState<ContentNote[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ContentPlatform | 'all'>('all')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    void loadNotes()
  }, [])

  async function loadNotes() {
    setLoading(true)
    const { data } = await supabase.from('content_notes').select('*').order('created_at', { ascending: false })
    setNotes((data as ContentNote[]) ?? [])
    setLoading(false)
  }

  async function addNote(payload: Partial<ContentNote>) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('content_notes')
      .insert({ ...payload, created_by: user?.id })
      .select()
      .single()
    if (data) setNotes((prev) => [data as ContentNote, ...prev])
    setShowForm(false)
  }

  async function deleteNote(id: string) {
    if (!confirm('Удалить заметку?')) return
    setNotes((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('content_notes').delete().eq('id', id)
  }

  const filtered = useMemo(
    () => (filter === 'all' ? notes : notes.filter((n) => n.platform === filter)),
    [notes, filter],
  )

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Контент · {notes.length}</h1>
          <p className="text-sm text-muted">Идеи для постов и заметки по площадкам</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark"
        >
          + Добавить заметку
        </button>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            filter === 'all' ? 'bg-lime text-lime-ink' : 'bg-surface-muted text-muted hover:bg-line'
          }`}
        >
          Все
        </button>
        {CONTENT_PLATFORMS.map((p) => (
          <button
            key={p.value}
            onClick={() => setFilter(p.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === p.value ? 'bg-lime text-lime-ink' : 'bg-surface-muted text-muted hover:bg-line'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-faint">Загрузка…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((note) => (
            <div key={note.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  {CONTENT_PLATFORMS.find((p) => p.value === note.platform)?.label}
                </span>
                <button onClick={() => deleteNote(note.id)} className="text-xs text-faint hover:text-red-600">
                  Удалить
                </button>
              </div>
              <h3 className="mb-1 font-semibold text-ink">{note.title}</h3>
              <p className="whitespace-pre-wrap text-sm text-ink-soft">{note.body}</p>
              <p className="mt-2 text-xs text-faint">{formatDate(note.created_at)}</p>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-sm text-faint">Заметок пока нет</p>}
        </div>
      )}

      {showForm && <NoteForm onClose={() => setShowForm(false)} onSubmit={addNote} />}
    </div>
  )
}

function NoteForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (payload: Partial<ContentNote>) => void
}) {
  const [form, setForm] = useState({ platform: CONTENT_PLATFORMS[0].value, title: '', body: '' })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-bold text-ink">Новая заметка</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Площадка</span>
            <select
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value as ContentPlatform })}
              className="input"
            >
              {CONTENT_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Заголовок</span>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Текст</span>
            <textarea
              rows={5}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="input"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface-muted">
              Отмена
            </button>
            <button type="submit" className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark">
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
