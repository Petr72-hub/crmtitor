// Родители входят по логину, а не по email. Технически Supabase Auth требует
// email, поэтому логин незаметно для родителя превращается в служебный адрес
// на несуществующем домене — родитель его никогда не видит и не вводит.
export const PARENT_EMAIL_DOMAIN = 'parents.mycrm.internal'

export function usernameToParentEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${PARENT_EMAIL_DOMAIN}`
}
