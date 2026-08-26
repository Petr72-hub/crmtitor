# MyCRM

CRM-система для репетиторского бизнеса / онлайн-школы: лиды, ученики, расписание,
финансы, аналитика и роли пользователей (админ / менеджер / репетитор).

Стек: React + TypeScript + Vite + Tailwind CSS на фронте, Supabase (Postgres + Auth)
как бэкенд и хранилище пользователей/паролей.

## Локальный запуск

```bash
npm install
cp .env.example .env   # впишите свои VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY
npm run dev
```

## Деплой (доступ из любой точки мира + логин/пароль)

Подробная пошаговая инструкция — в файле [DEPLOY.md](./DEPLOY.md).
Коротко: база данных и аккаунты — на Supabase (бесплатно), сам сайт — на Vercel
(бесплатно). Никакого своего сервера покупать не нужно.

## Структура

- `src/pages/` — экраны: Dashboard, Schedule, Leads, Students, Analytics, Finance, Users, Profile
- `src/contexts/AuthContext.tsx` — авторизация и роль текущего пользователя
- `src/lib/supabase.ts` — клиент Supabase
- `supabase/schema.sql` — вся схема базы данных, роли и политики безопасности (RLS)
