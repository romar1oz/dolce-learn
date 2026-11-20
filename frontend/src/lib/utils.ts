import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getLocale, intlLocale, translate, type TKey } from '@/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // запасной вариант для старых WebView
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// Форматирование учитывает выбранный язык интерфейса
const fmtCache = new Map<string, Intl.DateTimeFormat>()
function dtf(kind: 'date' | 'datetime' | 'short') {
  const loc = intlLocale()
  const key = `${loc}:${kind}`
  if (!fmtCache.has(key)) {
    const opts: Intl.DateTimeFormatOptions = kind === 'date' ? { day: '2-digit', month: '2-digit', year: 'numeric' }
      : kind === 'datetime' ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short' }
    fmtCache.set(key, new Intl.DateTimeFormat(loc, opts))
  }
  return fmtCache.get(key)!
}
const tr = (k: TKey, p?: Record<string, string | number>) => translate(getLocale(), k, p)

export function fmtDate(v?: string | null | Date): string {
  if (!v) return '—'
  const d = typeof v === 'string' ? new Date(v.length === 10 ? v + 'T00:00:00' : v) : v
  return isNaN(+d) ? '—' : dtf('date').format(d)
}

export function fmtDateTime(v?: string | null | Date): string {
  if (!v) return '—'
  const d = typeof v === 'string' ? new Date(v) : v
  return isNaN(+d) ? '—' : dtf('datetime').format(d)
}

export function fmtShort(v?: string | null): string {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v)
  return isNaN(+d) ? '—' : dtf('short').format(d)
}

export function fmtRelative(v?: string | number | null): string {
  if (!v) return tr('rel.never')
  const t = typeof v === 'number' ? v : new Date(v).getTime()
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 45) return tr('rel.justNow')
  if (s < 3600) return tr('rel.minAgo', { n: Math.round(s / 60) })
  if (s < 86400) return tr('rel.hAgo', { n: Math.round(s / 3600) })
  return fmtDateTime(new Date(t))
}

export function fmtBytes(n?: number | null): string {
  if (!n && n !== 0) return '—'
  if (n < 1024) return `${n} ${tr('unit.b')}`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} ${tr('unit.kb')}`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} ${tr('unit.mb')}`
  return `${(n / 1024 ** 3).toFixed(2)} ${tr('unit.gb')}`
}

export function fmtDuration(sec?: number | null): string {
  if (!sec) return `0 ${tr('unit.min')}`
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h} ${tr('unit.h')} ${m} ${tr('unit.min')}` : `${m} ${tr('unit.min')}`
}

export function fmtMinutes(min?: number | null): string {
  if (!min) return `0 ${tr('unit.min')}`
  return fmtDuration(min * 60)
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

export function daysUntil(d?: string | null): number | null {
  if (!d) return null
  const target = new Date(d + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((+target - +today) / 86400000)
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function initials(name?: string) {
  if (!name) return '?'
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

export const LEVELS: Record<string, string> = {
  beginner: 'Начальный', intermediate: 'Средний', advanced: 'Продвинутый',
}
export const COURSE_STATUS: Record<string, string> = {
  draft: 'Черновик', published: 'Опубликован', archived: 'Архив',
}
export const ASSIGN_STATUS: Record<string, string> = {
  assigned: 'Не начат', in_progress: 'В процессе', completed: 'Завершён', overdue: 'Просрочен',
}
export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin', methodist: 'Методист', manager: 'Руководитель', employee: 'Сотрудник',
}
