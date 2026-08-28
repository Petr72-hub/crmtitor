import { supabase } from './supabase'

interface ManageUsersResult {
  error: string | null
  user_id?: string
}

async function callManageUsers(payload: Record<string, unknown>): Promise<ManageUsersResult> {
  const { data, error } = await supabase.functions.invoke('manage-users', { body: payload })
  if (error) {
    const message = (data as { error?: string } | null)?.error ?? error.message
    return { error: message }
  }
  if (data?.error) return { error: data.error }
  return { error: null, user_id: data?.user_id }
}

export function createStaffAccount(params: {
  role: 'admin' | 'tutor'
  email: string
  full_name: string
  password: string
}) {
  return callManageUsers({ action: 'create', ...params })
}

export function createParentAccount(params: {
  username: string
  full_name: string
  password: string
  student_id: string
}) {
  return callManageUsers({ action: 'create', role: 'parent', ...params })
}

export function deleteAccount(userId: string) {
  return callManageUsers({ action: 'delete', user_id: userId })
}

export function resetAccountPassword(userId: string, password: string) {
  return callManageUsers({ action: 'reset_password', user_id: userId, password })
}
