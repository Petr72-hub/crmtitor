import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { TrialPlaybookSection } from '../types'

export default function TrialPlaybook() {
  const { profile } = useAuth()
  const canEdit = profile?.role === 'owner' || profile?.role === 'admin'
  const [sections, setSections] = useState<TrialPlaybookSection[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void loadSections()
  }, [])

  async function loadSections() {
    setLoading(true)
    const { data } = await supabase.from('trial_playbook_sections').select('*').order('sort_order')
    setSections((data as TrialPlaybookSection[]) ?? [])
    setLoading(false)
  }

  function startEdit(section: TrialPlaybookSection) {
    setEditingId(section.id)
    setDraft(section.content)
  }

  async function saveEdit(id: string) {
    setSaving(true)
    await supabase
      .from('trial_playbook_sections')
      .update({ content: draft, updated_at: new Date().toISOString() })
      .eq('id', id)
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, content: draft } : s)))
    setSaving(false)
    setEditingId(null)
  }

  if (loading) return <div className="p-6 text-sm text-faint">Загрузка…</div>

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Пробное занятие</h1>
        <p className="text-sm text-muted">
          Шаблоны первых сообщений, структура урока и критерии оценки.{' '}
          {canEdit ? 'Можно редактировать любой блок.' : 'Доступно только для чтения.'}
        </p>
      </header>

      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.id} className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-ink">{section.title}</h2>
              {canEdit && editingId !== section.id && (
                <button
                  onClick={() => startEdit(section)}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Изменить
                </button>
              )}
            </div>

            {editingId === section.id ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={Math.min(20, Math.max(6, draft.split('\n').length + 1))}
                  className="input font-mono text-xs"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-muted"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => saveEdit(section.id)}
                    disabled={saving}
                    className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-ink-soft">{section.content}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
