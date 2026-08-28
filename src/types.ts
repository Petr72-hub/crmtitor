export type Role = 'owner' | 'admin' | 'tutor' | 'parent'

export const STAFF_ROLES: Role[] = ['owner', 'admin', 'tutor']

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  specializations: string[]
  rate_per_lesson: number
  username: string | null
  parent_of: string | null
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
  price_per_lesson: number
  parent_phone: string
  student_phone: string
  max_link: string
  vk_link: string
  video_consent: boolean
  interview_answers: Record<string, string>
  created_at: string
}

export type LevelEntryKind = 'initial' | 'intermediate' | 'final_cut'

export const LEVEL_ENTRY_KINDS: { value: LevelEntryKind; label: string }[] = [
  { value: 'initial', label: 'Начальный (после пробного)' },
  { value: 'intermediate', label: 'Промежуточный результат' },
  { value: 'final_cut', label: 'Промежуточно-итоговый срез' },
]

export interface StudentLevelEntry {
  id: string
  student_id: string
  kind: LevelEntryKind
  entry_date: string
  notes: string
  created_by: string | null
  created_at: string
}

export interface MockExam {
  id: string
  student_id: string
  exam_date: string
  score: number | null
  max_score: number | null
  notes: string
  created_by: string | null
  created_at: string
}

export interface Homework {
  id: string
  student_id: string
  assigned_date: string
  description: string
  grade: number | null
  created_by: string | null
  created_at: string
}

export type ContentPlatform = 'instagram' | 'telegram' | 'max' | 'vk' | 'youtube' | 'avito'

export const CONTENT_PLATFORMS: { value: ContentPlatform; label: string }[] = [
  { value: 'instagram', label: 'Инстаграм' },
  { value: 'telegram', label: 'Телеграм' },
  { value: 'max', label: 'Макс' },
  { value: 'vk', label: 'ВКонтакте' },
  { value: 'youtube', label: 'Ютуб' },
  { value: 'avito', label: 'Авито' },
]

export interface ContentNote {
  id: string
  platform: ContentPlatform
  title: string
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface TrialPlaybookSection {
  id: string
  section_key: string
  title: string
  content: string
  sort_order: number
  updated_at: string
}

export const INTERVIEW_QUESTIONS: { group: string; questions: { key: string; label: string }[] }[] = [
  {
    group: 'Про него самого',
    questions: [
      { key: 'self_nickname', label: 'Как тебя обычно называют?' },
      { key: 'self_after_school', label: 'Чем любишь заниматься после школы?' },
      { key: 'self_hobbies', label: 'Есть спорт, музыка, игры, кружки, хобби?' },
      { key: 'self_typical_day', label: 'Как примерно проходит обычный день?' },
      { key: 'self_favorite_subject', label: 'Какой предмет в школе нравится больше всего?' },
      { key: 'self_least_favorite_subject', label: 'А какой вообще не нравится? Почему?' },
      { key: 'self_memorize_vs_understand', label: 'Что тебе обычно легче: что-то запомнить или разобраться, как оно работает?' },
      { key: 'self_alone_vs_example', label: 'Ты больше любишь делать всё сам или когда сначала показывают пример?' },
      { key: 'self_learning_style', label: 'Как тебе удобнее: когда объясняют словами, рисуют схемы или сразу показывают на заданиях?' },
    ],
  },
  {
    group: 'Про школу',
    questions: [
      { key: 'school_attitude', label: 'Как ты вообще относишься к школе?' },
      { key: 'school_grades', label: 'Какие сейчас оценки по предмету?' },
      { key: 'school_grades_reflect', label: 'Они, по-твоему, отражают твои знания?' },
      { key: 'school_lessons', label: 'Как проходят уроки биологии/химии?' },
      { key: 'school_explanations_clear', label: 'Тебе понятны объяснения школьного преподавателя?' },
      { key: 'school_when_confused', label: 'Что происходит, когда ты не понимаешь тему?' },
      { key: 'school_ask_or_alone', label: 'Ты обычно спрашиваешь или стараешься разобраться сам?' },
      { key: 'school_homework_regular', label: 'Домашнее задание делаешь регулярно? Сколько примерно времени оно занимает?' },
      { key: 'school_copies', label: 'Бывает, что просто списываешь, потому что не понимаешь?' },
      { key: 'school_liked_topics', label: 'Есть темы, которые тебе действительно нравятся?' },
    ],
  },
  {
    group: 'Про экзамен',
    questions: [
      { key: 'exam_why_subject', label: 'Почему решил сдавать именно этот предмет?' },
      { key: 'exam_whose_choice', label: 'Это твой выбор или скорее совет родителей/школы?' },
      { key: 'exam_where_to_apply', label: 'Куда хотел бы поступать после школы? Есть уже направление?' },
      { key: 'exam_target_score', label: 'Какой результат хочешь получить? А какой минимально приемлем?' },
      { key: 'exam_mock_score', label: 'Уже писал пробник? Сколько баллов?' },
      { key: 'exam_hardest_part', label: 'Что оказалось самым сложным?' },
      { key: 'exam_skipped_tasks', label: 'Есть задания, которые даже не начинаешь решать?' },
      { key: 'exam_biggest_fear', label: 'Что больше пугает: не знать тему, не успеть, ошибиться по невнимательности?' },
    ],
  },
  {
    group: 'Про предыдущих репетиторов',
    questions: [
      { key: 'prev_tutor_had', label: 'Занимался раньше с преподавателем?' },
      { key: 'prev_tutor_liked', label: 'Что там нравилось?' },
      { key: 'prev_tutor_disliked', label: 'Что не нравилось?' },
      { key: 'prev_tutor_why_stopped', label: 'Почему перестали заниматься?' },
    ],
  },
]

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

export type TariffKey = 'start' | 'uskorenie' | 'kataliz'

export const TARIFFS: { key: TariffKey; label: string; paidLessons: number; freeLessons: number }[] = [
  { key: 'start', label: 'Старт', paidLessons: 7, freeLessons: 1 },
  { key: 'uskorenie', label: 'Ускорение', paidLessons: 13, freeLessons: 3 },
  { key: 'kataliz', label: 'Катализ', paidLessons: 27, freeLessons: 5 },
]

export type TariffPurchaseStatus = 'pending' | 'confirmed' | 'cancelled'

export interface TariffPurchase {
  id: string
  student_id: string
  tariff: TariffKey
  paid_lessons: number
  free_lessons: number
  total_lessons: number
  price_per_lesson: number
  amount: number
  status: TariffPurchaseStatus
  created_by: string | null
  created_at: string
  confirmed_at: string | null
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
