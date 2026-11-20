import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, CloudOff, LogOut, Menu, RefreshCw, Wifi, WifiOff, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { useT } from '@/i18n'
import { navFor } from './nav'
import { cn, fmtRelative, initials, ROLE_LABEL } from '@/lib/utils'
import { Button, Dialog, DialogContent } from '@/components/ui'
import { discardFailed, flush, retryFailed, useSync } from '@/offline/sync'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/offline/db'
import { Logo } from '@/components/Logo'
import { UpdatePrompt } from '@/components/UpdatePrompt'

export function SyncStatusDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const s = useSync()
  const uid = useAuth((x) => x.user?.id)
  const failed = useLiveQuery(() => (uid ? db.queue.where({ userId: uid, status: 'failed' }).toArray() : []), [uid]) ?? []
  const labels: Record<string, string> = {
    heartbeat: 'Время обучения', lesson_open: 'Открытие урока', lesson_complete: 'Завершение урока',
    video_progress: 'Просмотр видео', test_attempt: 'Попытка теста', dialogue_run: 'Тренажёр',
    course_download: 'Скачивание курса', course_start: 'Начало курса',
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Синхронизация" description="Данные обучения сохраняются на устройстве и отправляются на сервер автоматически.">
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-muted">Соединение</p>
              <p className={cn('mt-1 font-semibold', s.online ? 'text-brand-800' : 'text-amber-700')}>{s.online ? 'В сети' : 'Нет сети'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-muted">Статус</p>
              <p className="mt-1 font-semibold">{s.syncing ? 'Синхронизация…' : s.pending ? 'Ожидает отправки' : s.failed ? 'Есть ошибки' : 'Всё отправлено'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-muted">Ожидают отправки</p>
              <p className="mt-1 text-xl font-bold" data-testid="pending-count">{s.pending}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-muted">Последняя синхронизация</p>
              <p className="mt-1 font-semibold">{fmtRelative(s.lastSyncAt)}</p>
            </div>
          </div>
          {s.lastError && <p className="rounded-xl bg-amber-50 p-3 text-amber-800">{s.lastError}</p>}
          {failed.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="font-semibold text-red-700">Отклонено сервером: {failed.length}</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-red-700">
                {failed.slice(0, 20).map((f) => <li key={f.id}>• {labels[f.type] || f.type}: {f.error}</li>)}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => retryFailed()}>Повторить</Button>
                <Button size="sm" variant="ghost" onClick={() => discardFailed()}>Очистить</Button>
              </div>
            </div>
          )}
          <Button className="w-full" loading={s.syncing} disabled={!s.online}
                  onClick={async () => {
                    const r = await flush()
                    if (r.networkError) toast.error('Сервер недоступен. Повторим автоматически.')
                    else toast.success(r.sent ? `Отправлено событий: ${r.applied}` : 'Нечего отправлять — всё синхронизировано')
                  }}>
            <RefreshCw /> Синхронизировать сейчас
          </Button>
          {!s.online && <p className="text-center text-xs text-muted">Синхронизация начнётся автоматически при появлении сети.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SyncButton({ compact }: { compact?: boolean }) {
  const s = useSync()
  const [open, setOpen] = useState(false)
  const Icon = !s.online ? WifiOff : s.failed ? AlertTriangle : s.syncing ? RefreshCw : Wifi
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="sync-button"
              className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                !s.online ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : s.failed ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-brand-100 bg-brand-50 text-brand-900')}>
        <Icon className={cn('h-3.5 w-3.5', s.syncing && 'animate-spin')} />
        {!compact && <span>{!s.online ? 'Офлайн' : s.syncing ? 'Синхронизация' : 'В сети'}</span>}
        {s.pending > 0 && <span className="rounded-full bg-white/80 px-1.5 font-semibold" data-testid="pending-badge">{s.pending}</span>}
      </button>
      <SyncStatusDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function AppLayout() {
  const { user, logout, status, offlineExpiresAt } = useAuth()
  const t = useT()
  const nav = navFor(user!.role)
  const [sheet, setSheet] = useState(false)
  const loc = useLocation()
  const navigate = useNavigate()
  const pending = useSync((s) => s.pending)
  useEffect(() => setSheet(false), [loc.pathname])
  const mobileItems = nav.flatMap((g) => g.items).filter((i) => i.mobile).slice(0, 4)
  const immersive = /^\/learn\/|^\/tests\/\d+$/.test(loc.pathname)

  const doLogout = async () => {
    if (pending > 0 && !confirm(`Есть несинхронизированные данные (${pending}). Они сохранятся на устройстве и отправятся при следующем входе. Выйти?`)) return
    await logout()
    navigate('/login')
  }

  const NavList = ({ onItem }: { onItem?: () => void }) => (
    <nav className="space-y-5">
      {nav.map((g, gi) => (
        <div key={gi}>
          {g.title && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-brand-200/70 uppercase">{g.title}</p>}
          <div className="space-y-0.5">
            {g.items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} onClick={onItem}
                       className={({ isActive }) => cn('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                         isActive ? 'bg-white/12 text-white shadow-inner' : 'text-brand-100/80 hover:bg-white/6 hover:text-white')}>
                <i.icon className="h-[18px] w-[18px]" />{t(i.label)}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      {/* Боковая панель (компьютер) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col bg-brand-900 px-4 py-5 lg:flex">
        <Logo dark className="mb-7 px-2" />
        <div className="flex-1 overflow-y-auto pr-1 scrollbar-none"><NavList /></div>
        <div className="mt-4 rounded-2xl bg-white/8 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">{initials(user!.full_name)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user!.full_name}</p>
              <p className="truncate text-xs text-brand-100/70">{ROLE_LABEL[user!.role]}</p>
            </div>
            <button onClick={doLogout} className="rounded-lg p-2 text-brand-100/80 hover:bg-white/10 hover:text-white" title={t('common.logout')} aria-label={t('common.logout')}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Верхняя панель */}
      <header className={cn('sticky top-0 z-20 border-b border-line/60 bg-page/85 backdrop-blur-md', immersive && 'max-lg:hidden')}>
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Logo className="lg:hidden" />
          <div className="hidden text-sm text-muted lg:block">
            {user!.department_name && <span>{user!.department_name}</span>}
          </div>
          <div className="flex items-center gap-2">
            <SyncButton />
            <button className="rounded-xl p-2 hover:bg-slate-100 lg:hidden" onClick={() => setSheet(true)} aria-label="Меню"><Menu className="h-5 w-5" /></button>
          </div>
        </div>
        {status === 'offline' && (
          <div className="flex items-center justify-center gap-2 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
            <CloudOff className="h-3.5 w-3.5 shrink-0" />
            Офлайн-режим: доступны скачанные курсы. Результаты будут подтверждены сервером после синхронизации.
            {offlineExpiresAt && <span className="hidden sm:inline">Офлайн-сессия до {new Date(offlineExpiresAt).toLocaleDateString('ru-RU')}.</span>}
          </div>
        )}
      </header>

      <main className={cn('mx-auto max-w-7xl px-4 pt-5 pb-28 sm:px-6 lg:pb-10', immersive && 'max-lg:pt-0')}>
        <Outlet />
      </main>

      {/* Нижняя панель (смартфон) */}
      {!immersive && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5">
            {mobileItems.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end}
                       className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-800' : 'text-muted')}>
                {({ isActive }) => (<>
                  <span className={cn('rounded-full px-3 py-1 transition', isActive && 'bg-brand-100')}><i.icon className="h-5 w-5" /></span>
                  <span className="max-w-full truncate px-1">{t(i.label)}</span>
                </>)}
              </NavLink>
            ))}
            <button onClick={() => setSheet(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted">
              <span className="rounded-full px-3 py-1"><Menu className="h-5 w-5" /></span>{t('nav.more')}
            </button>
          </div>
        </nav>
      )}

      {/* Мобильное меню */}
      {sheet && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSheet(false)} />
          <div className="safe-bottom absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col bg-brand-900 p-5">
            <div className="mb-6 flex items-center justify-between">
              <Logo dark />
              <button onClick={() => setSheet(false)} className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-5 rounded-2xl bg-white/8 p-3 text-white">
              <p className="font-semibold">{user!.full_name}</p>
              <p className="text-xs text-brand-100/70">{ROLE_LABEL[user!.role]}{user!.department_name ? ` · ${user!.department_name}` : ''}</p>
            </div>
            <div className="flex-1 overflow-y-auto"><NavList onItem={() => setSheet(false)} /></div>
            <Button variant="secondary" className="mt-4" onClick={doLogout}><LogOut />{t('common.logout')}</Button>
          </div>
        </div>
      )}
      <UpdatePrompt />
    </div>
  )
}
