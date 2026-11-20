import { useEffect } from 'react'
import { Languages } from 'lucide-react'
import { api } from '@/lib/api'
import { LOCALES, useLocale, useT, type Locale } from '@/i18n'
import { useAuth } from '@/stores/auth'
import { cn } from '@/lib/utils'
import type { User } from '@/types'

/** Смена языка: применяется сразу, сохраняется на устройстве и (если есть связь) в профиле пользователя. */
export async function changeLanguage(l: Locale) {
  useLocale.getState().setLocale(l)
  const { user, status, setUser } = useAuth.getState()
  if (user && user.locale !== l) {
    setUser({ ...user, locale: l })
    if (status === 'authenticated') {
      try { setUser(await api.patch<User>('/api/auth/me', { locale: l })) } catch { /* сохранится локально */ }
    }
  }
}

/** При входе применяет язык из профиля, если на этом устройстве язык ещё не выбирали вручную. */
export function useProfileLocale() {
  const userLocale = useAuth((s) => s.user?.locale)
  useEffect(() => {
    const st = useLocale.getState()
    if (userLocale && !st.explicit && userLocale !== st.locale && ['ru', 'kk', 'en'].includes(userLocale)) {
      st.setLocale(userLocale as Locale)
    }
  }, [userLocale])
}

export function LanguageSwitcher({ dark, className }: { dark?: boolean; className?: string }) {
  const locale = useLocale((s) => s.locale)
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t('common.language')} data-testid="lang-switcher"
         className={cn('inline-flex items-center gap-0.5 rounded-full border p-0.5 text-[11px] font-semibold',
           dark ? 'border-white/15 bg-white/8' : 'border-line bg-white', className)}>
      <Languages className={cn('mx-1 h-3.5 w-3.5', dark ? 'text-brand-100/70' : 'text-muted')} aria-hidden />
      {LOCALES.map((l) => (
        <button key={l.code} role="radio" aria-checked={locale === l.code} title={l.name} data-lang={l.code}
                onClick={() => void changeLanguage(l.code)}
                className={cn('rounded-full px-2 py-1 transition',
                  locale === l.code
                    ? dark ? 'bg-white text-brand-900' : 'bg-brand-900 text-white'
                    : dark ? 'text-brand-100/80 hover:bg-white/10' : 'text-muted hover:bg-slate-100')}>
          {l.short}
        </button>
      ))}
    </div>
  )
}
