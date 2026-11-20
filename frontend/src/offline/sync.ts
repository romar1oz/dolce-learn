/* Очередь событий и синхронизация.
   Все учебные действия (открытие урока, прогресс видео, время, попытки тестов, тренажёр) сначала
   записываются в IndexedDB, затем отправляются пачкой на /api/sync/batch. Каждое событие имеет UUID —
   сервер игнорирует повторы, поэтому повторная отправка безопасна.
   Триггеры: старт приложения, событие online, возврат вкладки на передний план, таймер, ручная кнопка.
   Background Sync не используется как единственный механизм — он недоступен в Safari/iOS. */
import { create } from 'zustand'
import { api, getAccessToken, NetworkError, refreshSession, ApiError } from '@/lib/api'
import { uuid } from '@/lib/utils'
import { db, type QueueItem } from './db'
import type { AttemptResult } from '@/types'
import { getLocale, translate } from '@/i18n'

const tr = (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate(getLocale(), k, p)

const BATCH = 100
const BACKOFF = [5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000]
const DEVICE_KEY = 'dolce-device-id'

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = uuid()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return 'unknown'
  }
}

interface SyncState {
  online: boolean
  syncing: boolean
  pending: number
  failed: number
  lastSyncAt: number | null
  lastError: string | null
  setOnline: (v: boolean) => void
}

export const useSync = create<SyncState>((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  failed: 0,
  lastSyncAt: (() => {
    try { return Number(localStorage.getItem('dolce-last-sync')) || null } catch { return null }
  })(),
  lastError: null,
  setOnline: (v) => set({ online: v }),
}))

let currentUserId: number | null = null
export function setSyncUser(id: number | null) {
  currentUserId = id
  refreshCounters()
}

export async function refreshCounters() {
  if (currentUserId == null) {
    useSync.setState({ pending: 0, failed: 0 })
    return
  }
  const [pending, syncing, failed] = await Promise.all([
    db.queue.where({ userId: currentUserId, status: 'pending' }).count(),
    db.queue.where({ userId: currentUserId, status: 'syncing' }).count(),
    db.queue.where({ userId: currentUserId, status: 'failed' }).count(),
  ])
  useSync.setState({ pending: pending + syncing, failed })
}

type Listener = (item: QueueItem) => void
const listeners = new Set<Listener>()
/** Подписка на результаты применения событий сервером (например, результат теста). */
export function onSynced(fn: Listener) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

let flushTimer: ReturnType<typeof setTimeout> | null = null

export async function enqueue(type: string, payload: Record<string, unknown>, opts: { flush?: boolean } = {}) {
  if (currentUserId == null) return null
  const item: QueueItem = {
    id: uuid(), userId: currentUserId, type, payload, client_ts: new Date().toISOString(),
    offline: !navigator.onLine, status: 'pending', tries: 0, createdAt: Date.now(),
  }
  await db.queue.add(item)
  await refreshCounters()
  if (opts.flush) {
    void flush()
  } else {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => void flush(), 3000)
  }
  return item
}

let inFlight: Promise<SyncReport> | null = null

export interface SyncReport { sent: number; applied: number; rejected: number; networkError: boolean }

export function flush(): Promise<SyncReport> {
  if (inFlight) return inFlight
  inFlight = doFlush().finally(() => { inFlight = null })
  return inFlight
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  // Web Locks не дают двум вкладкам синхронизировать одни и те же события одновременно
  const locks = (navigator as any).locks
  if (locks?.request) return locks.request('dolce-sync', fn)
  return fn()
}

async function doFlush(): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, applied: 0, rejected: 0, networkError: false }
  if (currentUserId == null) return report
  if (!navigator.onLine) {
    useSync.setState({ online: false })
    return report
  }
  if (!getAccessToken()) {
    try {
      const t = await refreshSession()
      if (!t) return report
    } catch {
      report.networkError = true
      return report
    }
  }
  useSync.setState({ syncing: true })
  try {
    await withLock(async () => {
      // события, «застрявшие» в syncing после закрытия вкладки, возвращаем в очередь
      await db.queue.where({ userId: currentUserId!, status: 'syncing' }).modify({ status: 'pending' })
      for (let round = 0; round < 20; round++) {
        const now = Date.now()
        const batch = (await db.queue.where({ userId: currentUserId!, status: 'pending' }).sortBy('createdAt'))
          .filter((i) => !i.nextTryAt || i.nextTryAt <= now)
          .slice(0, BATCH)
        if (!batch.length) break
        await db.queue.bulkUpdate(batch.map((i) => ({ key: i.id, changes: { status: 'syncing' as const } })))
        let resp: { results: { id: string; status: string; result?: any; error?: string; original_status?: string }[] }
        try {
          resp = await api.post('/api/sync/batch', {
            device_id: deviceId(),
            events: batch.map((i) => ({ id: i.id, type: i.type, client_ts: i.client_ts, offline: i.offline, payload: i.payload })),
          })
        } catch (e) {
          const delay = (i: QueueItem) => BACKOFF[Math.min(i.tries, BACKOFF.length - 1)]
          await db.queue.bulkUpdate(batch.map((i) => ({
            key: i.id,
            changes: { status: 'pending' as const, tries: i.tries + 1, nextTryAt: Date.now() + delay(i),
                       error: e instanceof Error ? e.message : tr('sync.err') },
          })))
          if (e instanceof NetworkError) report.networkError = true
          useSync.setState({ lastError: e instanceof ApiError || e instanceof NetworkError ? e.message : tr('sync.err') })
          break
        }
        report.sent += batch.length
        const byId = new Map(batch.map((i) => [i.id, i]))
        for (const r of resp.results) {
          const item = byId.get(r.id)
          if (!item) continue
          const okStatus = r.status === 'applied' || (r.status === 'duplicate' && r.original_status !== 'rejected')
          const changes: Partial<QueueItem> = okStatus
            ? { status: 'synced', result: r.result ?? null, syncedAt: Date.now(), error: null }
            : { status: 'failed', error: r.error || tr('sync.rejectedEvent'), syncedAt: Date.now() }
          await db.queue.update(item.id, changes)
          if (okStatus) report.applied++
          else report.rejected++
          await afterApplied({ ...item, ...changes } as QueueItem)
          listeners.forEach((fn) => fn({ ...item, ...changes } as QueueItem))
        }
      }
      // очистка старой истории (синхронизированные события старше 7 дней)
      const cutoff = Date.now() - 7 * 86400000
      await db.queue.where('status').equals('synced').filter((i) => (i.syncedAt || 0) < cutoff).delete()
    })
    if (!report.networkError) {
      const ts = Date.now()
      try { localStorage.setItem('dolce-last-sync', String(ts)) } catch { /* empty */ }
      useSync.setState({ lastSyncAt: ts, lastError: report.rejected ? tr('sync.rejectedCount', { n: report.rejected }) : null })
    }
  } finally {
    useSync.setState({ syncing: false })
    await refreshCounters()
  }
  return report
}

async function afterApplied(item: QueueItem) {
  if (item.type === 'test_attempt') {
    const attemptId = String(item.payload.attempt_id)
    if (item.status === 'synced' && item.result) {
      const res = item.result as AttemptResult
      await db.attempts.update(attemptId, { status: res.status === 'rejected' ? 'rejected' : 'synced', result: res,
                                            error: res.rejection_reason ?? null })
    } else if (item.status === 'failed') {
      await db.attempts.update(attemptId, { status: 'rejected', error: item.error ?? tr('sync.rejectedEvent') })
    }
  }
}

export async function retryFailed() {
  if (currentUserId == null) return
  await db.queue.where({ userId: currentUserId, status: 'failed' }).modify({ status: 'pending', tries: 0, nextTryAt: 0 })
  await refreshCounters()
  return flush()
}

export async function discardFailed() {
  if (currentUserId == null) return
  await db.queue.where({ userId: currentUserId, status: 'failed' }).delete()
  await refreshCounters()
}

let started = false
/** Подключает автоматические триггеры синхронизации (один раз на приложение). */
export function startAutoSync() {
  if (started) return
  started = true
  const setOnline = () => {
    useSync.setState({ online: navigator.onLine })
    if (navigator.onLine) void flush()
  }
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) void flush()
  })
  window.addEventListener('focus', () => navigator.onLine && void flush())
  setInterval(() => {
    if (navigator.onLine && useSync.getState().pending > 0) void flush()
  }, 30_000)
}
