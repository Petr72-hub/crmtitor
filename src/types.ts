export type Role = 'admin' | 'manager' | 'tutor'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  specializations: string[]
  rate_per_lesson: number
  created_at: string
}

export type LeadStatus =
  | 'new'
  | 'qualified'
  | 'no_answer'
  | 'trial_scheduled'
  | 'trial_done'
  | 'thinking'
  | 'later'
  | 'paid'
  | 'rejected'

export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'Новый' },
  { value: 'qualified', label: 'Назначен квал' },
  { value: 'no_answer', label: 'Не отвечает' },
  { value: 'trial_scheduled', label: 'Пробное назначено' },
  { value: 'trial_done', label: 'Пробное проведено' },
  { value: 'thinking', label: 'Думает' },
  { value: 'later', label: 'Позже будет заниматься' },
  { value: 'paid', label: 'Оплатил' },
  { value: 'rejected', label: 'Отказ' },
]

export const LEAD_SOURCES = [
  'Авито',
  'ВК',
  'Яндекс.Директ',
  'Инстаграм',
  'Телеграм',
  'Сарафан',
  'Другое',
]

export interface Lead {
  id: string
  parent_name: string
  child_name: string
  grade: string
  goal: string
  status: LeadStatus
  source: string
  phone: string | null
  telegram: string | null
  notes: string | null
  assigned_tutor: string | null
  created_at: string
  updated_at: string
}

export type StudentStatus = 'active' | 'sleeping'

export interface Student {
  id: string
  parent_name: string
  child_name: string
  grade: string
  goal: string
  tutor_id: string | null
  status: StudentStatus
  lessons_paid: number
  lessons_done: number
  created_at: string
}

export type LessonStatus = 'scheduled' | 'done' | 'cancelled'

export interface Lesson {
  id: string
  student_id: string
  tutor_id: string
  lesson_date: string
  start_time: string
  duration_minutes: number
  status: LessonStatus
  topic: string | null
  created_at: string
}

export interface Payment {
  id: string
  student_id: string
  amount: number
  paid_at: string
  method: string
  created_at: string
}

export interface Payout {
  id: string
  tutor_id: string
  amount: number
  lessons_count: number
  period_start: string
  period_end: string
  paid_at: string
}
