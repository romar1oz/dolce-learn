/* i18n: ru — исходный язык, kk и en — полные переводы (TypeScript требует наличия всех ключей).
   Язык хранится на устройстве (localStorage, работает офлайн и на странице входа) и в профиле пользователя.
   Переведены оболочка приложения, вход и весь кабинет сотрудника; кабинет методиста — пока на русском. */
import { create } from 'zustand'
import { ru, type TKey } from './ru'
import { kk } from './kk'
import { en } from './en'

export type { TKey }
export type Locale = 'ru' | 'kk' | 'en'
export const LOCALES: { code: Locale; short: string; name: string; intl: string }[] = [
  { code: 'ru', short: 'RU', name: 'Русский', intl: 'ru-RU' },
  { code: 'kk', short: 'ҚАЗ', name: 'Қазақша', intl: 'kk-KZ' },
  { code: 'en', short: 'EN', name: 'English', intl: 'en-GB' },
]
const dicts: Record<Locale, Record<TKey, string>> = { ru, kk, en }
const KEY = 'dolce-locale'

function initial(): Locale {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'ru' || v === 'kk' || v === 'en') return v
  } catch { /* приватный режим */ }
  return 'ru'
}

export const useLocale = create<{ locale: Locale; explicit: boolean; setLocale: (l: Locale) => void }>((set) => ({
  locale: initial(),
  explicit: (() => { try { return !!localStorage.getItem(KEY) } catch { return false } })(),
  setLocale: (l) => {
    try { localStorage.setItem(KEY, l) } catch { /* empty */ }
    document.documentElement.lang = l
    set({ locale: l, explicit: true })
  },
}))

export function getLocale(): Locale {
  return useLocale.getState().locale
}
export function intlLocale(l: Locale = getLocale()) {
  return LOCALES.find((x) => x.code === l)!.intl
}

export function translate(locale: string, key: TKey, params?: Record<string, string | number>): string {
  let s = dicts[locale as Locale]?.[key] ?? ru[key] ?? key
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** Выбор формы слова по числу. Ключ указывает на строку вида «урок|урока|уроков» (ru) / «сабақ» (kk) / «lesson|lessons» (en). */
export function pluralize(locale: Locale, forms: string, n: number): string {
  const f = forms.split('|')
  if (locale === 'ru') {
    const m10 = n % 10, m100 = n % 100
    if (m10 === 1 && m100 !== 11) return f[0]
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return f[1] ?? f[0]
    return f[2] ?? f[1] ?? f[0]
  }
  if (locale === 'en') return n === 1 ? f[0] : f[1] ?? f[0]
  return f[0] // в казахском существительное после числительного не изменяется
}

export function useT() {
  const locale = useLocale((s) => s.locale)
  const t = (key: TKey, params?: Record<string, string | number>) => translate(locale, key, params)
  t.locale = locale
  t.n = (key: TKey, n: number) => `${n} ${pluralize(locale, translate(locale, key), n)}`
  return t
}

if (typeof document !== 'undefined') document.documentElement.lang = initial()
