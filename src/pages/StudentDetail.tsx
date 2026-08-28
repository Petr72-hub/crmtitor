import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { createParentAccount, resetAccountPassword, deleteAccount } from '../lib/manageUsers'
import {
  INTERVIEW_QUESTIONS,
  LEVEL_ENTRY_KINDS,
  type Homework,
  type LevelEntryKind,
  type MockExam,
  type Profile,
  type Student,
  type StudentLevelEntry,
} from '../types'
import { formatDate, formatMoney, todayISO } from '../lib/format'

const TABS = [
  { key: 'info', label: 'Информация' },
  { key: 'level', label: 'Уровень' },
  { key: 'interview', label: 'Интересы' },
  { key: 'mocks', label: 'Пробники' },
  { key: 'homework', label: 'Домашние задания' },
  { key: 'parent', label: 'Доступ родителя' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canManage = profile?.role === 'owner' || profile?.role === 'admin'
  const [student, setStudent] = useState<Student | null>(null)
  const [tutors, setTutors] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('info')

  useEffect(() => {
    void loadStudent()
    void loadTutors()
  }, [id])

  async function loadStudent() {
    setLoading(true)
    const { data } = await supabase.from('students').select('*').eq('id', id).single()
    setStudent(data as Student | null)
    setLoading(false)
  }

  async function loadTutors() {
    const { data } = await supabase.from('profiles').select('*').in('role', ['owner', 'admin', 'tutor']).order('full_name')
    setTutors((data as Profile[]) ?? [])
  }

  const visibleTabs = TABS.filter((t) => t.key !== 'parent' || canManage)

  if (loading) return <div className="p-6 text-sm text-faint">Загрузка…</div>
  if (!student) return <div className="p-6 text-sm text-faint">Ученик не найден</div>

  return (
    <div className="p-6">
      <button onClick={() => navigate('/students')} className="mb-3 text-sm text-muted hover:text-ink">
        ← Все ученики
      </button>
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-ink">{student.child_name}</h1>
        <p className="text-sm text-muted">
          {student.parent_name} · {student.grade} {student.goal && `· ${student.goal}`}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5 border-b border-line pb-2">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.key ? 'bg-lime text-lime-ink' : 'text-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && <InfoTab student={student} tutors={tutors} onUpdate={setStudent} />}
      {tab === 'level' && <LevelTab studentId={student.id} />}
      {tab === 'interview' && <InterviewTab student={student} onUpdate={setStudent} />}
      {tab === 'mocks' && <MocksTab studentId={student.id} />}
      {tab === 'homework' && <HomeworkTab studentId={student.id} />}
      {tab === 'parent' && canManage && <ParentAccessTab student={student} />}
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

function BalanceSummary({ student }: { student: Student }) {
  const [totalPaid, setTotalPaid] = useState<number | null>(null)

  useEffect(() => {
    void load()
  }, [student.id])

  async function load() {
    const { data } = await supabase.from('payments').select('amount').eq('student_id', student.id)
    setTotalPaid((data ?? []).reduce((sum, p) => sum + Number(p.amount), 0))
  }

  if (totalPaid === null) return null

  const owed = student.lessons_done * student.price_per_lesson
  const balance = totalPaid - owed
  const isDebt = balance < 0

  return (
    <div className={`rounded-lg px-3 py-2 text-sm font-medium ${isDebt ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
      Проведено уроков на {formatMoney(owed)} · оплачено {formatMoney(totalPaid)} ·{' '}
      {isDebt ? `недоплата ${formatMoney(Math.abs(balance))}` : `баланс +${formatMoney(balance)}`}
    </div>
  )
}

function InfoTab({
  student,
  tutors,
  onUpdate,
}: {
  student: Student
  tutors: Profile[]
  onUpdate: (s: Student) => void
}) {
  const [form, setForm] = useState(student)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => setForm(student), [student])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { data } = await supabase
      .from('students')
      .update({
        parent_name: form.parent_name,
        child_name: form.child_name,
        grade: form.grade,
        goal: form.goal,
        tutor_id: form.tutor_id || null,
        status: form.status,
        lessons_paid: form.lessons_paid,
        price_per_lesson: form.price_per_lesson,
        parent_phone: form.parent_phone,
        student_phone: form.student_phone,
        max_link: form.max_link,
        vk_link: form.vk_link,
        video_consent: form.video_consent,
      })
      .eq('id', student.id)
      .select()
      .single()
    setSaving(false)
    if (data) {
      onUpdate(data as Student)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-2xl space-y-4 rounded-xl border border-line bg-surface p-5">
      {student.video_consent && (
        <div className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-medium text-brand">
          🎥 Согласен(на) на съёмку видео во время занятий
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Имя родителя">
          <input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} className="input" />
        </Field>
        <Field label="Имя ребёнка">
          <input value={form.child_name} onChange={(e) => setForm({ ...form, child_name: e.target.value })} className="input" />
        </Field>
        <Field label="Телефон родителя">
          <input value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} className="input" />
        </Field>
        <Field label="Телефон ученика">
          <input value={form.student_phone} onChange={(e) => setForm({ ...form, student_phone: e.target.value })} className="input" />
        </Field>
        <Field label="Ссылка на Макс">
          <input value={form.max_link} onChange={(e) => setForm({ ...form, max_link: e.target.value })} className="input" />
        </Field>
        <Field label="Ссылка на ВКонтакте">
          <input value={form.vk_link} onChange={(e) => setForm({ ...form, vk_link: e.target.value })} className="input" />
        </Field>
        <Field label="Класс">
          <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="input" />
        </Field>
        <Field label="Цель">
          <input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} className="input" />
        </Field>
        <Field label="Репетитор">
          <select value={form.tutor_id ?? ''} onChange={(e) => setForm({ ...form, tutor_id: e.target.value || null })} className="input">
            <option value="">Не назначен</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Статус">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Student['status'] })} className="input">
            <option value="active">Активен</option>
            <option value="sleeping">Спит</option>
          </select>
        </Field>
        <Field label="Стоимость урока, ₽">
          <input
            type="number"
            min={0}
            value={form.price_per_lesson}
            onChange={(e) => setForm({ ...form, price_per_lesson: Number(e.target.value) })}
            className="input"
          />
        </Field>
        <Field label="Доступно занятий (из тарифов)">
          <input value={Math.max(form.lessons_paid - form.lessons_done, 0)} disabled className="input opacity-60" />
        </Field>
        <Field label="Проведено уроков">
          <input value={form.lessons_done} disabled className="input opacity-60" />
        </Field>
      </div>

      <BalanceSummary student={student} />

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.video_consent}
          onChange={(e) => setForm({ ...form, video_consent: e.target.checked })}
          className="h-4 w-4 rounded border-line accent-[#4169ff]"
        />
        <span className="text-sm font-medium text-ink-soft">Согласен(на) снимать видео на занятиях</span>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark disabled:opacity-50">
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {savedMsg && <span className="text-sm text-green-600">Сохранено</span>}
      </div>
    </form>
  )
}

function LevelTab({ studentId }: { studentId: string }) {
  const [entries, setEntries] = useState<StudentLevelEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ kind: 'intermediate' as LevelEntryKind, entry_date: todayISO(), notes: '' })

  useEffect(() => {
    void load()
  }, [studentId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('student_level_entries')
      .select('*')
      .eq('student_id', studentId)
      .order('entry_date', { ascending: false })
    setEntries((data as StudentLevelEntry[]) ?? [])
    setLoading(false)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('student_level_entries')
      .insert({ student_id: studentId, ...form, created_by: user?.id })
      .select()
      .single()
    if (data) setEntries((prev) => [data as StudentLevelEntry, ...prev])
    setForm({ kind: 'intermediate', entry_date: todayISO(), notes: '' })
  }

  async function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    await supabase.from('student_level_entries').delete().eq('id', id)
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Добавить запись</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Тип">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as LevelEntryKind })} className="input">
              {LEVEL_ENTRY_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Дата">
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} className="input" />
          </Field>
        </div>
        <Field label="Заметки">
          <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" />
        </Field>
        <button type="submit" className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark">
          Добавить
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-faint">Загрузка…</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  {LEVEL_ENTRY_KINDS.find((k) => k.value === entry.kind)?.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-faint">{formatDate(entry.entry_date)}</span>
                  <button onClick={() => handleDelete(entry.id)} className="text-xs text-faint hover:text-red-600">
                    Удалить
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink-soft">{entry.notes}</p>
            </div>
          ))}
          {entries.length === 0 && <p className="text-sm text-faint">Записей пока нет</p>}
        </div>
      )}
    </div>
  )
}

function InterviewTab({ student, onUpdate }: { student: Student; onUpdate: (s: Student) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>(student.interview_answers ?? {})
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => setAnswers(student.interview_answers ?? {}), [student])

  async function handleSave() {
    setSaving(true)
    const { data } = await supabase
      .from('students')
      .update({ interview_answers: answers })
      .eq('id', student.id)
      .select()
      .single()
    setSaving(false)
    if (data) {
      onUpdate(data as Student)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2000)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">
      {INTERVIEW_QUESTIONS.map((group) => (
        <div key={group.group} className="rounded-xl border border-line bg-surface p-4">
          <h3 className="mb-3 font-semibold text-ink">{group.group}</h3>
          <div className="space-y-3">
            {group.questions.map((q) => (
              <Field key={q.key} label={q.label}>
                <textarea
                  rows={2}
                  value={answers[q.key] ?? ''}
                  onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                  className="input"
                />
              </Field>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark disabled:opacity-50">
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {savedMsg && <span className="text-sm text-green-600">Сохранено</span>}
      </div>
    </div>
  )
}

function MocksTab({ studentId }: { studentId: string }) {
  const [exams, setExams] = useState<MockExam[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ exam_date: todayISO(), score: '', max_score: '', notes: '' })

  useEffect(() => {
    void load()
  }, [studentId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('mock_exams').select('*').eq('student_id', studentId).order('exam_date', { ascending: false })
    setExams((data as MockExam[]) ?? [])
    setLoading(false)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('mock_exams')
      .insert({
        student_id: studentId,
        exam_date: form.exam_date,
        score: form.score ? Number(form.score) : null,
        max_score: form.max_score ? Number(form.max_score) : null,
        notes: form.notes,
        created_by: user?.id,
      })
      .select()
      .single()
    if (data) setExams((prev) => [data as MockExam, ...prev])
    setForm({ exam_date: todayISO(), score: '', max_score: '', notes: '' })
  }

  async function handleDelete(id: string) {
    setExams((prev) => prev.filter((e) => e.id !== id))
    await supabase.from('mock_exams').delete().eq('id', id)
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Добавить пробник</h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Дата">
            <input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} className="input" />
          </Field>
          <Field label="Балл">
            <input type="number" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} className="input" />
          </Field>
          <Field label="Максимум">
            <input type="number" value={form.max_score} onChange={(e) => setForm({ ...form, max_score: e.target.value })} className="input" />
          </Field>
        </div>
        <Field label="Заметки">
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" />
        </Field>
        <button type="submit" className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark">
          Добавить
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-faint">Загрузка…</p>
      ) : (
        <div className="space-y-2">
          {exams.map((exam) => (
            <div key={exam.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
              <div>
                <p className="text-sm font-medium text-ink">
                  {formatDate(exam.exam_date)} — {exam.score ?? '—'}/{exam.max_score ?? '—'}
                </p>
                {exam.notes && <p className="text-sm text-muted">{exam.notes}</p>}
              </div>
              <button onClick={() => handleDelete(exam.id)} className="text-xs text-faint hover:text-red-600">
                Удалить
              </button>
            </div>
          ))}
          {exams.length === 0 && <p className="text-sm text-faint">Пробников пока нет</p>}
        </div>
      )}
    </div>
  )
}

function HomeworkTab({ studentId }: { studentId: string }) {
  const [items, setItems] = useState<Homework[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ assigned_date: todayISO(), description: '', grade: '' })

  useEffect(() => {
    void load()
  }, [studentId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('homeworks')
      .select('*')
      .eq('student_id', studentId)
      .order('assigned_date', { ascending: false })
    setItems((data as Homework[]) ?? [])
    setLoading(false)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('homeworks')
      .insert({
        student_id: studentId,
        assigned_date: form.assigned_date,
        description: form.description,
        grade: form.grade ? Number(form.grade) : null,
        created_by: user?.id,
      })
      .select()
      .single()
    if (data) setItems((prev) => [data as Homework, ...prev])
    setForm({ assigned_date: todayISO(), description: '', grade: '' })
  }

  async function updateGrade(id: string, grade: string) {
    const value = grade ? Number(grade) : null
    setItems((prev) => prev.map((h) => (h.id === id ? { ...h, grade: value } : h)))
    await supabase.from('homeworks').update({ grade: value }).eq('id', id)
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((h) => h.id !== id))
    await supabase.from('homeworks').delete().eq('id', id)
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink">Новое домашнее задание</h3>
        <Field label="Дата">
          <input type="date" value={form.assigned_date} onChange={(e) => setForm({ ...form, assigned_date: e.target.value })} className="input" />
        </Field>
        <Field label="Описание">
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
        </Field>
        <button type="submit" className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark">
          Добавить
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-faint">Загрузка…</p>
      ) : (
        <div className="space-y-2">
          {items.map((hw) => (
            <div key={hw.id} className="rounded-xl border border-line bg-surface p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-faint">{formatDate(hw.assigned_date)}</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-muted">
                    Оценка
                    <input
                      type="number"
                      min={0}
                      max={5}
                      defaultValue={hw.grade ?? ''}
                      onBlur={(e) => updateGrade(hw.id, e.target.value)}
                      className="w-14 rounded border border-line px-1.5 py-0.5"
                    />
                  </label>
                  <button onClick={() => handleDelete(hw.id)} className="text-xs text-faint hover:text-red-600">
                    Удалить
                  </button>
                </div>
              </div>
              <p className="text-sm text-ink-soft">{hw.description}</p>
            </div>
          ))}
          {items.length === 0 && <p className="text-sm text-faint">Домашних заданий пока нет</p>}
        </div>
      )}
    </div>
  )
}

function ParentAccessTab({ student }: { student: Student }) {
  const [parentAccount, setParentAccount] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [student.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('parent_of', student.id).eq('role', 'parent').maybeSingle()
    setParentAccount(data as Profile | null)
    setLoading(false)
  }

  async function handleDelete() {
    if (!parentAccount || !confirm('Удалить доступ родителя?')) return
    const { error } = await deleteAccount(parentAccount.id)
    if (error) return setError(error)
    setParentAccount(null)
  }

  async function handleResetPassword() {
    if (!parentAccount) return
    const password = prompt('Новый пароль для родителя (минимум 6 символов):')
    if (!password) return
    const { error } = await resetAccountPassword(parentAccount.id, password)
    if (error) setError(error)
    else alert('Пароль обновлён')
  }

  if (loading) return <p className="text-sm text-faint">Загрузка…</p>

  return (
    <div className="max-w-lg">
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {parentAccount ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="mb-1 text-sm text-muted">Логин родителя</p>
          <p className="mb-4 font-mono text-lg font-semibold text-ink">{parentAccount.username}</p>
          <p className="mb-4 text-sm text-muted">
            Родитель заходит на отдельной странице <span className="font-mono">/parent</span> с этим логином и своим паролем.
            Он видит только эту карточку: промежуточные результаты и домашние задания.
          </p>
          <div className="flex gap-2">
            <button onClick={handleResetPassword} className="rounded-lg bg-surface-muted px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-line">
              Сбросить пароль
            </button>
            <button onClick={handleDelete} className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100">
              Удалить доступ
            </button>
          </div>
        </div>
      ) : (
        <CreateParentForm studentId={student.id} onCreated={load} onError={setError} />
      )}
    </div>
  )
}

function CreateParentForm({
  studentId,
  onCreated,
  onError,
}: {
  studentId: string
  onCreated: () => void
  onError: (msg: string) => void
}) {
  const [form, setForm] = useState({ full_name: '', username: '', password: '' })
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await createParentAccount({ ...form, student_id: studentId })
    setSaving(false)
    if (error) return onError(error)
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Создать доступ для родителя</h3>
      <Field label="Имя родителя">
        <input
          required
          autoComplete="off"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="input"
        />
      </Field>
      <Field label="Логин (латиницей, без пробелов)">
        <input
          required
          autoComplete="off"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          placeholder="например, anna_petrova"
          className="input"
        />
      </Field>
      <Field label="Пароль">
        <input
          type="password"
          required
          autoComplete="new-password"
          minLength={6}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="input"
        />
      </Field>
      <button type="submit" disabled={saving} className="rounded-lg bg-lime px-4 py-2 text-sm font-semibold text-lime-ink hover:bg-lime-dark disabled:opacity-50">
        {saving ? 'Создаём…' : 'Создать доступ'}
      </button>
    </form>
  )
}
