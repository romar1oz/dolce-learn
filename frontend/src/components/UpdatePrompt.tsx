import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'

/* Регистрация Service Worker и уведомление о новой версии приложения. */
let updateSW: ((reload?: boolean) => Promise<void>) | null = null
let needRefreshListeners: ((v: boolean) => void)[] = []

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  const { registerSW } = await import('virtual:pwa-register')
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefreshListeners.forEach((l) => l(true))
    },
    onOfflineReady() {
      console.info('[Dolce Learn] приложение готово к работе офлайн')
    },
  })
}

export function UpdatePrompt() {
  const [need, setNeed] = useState(false)
  useEffect(() => {
    needRefreshListeners.push(setNeed)
    return () => { needRefreshListeners = needRefreshListeners.filter((l) => l !== setNeed) }
  }, [])
  if (!need) return null
  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-brand-900 p-3 pl-4 text-sm text-white shadow-[var(--shadow-lift)] lg:bottom-6">
      <span className="flex-1">Доступна новая версия Dolce Learn</span>
      <Button size="sm" variant="accent" onClick={() => updateSW?.(true)}><RefreshCw />Обновить</Button>
    </div>
  )
}
