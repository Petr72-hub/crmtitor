// Серверная функция управления аккаунтами (создание/удаление/сброс пароля).
//
// ПОЧЕМУ ЭТО ОТДЕЛЬНАЯ ФУНКЦИЯ, А НЕ КОД В БРАУЗЕРЕ:
// Создание и удаление пользователей Supabase Auth требует "service_role" ключа —
// у него нет ограничений RLS, и если положить его в код сайта, любой человек
// сможет прочитать его через "Просмотр кода страницы" и получить полный доступ
// к базе данных. Поэтому такие операции выполняются здесь, на сервере Supabase
// (Edge Function), где service_role ключ хранится в переменных окружения
// и никогда не попадает в браузер. Сама функция проверяет роль вызывающего
// пользователя по его токену входа, прежде чем что-либо делать.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const PARENT_EMAIL_DOMAIN = 'parents.mycrm.internal'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Не авторизован' }, 401)

  // Клиент от имени вызывающего пользователя — чтобы узнать его настоящую роль
  // через RLS (доверяем базе данных, а не тому, что прислал браузер).
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user: caller },
  } = await callerClient.auth.getUser()
  if (!caller) return json({ error: 'Не авторизован' }, 401)

  const { data: callerProfile } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()
  const callerRole = callerProfile?.role
  if (callerRole !== 'owner' && callerRole !== 'admin') {
    return json({ error: 'Недостаточно прав' }, 403)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Некорректный запрос' }, 400)
  }

  const { action } = body

  if (action === 'create') {
    const { role, full_name, password } = body
    if (!role || !full_name || !password) return json({ error: 'Заполните все поля' }, 400)
    if (password.length < 6) return json({ error: 'Пароль должен быть не короче 6 символов' }, 400)

    if ((role === 'admin' || role === 'tutor') && callerRole !== 'owner') {
      return json({ error: 'Добавлять администраторов и репетиторов может только владелец' }, 403)
    }
    if (role === 'parent' && callerRole !== 'owner' && callerRole !== 'admin') {
      return json({ error: 'Недостаточно прав' }, 403)
    }
    if (role === 'owner') {
      return json({ error: 'Нельзя создать ещё одного владельца' }, 403)
    }

    let email: string
    const metadata: Record<string, string> = { full_name, role }

    if (role === 'parent') {
      const { username, student_id } = body
      if (!username || !student_id) return json({ error: 'Укажите логин и ученика' }, 400)
      const cleanUsername = String(username).trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '')
      if (!cleanUsername) return json({ error: 'Логин может содержать только латинские буквы и цифры' }, 400)
      email = `${cleanUsername}@${PARENT_EMAIL_DOMAIN}`
      metadata.username = cleanUsername
      metadata.student_id = student_id
    } else {
      const { email: staffEmail } = body
      if (!staffEmail) return json({ error: 'Укажите email' }, 400)
      email = staffEmail
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })

    if (error) {
      const message = error.message.includes('already been registered')
        ? role === 'parent'
          ? 'Такой логин уже занят'
          : 'Такой email уже зарегистрирован'
        : error.message
      return json({ error: message }, 400)
    }

    return json({ user_id: data.user?.id })
  }

  if (action === 'delete' || action === 'reset_password') {
    const { user_id } = body
    if (!user_id) return json({ error: 'Не указан пользователь' }, 400)
    if (user_id === caller.id) return json({ error: 'Нельзя удалить самого себя' }, 400)

    const { data: targetProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user_id)
      .single()
    if (!targetProfile) return json({ error: 'Пользователь не найден' }, 404)

    if (targetProfile.role === 'owner') return json({ error: 'Владельца удалить нельзя' }, 403)
    if ((targetProfile.role === 'admin' || targetProfile.role === 'tutor') && callerRole !== 'owner') {
      return json({ error: 'Удалять администраторов и репетиторов может только владелец' }, 403)
    }
    if (targetProfile.role === 'parent' && callerRole !== 'owner' && callerRole !== 'admin') {
      return json({ error: 'Недостаточно прав' }, 403)
    }

    if (action === 'delete') {
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    const { password } = body
    if (!password || password.length < 6) return json({ error: 'Пароль должен быть не короче 6 символов' }, 400)
    const { error } = await admin.auth.admin.updateUserById(user_id, { password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Неизвестное действие' }, 400)
})
