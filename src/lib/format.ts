export function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽'
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(d)
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
