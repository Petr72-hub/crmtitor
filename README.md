# MyCRM

CRM-система для репетиторского бизнеса / онлайн-школы «КЭТАЛИЗАТОР»: лиды, ученики
(с расширенной карточкой — уровень, пробники, домашние задания, интервью-анкета),
расписание, финансы, аналитика, методичка пробного занятия, контент-заметки по
площадкам, портал для родителей и роли пользователей (владелец / админ / репетитор / родитель).

Стек: React + TypeScript + Vite + Tailwind CSS на фронте, Supabase (Postgres + Auth +
Edge Functions) как бэкенд и хранилище пользователей/паролей.

## Локальный запуск

```bash
npm install
cp .env.example .env   # впишите свои VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
npm run dev
```

## Деплой (доступ из любой точки мира + логин/пароль)

Подробная пошаговая инструкция — в файле [DEPLOY.md](./DEPLOY.md).
Коротко: база данных, аккаунты и серверная функция управления пользователями — на
Supabase (бесплатно), сам сайт — на Vercel (бесплатно). Никакого своего сервера
покупать не нужно.

## Структура

- `src/pages/` — экраны: Dashboard, Schedule, Leads, Students, StudentDetail (карточка
  ученика с подвкладками), Analytics, Finance, Users, ContentNotes, TrialPlaybook, Profile
- `src/pages/parent/` — отдельный портал для родителей (ParentLogin, ParentPortal)
- `src/contexts/AuthContext.tsx` — авторизация и роль текущего пользователя
- `src/contexts/ThemeContext.tsx` — светлая/тёмная тема
- `src/lib/supabase.ts` — клиент Supabase
- `src/lib/manageUsers.ts` — вызовы серверной функции создания/удаления аккаунтов
- `supabase/schema.sql` — вся схема базы данных, роли и политики безопасности (RLS)
- `supabase/functions/manage-users/` — серверная функция (создание/удаление пользователей,
  сброс пароля) — единственное место, где используется service_role ключ
