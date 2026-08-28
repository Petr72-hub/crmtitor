-- =====================================================================
-- MyCRM — схема базы данных для Supabase (Postgres)
-- Выполните этот файл целиком в Supabase Dashboard → SQL Editor → New query
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ПРОФИЛИ (роли и данные пользователей поверх auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default 'Новый пользователь',
  role text not null default 'tutor' check (role in ('owner', 'admin', 'tutor', 'parent')),
  specializations text[] not null default '{}',
  rate_per_lesson numeric not null default 0,
  username text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Апгрейд существующей базы (безопасно перезапускать много раз):
-- добавляем новые колонки и роли owner/parent, если файл уже запускали раньше.
-- (колонка profiles.parent_of добавляется ниже, после создания таблицы students)
alter table public.profiles add column if not exists username text unique;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'admin', 'tutor', 'parent'));
update public.profiles set role = 'admin' where role = 'manager';

-- Функция без RLS-рекурсии: возвращает роль текущего пользователя
create or replace function public.my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean language sql security definer stable as $$
  select public.my_role() = 'owner';
$$;

-- is_admin() исторически означало «полный доступ к CRM» — теперь это owner ИЛИ admin.
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select public.my_role() in ('owner', 'admin');
$$;

-- Оставлено под старым именем для совместимости с политиками ниже;
-- роль «manager» убрана, теперь означает то же самое, что is_admin().
create or replace function public.is_manager_or_admin()
returns boolean language sql security definer stable as $$
  select public.my_role() in ('owner', 'admin');
$$;

-- Автосоздание профиля при регистрации пользователя.
-- Первый когда-либо созданный пользователь становится owner. Остальные —
-- берут роль из user_metadata (её передаёт серверная функция manage-users
-- при создании аккаунта Владельцем/Админом), либо tutor по умолчанию.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  users_count int;
  meta_role text;
begin
  select count(*) into users_count from public.profiles;
  meta_role := new.raw_user_meta_data->>'role';
  insert into public.profiles (id, email, full_name, role, username, parent_of)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case
      when users_count = 0 then 'owner'
      when meta_role in ('admin', 'tutor', 'parent') then meta_role
      else 'tutor'
    end,
    new.raw_user_meta_data->>'username',
    nullif(new.raw_user_meta_data->>'student_id', '')::uuid
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Запрещаем менять чужую роль/ставку/логин в обход UI (иначе любой пользователь
-- мог бы сделать себя admin через прямой запрос к API). Смену роли на
-- admin/tutor разрешаем только owner — иначе admin мог бы сам себя повысить
-- в обход ограничения «не может добавлять/удалять админов и репетиторов».
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_owner() then
    new.role = old.role;
  end if;
  if not public.is_admin() then
    new.rate_per_lesson = old.rate_per_lesson;
  end if;
  new.username = old.username;
  return new;
end;
$$;

drop trigger if exists on_profile_update_guard on public.profiles;
create trigger on_profile_update_guard
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- Одноразовое повышение самого первого созданного аккаунта до owner
-- (нужно, если схема уже выполнялась раньше и этот аккаунт получил роль admin).
update public.profiles set role = 'owner'
where id = (select id from public.profiles order by created_at asc limit 1)
  and role <> 'owner';

-- Политики profiles.
-- Сотрудники (owner/admin/tutor) видят список всех профилей — это нужно, чтобы
-- показывать имена репетиторов в выпадающих списках и т.п. Родитель — не сотрудник,
-- и должен видеть только свою собственную строку, иначе через прямой запрос к API
-- он мог бы прочитать логины/данные других родителей и сотрудников.
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_select_staff" on public.profiles;
create policy "profiles_select_staff" on public.profiles
  for select using (public.my_role() <> 'parent' or id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin());

-- ---------------------------------------------------------------------
-- ЛИДЫ
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  child_name text not null,
  grade text not null default '',
  goal text not null default '',
  status text not null default 'new' check (status in
    ('new','qualified','no_answer','trial_scheduled','trial_done','thinking','later','paid','rejected')),
  source text not null default 'Другое',
  phone text,
  telegram text,
  notes text,
  assigned_tutor uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads enable row level security;

drop policy if exists "leads_all_manager_admin" on public.leads;
create policy "leads_all_manager_admin" on public.leads
  for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

-- ---------------------------------------------------------------------
-- УЧЕНИКИ
-- ---------------------------------------------------------------------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  child_name text not null,
  grade text not null default '',
  goal text not null default '',
  tutor_id uuid references public.profiles (id) on delete set null,
  status text not null default 'active' check (status in ('active','sleeping')),
  lessons_paid int not null default 0,
  lessons_done int not null default 0,
  parent_phone text not null default '',
  student_phone text not null default '',
  max_link text not null default '',
  vk_link text not null default '',
  video_consent boolean not null default false,
  interview_answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;

-- Апгрейд существующей базы: новые поля карточки ученика.
alter table public.students add column if not exists parent_phone text not null default '';
alter table public.students add column if not exists student_phone text not null default '';
alter table public.students add column if not exists max_link text not null default '';
alter table public.students add column if not exists vk_link text not null default '';
alter table public.students add column if not exists video_consent boolean not null default false;
alter table public.students add column if not exists interview_answers jsonb not null default '{}'::jsonb;

-- Теперь, когда students существует, можно добавить ссылку с профиля родителя на его ребёнка.
alter table public.profiles add column if not exists parent_of uuid references public.students (id) on delete cascade;

drop policy if exists "students_select" on public.students;
create policy "students_select" on public.students
  for select using (public.is_manager_or_admin() or tutor_id = auth.uid());

drop policy if exists "students_write_manager_admin" on public.students;
create policy "students_write_manager_admin" on public.students
  for insert with check (public.is_manager_or_admin());

drop policy if exists "students_update" on public.students;
create policy "students_update" on public.students
  for update using (public.is_manager_or_admin() or tutor_id = auth.uid());

drop policy if exists "students_delete_manager_admin" on public.students;
create policy "students_delete_manager_admin" on public.students
  for delete using (public.is_manager_or_admin());

-- Родитель видит ровно одну карточку — своего ребёнка, и ничего больше.
drop policy if exists "students_select_parent" on public.students;
create policy "students_select_parent" on public.students
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'parent' and p.parent_of = students.id
    )
  );

-- ---------------------------------------------------------------------
-- УРОКИ (расписание)
-- ---------------------------------------------------------------------
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  tutor_id uuid not null references public.profiles (id) on delete cascade,
  lesson_date date not null,
  start_time time not null,
  duration_minutes int not null default 60,
  status text not null default 'scheduled' check (status in ('scheduled','done','cancelled')),
  topic text,
  created_at timestamptz not null default now()
);

alter table public.lessons enable row level security;

drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons
  for select using (public.is_manager_or_admin() or tutor_id = auth.uid());

drop policy if exists "lessons_insert" on public.lessons;
create policy "lessons_insert" on public.lessons
  for insert with check (public.is_manager_or_admin() or tutor_id = auth.uid());

drop policy if exists "lessons_update" on public.lessons;
create policy "lessons_update" on public.lessons
  for update using (public.is_manager_or_admin() or tutor_id = auth.uid());

drop policy if exists "lessons_delete" on public.lessons;
create policy "lessons_delete" on public.lessons
  for delete using (public.is_manager_or_admin() or tutor_id = auth.uid());

-- ---------------------------------------------------------------------
-- ПЛАТЕЖИ (доход от учеников)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  amount numeric not null,
  paid_at date not null default current_date,
  method text not null default 'Карта',
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

drop policy if exists "payments_all_manager_admin" on public.payments;
create policy "payments_all_manager_admin" on public.payments
  for all using (public.is_manager_or_admin()) with check (public.is_manager_or_admin());

-- ---------------------------------------------------------------------
-- ВЫПЛАТЫ РЕПЕТИТОРАМ
-- ---------------------------------------------------------------------
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric not null,
  lessons_count int not null default 0,
  period_start date not null,
  period_end date not null,
  paid_at date not null default current_date
);

alter table public.payouts enable row level security;

drop policy if exists "payouts_select" on public.payouts;
create policy "payouts_select" on public.payouts
  for select using (public.is_admin() or tutor_id = auth.uid());

drop policy if exists "payouts_write_admin" on public.payouts;
create policy "payouts_write_admin" on public.payouts
  for insert with check (public.is_admin());

drop policy if exists "payouts_update_admin" on public.payouts;
create policy "payouts_update_admin" on public.payouts
  for update using (public.is_admin());

drop policy if exists "payouts_delete_admin" on public.payouts;
create policy "payouts_delete_admin" on public.payouts
  for delete using (public.is_admin());

-- Автоматически двигаем баланс уроков ученика, когда урок отмечают
-- проведённым (done) или снимают отметку.
create or replace function public.handle_lesson_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    update public.students set lessons_done = lessons_done + 1 where id = new.student_id;
  elsif old.status = 'done' and new.status is distinct from 'done' then
    update public.students set lessons_done = greatest(lessons_done - 1, 0) where id = new.student_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_lesson_status_change on public.lessons;
create trigger on_lesson_status_change
  after update of status on public.lessons
  for each row execute function public.handle_lesson_status_change();

-- ---------------------------------------------------------------------
-- УРОВЕНЬ УЧЕНИКА (начальный / промежуточный / срез знаний, бесконечно добавляемые)
-- ---------------------------------------------------------------------
create table if not exists public.student_level_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  kind text not null check (kind in ('initial', 'intermediate', 'final_cut')),
  entry_date date not null default current_date,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.student_level_entries enable row level security;

drop policy if exists "level_entries_select" on public.student_level_entries;
create policy "level_entries_select" on public.student_level_entries
  for select using (
    public.is_admin()
    or exists (select 1 from public.students s where s.id = student_level_entries.student_id and s.tutor_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'parent' and p.parent_of = student_level_entries.student_id)
  );

drop policy if exists "level_entries_write" on public.student_level_entries;
create policy "level_entries_write" on public.student_level_entries
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.students s where s.id = student_level_entries.student_id and s.tutor_id = auth.uid())
  );

drop policy if exists "level_entries_update" on public.student_level_entries;
create policy "level_entries_update" on public.student_level_entries
  for update using (
    public.is_admin()
    or exists (select 1 from public.students s where s.id = student_level_entries.student_id and s.tutor_id = auth.uid())
  );

drop policy if exists "level_entries_delete" on public.student_level_entries;
create policy "level_entries_delete" on public.student_level_entries
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- ПРОБНИКИ (тренировочные экзамены, бесконечно добавляемые, датированные)
-- ---------------------------------------------------------------------
create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  exam_date date not null default current_date,
  score numeric,
  max_score numeric,
  notes text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.mock_exams enable row level security;

drop policy if exists "mock_exams_select" on public.mock_exams;
create policy "mock_exams_select" on public.mock_exams
  for select using (
    public.is_admin()
    or exists (select 1 from public.students s where s.id = mock_exams.student_id and s.tutor_id = auth.uid())
  );

drop policy if exists "mock_exams_write" on public.mock_exams;
create policy "mock_exams_write" on public.mock_exams
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.students s where s.id = mock_exams.student_id and s.tutor_id = auth.uid())
  );

drop policy if exists "mock_exams_update" on public.mock_exams;
create policy "mock_exams_update" on public.mock_exams
  for update using (
    public.is_admin()
    or exists (select 1 from public.students s where s.id = mock_exams.student_id and s.tutor_id = auth.uid())
  );

drop policy if exists "mock_exams_delete" on public.mock_exams;
create policy "mock_exams_delete" on public.mock_exams
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- ДОМАШНИЕ ЗАДАНИЯ (после каждого занятия, с оценкой, датированные)
-- ---------------------------------------------------------------------
create table if not exists public.homeworks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  assigned_date date not null default current_date,
  description text not null default '',
  grade numeric,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.homeworks enable row level security;

drop policy if exists "homeworks_select" on public.homeworks;
create policy "homeworks_select" on public.homeworks
  for select using (
    public.is_admin()
    or exists (select 1 from public.students s where s.id = homeworks.student_id and s.tutor_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'parent' and p.parent_of = homeworks.student_id)
  );

drop policy if exists "homeworks_write" on public.homeworks;
create policy "homeworks_write" on public.homeworks
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.students s where s.id = homeworks.student_id and s.tutor_id = auth.uid())
  );

drop policy if exists "homeworks_update" on public.homeworks;
create policy "homeworks_update" on public.homeworks
  for update using (
    public.is_admin()
    or exists (select 1 from public.students s where s.id = homeworks.student_id and s.tutor_id = auth.uid())
  );

drop policy if exists "homeworks_delete" on public.homeworks;
create policy "homeworks_delete" on public.homeworks
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- КОНТЕНТ-ЗАМЕТКИ (идеи постов по площадкам — видят и меняют только owner/admin)
-- ---------------------------------------------------------------------
create table if not exists public.content_notes (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'telegram', 'max', 'vk', 'youtube', 'avito')),
  title text not null,
  body text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.content_notes enable row level security;

drop policy if exists "content_notes_all_admin" on public.content_notes;
create policy "content_notes_all_admin" on public.content_notes
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- МЕТОДИЧКА ПРОБНОГО ЗАНЯТИЯ (шаблоны сообщений + структура урока).
-- Редактируют owner/admin, репетиторы — только читают.
-- ---------------------------------------------------------------------
create table if not exists public.trial_playbook_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text not null unique,
  title text not null,
  content text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.trial_playbook_sections enable row level security;

drop policy if exists "trial_playbook_select_all" on public.trial_playbook_sections;
create policy "trial_playbook_select_all" on public.trial_playbook_sections
  for select using (auth.uid() is not null);

drop policy if exists "trial_playbook_write_admin" on public.trial_playbook_sections;
create policy "trial_playbook_write_admin" on public.trial_playbook_sections
  for update using (public.is_admin());

drop policy if exists "trial_playbook_insert_admin" on public.trial_playbook_sections;
create policy "trial_playbook_insert_admin" on public.trial_playbook_sections
  for insert with check (public.is_admin());

drop policy if exists "trial_playbook_delete_admin" on public.trial_playbook_sections;
create policy "trial_playbook_delete_admin" on public.trial_playbook_sections
  for delete using (public.is_admin());

-- Стартовое наполнение методички — берём из брендбука. onconflict — чтобы можно
-- было запускать файл повторно, не затирая уже отредактированные вами тексты.
insert into public.trial_playbook_sections (section_key, title, content, sort_order) values
('msg_main', '1. Первое сообщение — основной вариант',
'Здравствуйте! Меня зовут Пётр. Вы оставляли заявку на пробное занятие через бота.

Спасибо, что заполнили анкету. Я посмотрел ваши ответы и хотел бы немного уточнить детали перед занятием, чтобы пробный урок был максимально полезным именно для вас.

Подскажите, пожалуйста:
— к какому экзамену/цели вы сейчас готовитесь;
— какой у вас сейчас класс;
— что в предмете получается хорошо, а что вызывает больше всего трудностей;
— занимались ли раньше дополнительно с преподавателем;
— какой результат хотели бы получить.

После этого подберём удобное время для пробного занятия.', 1),

('msg_bot_collected', '2. Если анкету уже заполнили через бота',
'Здравствуйте! Меня зовут Пётр. Вы оставляли заявку на пробное занятие через бота.

Я уже посмотрел вашу анкету, поэтому повторно ничего заполнять не потребуется.

На пробном занятии сначала познакомимся, я посмотрю текущий уровень знаний, разберём несколько заданий и поймём, где именно находятся основные пробелы. После занятия расскажу, как я вижу дальнейший план подготовки.

Осталось только выбрать удобное время. Вам больше подходят будни или выходные? И в какой половине дня удобнее заниматься?', 2),

('msg_parent', '3. Если пишет родитель',
'Здравствуйте! Меня зовут Пётр. Вы оставляли заявку на пробное занятие для ребёнка через бота.

Я посмотрел информацию из анкеты. На первом занятии моя задача — не просто провести обычный урок, а познакомиться с учеником, оценить текущий уровень, посмотреть, как он рассуждает и выполняет задания, выяснить основные пробелы и понять, какой формат подготовки будет для него наиболее эффективным.

После занятия я отдельно свяжусь с вами и дам обратную связь: расскажу о сильных сторонах, проблемных темах и предложу план дальнейшей работы.

Давайте подберём удобное время для пробного занятия.', 3),

('msg_time_agreed', '4. После того как время согласовали',
'Отлично, тогда договорились на [дата] в [время].
Занятие займёт примерно [60 минут].

Перед уроком желательно подготовить тетрадь, ручку и, если есть, результаты последних контрольных, пробников или других работ по предмету. Они помогут мне быстрее понять текущий уровень.

Ссылку на занятие я отправлю заранее.

До встречи!', 4),

('structure_intro', '5. Структура урока — знакомство (0–10 минут)',
'Пробный урок должен выполнять одновременно четыре функции: ученик должен почувствовать себя комфортно; вы должны понять его академический уровень; вы должны понять, как именно он учится; родитель после занятия должен получить ощущение «Пётр понял моего ребёнка и знает, что с ним делать дальше».

Оптимальная продолжительность: 60–70 минут.

Не начинайте с «Так, открываем первое задание». Сначала ученик должен перестать чувствовать себя на собеседовании. Можно сказать:

«Сегодня у нас не контрольная и не экзамен. Мне важно понять не только, что ты сейчас знаешь, но и как ты думаешь, как обычно учишься и что именно вызывает сложности. Поэтому если чего-то не знаешь — это нормально. Для меня это как раз полезная информация.»', 5),

('structure_questions_self', '6. Блок вопросов ученику — про него самого',
'Не обязательно проходить как анкету. Лучше естественным разговором.

— Как тебя обычно называют?
— Чем любишь заниматься после школы?
— Есть спорт, музыка, игры, кружки, хобби?
— Как примерно проходит обычный день?
— Какой предмет в школе нравится больше всего?
— А какой вообще не нравится? Почему?
— Что тебе обычно легче: что-то запомнить или разобраться, как оно работает?
— Ты больше любишь делать всё сам или когда сначала показывают пример?
— Как тебе удобнее: когда объясняют словами, рисуют схемы или сразу показывают на заданиях?

Здесь вы уже получаете профиль обучения.', 6),

('structure_questions_school', '7. Блок вопросов ученику — про школу',
'— Как ты вообще относишься к школе?
— Какие сейчас оценки по предмету?
— Они, по твоему мнению, отражают твои знания?
— Как проходят уроки биологии/химии?
— Тебе понятны объяснения школьного преподавателя?
— Что происходит, когда ты не понимаешь тему?
— Ты обычно спрашиваешь или стараешься разобраться сам?
— Домашнее задание делаешь регулярно? Сколько примерно времени оно занимает?
— Бывает, что просто списываешь, потому что не понимаешь?
— Есть темы, которые тебе действительно нравятся?

Последний вопрос важен: не ищем только проблемы.', 7),

('structure_questions_exam', '8. Блок вопросов ученику — про экзамен',
'— Почему решил сдавать именно этот предмет?
— Это твой выбор или скорее совет родителей/школы?
— Куда хотел бы поступать после школы? Есть уже примерное направление?
— Какой результат хочешь получить? А какой считаешь минимально приемлемым?
— Уже писал пробник? Сколько баллов?
— Что оказалось самым сложным?
— Есть задания, которые даже не начинаешь решать?
— Что больше пугает: не знать тему, не успеть, ошибиться по невнимательности?

Этот блок позволяет понять не только знания, но и экзаменационное поведение.', 8),

('structure_questions_prev_tutors', '9. Блок вопросов ученику — про предыдущих репетиторов',
'— Занимался раньше с преподавателем?
— Что там нравилось? Что не нравилось?
— Почему перестали заниматься?
— Было что-то, что преподаватель делал и тебе реально помогало? А что вообще не работало?

Не надо критиковать предыдущего преподавателя. Даже если ученик скажет «Она вообще ничего не объясняла» — ответ: «Понял. Значит, попробуем найти формат объяснения, который будет удобнее тебе.»', 9),

('structure_diagnostics', '10. Быстрая диагностика базы (10–15 минут)',
'Нельзя просто дать 20 вопросов теста. Лучше несколько задач разного уровня, внимательно наблюдая за процессом.

Важно не только «ответил / не ответил», а: читает ли условие до конца; понимает ли терминологию; умеет ли выделять главное; вспоминает ли правило самостоятельно; рассуждает или угадывает; проверяет ли себя; насколько быстро сдаётся; просит ли подсказку; использует ли подсказку; повторяет ли ту же ошибку; может ли объяснить собственный ответ.

Самая полезная техника: после любого ответа спросите «Почему?» — и сразу видно, был ли правильный ответ осознанным или случайным, и наоборот — было ли рассуждение правильным при неверном ответе.', 10),

('structure_teaching', '11. Обучение прямо на пробнике (15–20 минут)',
'Очень важно, чтобы пробное занятие не превратилось только в диагностику. Найдите один пробел и реально его закройте.

Например: «Вот здесь я вижу, почему у тебя возникает ошибка. Смотри, сейчас покажу другой способ.» Объяснили → похожее задание → ученик решил.

В этот момент он получает маленький, но очень важный опыт: «Я не понимал → мне объяснили → теперь понимаю». Это продаёт преподавателя сильнее всего.', 11),

('evaluation_criteria', '12. Таблица оценки ученика (внутренняя, 1–5, не показывать ученику)',
'После каждого пробного заполняйте внутреннюю карту ученика по параметрам (оценка 1–5 + комментарий):

— Базовая теория
— Терминология
— Логическое мышление
— Умение применять знания
— Внимательность
— Скорость работы
— Самостоятельность
— Умение объяснить ответ
— Работа с ошибкой
— Использование подсказки
— Запоминание нового
— Мотивация
— Самоорганизация
— Отношение к домашней работе
— Экзаменационная уверенность

Отдельно понаблюдайте за реакцией на ошибку — специально дайте задание, где ученик, скорее всего, ошибётся:
Ученик А — «не знаю» → бросает.
Ученик Б — пробует ещё раз.
Ученик В — ждёт, пока преподаватель даст ответ.
Ученик Г — задаёт уточняющий вопрос.
Это показывает иногда больше, чем половина теста.', 12),

('end_of_lesson_student', '13. Конец урока — разговор с учеником',
'Не говорите «Ну, у тебя всё очень плохо», даже если всё действительно плохо.

Лучше: «Я примерно понял твою ситуацию. У тебя есть несколько вещей, которые уже получаются хорошо: [конкретика]. Основная проблема сейчас не в том, что ты «не знаешь предмет», а в [конкретная проблема]. Например, сегодня было видно, что [пример]. Это исправляется. Я бы начал с [первый этап], потом перешёл к [второй] и параллельно мы бы регулярно возвращались к [проблема].»

Ученик должен уйти не с мыслью «Меня оценили», а «Меня поняли».', 13),

('parent_conversation', '14. Разговор с родителями (отдельно от ребёнка)',
'Важный нюанс: если ученик рассказал что-то личное, не относящееся к безопасности и обучению, не пересказывайте это родителю — доверие исчезнет моментально. Родителю нужна педагогическая обратная связь, а не расшифровка личной беседы.

Структура разговора:
1. Сильные стороны — «Я познакомился с [имя] и посмотрел, как он работает с заданиями. Первое, что могу отметить — [2 конкретных плюса].»
2. Объективная проблема — 2–4 пункта, не двадцать. Например: база 7–8 класса фрагментарная; путается в терминологии; знает теорию, но плохо переносит на задания; слишком быстро отвечает и допускает ошибки невнимательности; не умеет самостоятельно строить рассуждение.
3. Причина — «Я бы не сказал, что проблема в способностях. Скорее сейчас знания накоплены отдельными фрагментами.»
4. План — например: сначала закрыть основные пробелы базы; параллельно начать системно решать задания экзаменационного формата; затем увеличивать число пробников и работать над скоростью и стабильностью.
5. Реалистичная цель — не «гарантирую 90 баллов», а «с текущей точки вижу хороший потенциал роста, точнее скажу после нескольких занятий и первого диагностического пробника».

Вопросы родителям отдельно: почему решили искать преподавателя именно сейчас; что беспокоит больше всего; это инициатива ребёнка или родителя; были ли раньше репетиторы и почему прекратили; насколько самостоятельно ребёнок организует учёбу; как реагирует на плохие оценки; какой результат ожидают; сколько времени объективно может уделять подготовке в неделю; есть ли другие серьёзные нагрузки (спорт, олимпиады, музыка, другие репетиторы).', 14),

('summary_template', '15. Шаблон письменного резюме родителю после пробного',
'Диагностика — [Имя], [класс]

Сильные стороны:
— …
— …

Основные сложности:
— …
— …

Что предлагаю:
— закрыть базовые пробелы;
— занятия в неделю: …;
— домашняя практика;
— пробник раз в 3–4 недели;
— корректировка плана по результатам.

Цель на первый месяц: […]', 15)
on conflict (section_key) do nothing;

-- ---------------------------------------------------------------------
-- Индексы для скорости
-- ---------------------------------------------------------------------
create index if not exists idx_leads_status on public.leads (status);
create index if not exists idx_students_tutor on public.students (tutor_id);
create index if not exists idx_lessons_date on public.lessons (lesson_date);
create index if not exists idx_lessons_tutor on public.lessons (tutor_id);
create index if not exists idx_lessons_student on public.lessons (student_id);
create index if not exists idx_payments_student on public.payments (student_id);
create index if not exists idx_payouts_tutor on public.payouts (tutor_id);
create index if not exists idx_level_entries_student on public.student_level_entries (student_id);
create index if not exists idx_mock_exams_student on public.mock_exams (student_id);
create index if not exists idx_homeworks_student on public.homeworks (student_id);
create index if not exists idx_content_notes_platform on public.content_notes (platform);
create index if not exists idx_profiles_parent_of on public.profiles (parent_of);
