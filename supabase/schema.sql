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
  role text not null default 'tutor' check (role in ('admin', 'manager', 'tutor')),
  specializations text[] not null default '{}',
  rate_per_lesson numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Функция без RLS-рекурсии: возвращает роль текущего пользователя
create or replace function public.my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select public.my_role() = 'admin';
$$;

create or replace function public.is_manager_or_admin()
returns boolean language sql security definer stable as $$
  select public.my_role() in ('admin', 'manager');
$$;

-- Автосоздание профиля при регистрации пользователя.
-- ВАЖНО: первый зарегистрированный пользователь становится admin автоматически,
-- все следующие — tutor (роль потом меняет admin на вкладке «Пользователи»).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  users_count int;
begin
  select count(*) into users_count from public.profiles;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when users_count = 0 then 'admin' else 'tutor' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Запрещаем менять свою же роль/ставку в обход UI (иначе любой пользователь
-- мог бы сделать себя admin через прямой запрос к API).
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role = old.role;
    new.rate_per_lesson = old.rate_per_lesson;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_update_guard on public.profiles;
create trigger on_profile_update_guard
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- Политики profiles
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (auth.uid() is not null);

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
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;

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
-- Индексы для скорости
-- ---------------------------------------------------------------------
create index if not exists idx_leads_status on public.leads (status);
create index if not exists idx_students_tutor on public.students (tutor_id);
create index if not exists idx_lessons_date on public.lessons (lesson_date);
create index if not exists idx_lessons_tutor on public.lessons (tutor_id);
create index if not exists idx_lessons_student on public.lessons (student_id);
create index if not exists idx_payments_student on public.payments (student_id);
create index if not exists idx_payouts_tutor on public.payouts (tutor_id);
