import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/offline/db'
import { enqueue, flush, setSyncUser, useSync } from '@/offline/sync'
import { setAccessToken } from '@/lib/api'

function setOnline(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v })
}

function mockServer(handler: (events: any[]) => any) {
  const fn = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    return new Response(JSON.stringify({ results: handler(body.events) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('офлайн-очередь синхронизации', () => {
  beforeEach(async () => {
    await db.queue.clear()
    await db.attempts.clear()
    setAccessToken('test-token')
    setSyncUser(1)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('без сети события копятся в очереди и не отправляются', async () => {
    setOnline(false)
    const fetchMock = mockServer(() => [])
    await enqueue('lesson_open', { lesson_id: 1 })
    await enqueue('heartbeat', { lesson_id: 1, active_sec: 30 })
    const r = await flush()
    expect(r.sent).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    const items = await db.queue.toArray()
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.status === 'pending' && i.offline)).toBe(true)
    expect(new Set(items.map((i) => i.id)).size).toBe(2) // у каждого события свой UUID
  })

  it('при появлении сети события отправляются, результаты сохраняются', async () => {
    setOnline(false)
    await enqueue('lesson_complete', { lesson_id: 7 })
    const att = await enqueue('test_attempt', { attempt_id: 'a-1', test_id: 3 })
    await db.attempts.put({ id: 'a-1', userId: 1, testId: 3, courseId: 1, testTitle: 'T', status: 'pending', createdAt: Date.now(), answers: [] })
    setOnline(true)
    const fetchMock = mockServer((events) => events.map((e: any) => ({
      id: e.id, status: 'applied', result: e.type === 'test_attempt' ? { status: 'graded', percent: 100, passed: true } : {},
    })))
    const r = await flush()
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(r.applied).toBe(2)
    expect((await db.queue.get(att!.id))!.status).toBe('synced')
    expect((await db.attempts.get('a-1'))!.status).toBe('synced')
    expect(useSync.getState().pending).toBe(0)
  })

  it('ошибка сети — событие остаётся в очереди для повтора с увеличением задержки', async () => {
    setOnline(true)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const item = await enqueue('heartbeat', { active_sec: 10 })
    const r = await flush()
    expect(r.networkError).toBe(true)
    const saved = (await db.queue.get(item!.id))!
    expect(saved.status).toBe('pending')
    expect(saved.tries).toBe(1)
    expect(saved.nextTryAt).toBeGreaterThan(Date.now())
  })

  it('отклонённое сервером событие помечается failed и не зацикливается', async () => {
    setOnline(true)
    mockServer((events) => events.map((e: any) => ({ id: e.id, status: 'rejected', error: 'Урок удалён' })))
    const item = await enqueue('lesson_open', { lesson_id: 999 })
    await flush()
    const saved = (await db.queue.get(item!.id))!
    expect(saved.status).toBe('failed')
    expect(saved.error).toBe('Урок удалён')
    expect(useSync.getState().failed).toBe(1)
  })

  it('повтор (duplicate) после потерянного ответа считается успешной синхронизацией', async () => {
    setOnline(true)
    mockServer((events) => events.map((e: any) => ({ id: e.id, status: 'duplicate', original_status: 'applied' })))
    const item = await enqueue('lesson_complete', { lesson_id: 1 })
    await flush()
    expect((await db.queue.get(item!.id))!.status).toBe('synced')
  })
})
