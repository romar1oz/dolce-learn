/* Локальная база IndexedDB (Dexie). Хранит офлайн-сессию, пакеты курсов, метаданные медиа, очередь событий
   синхронизации, локальные попытки тестов и снимки списков для офлайн-просмотра. Сами файлы медиа — в Cache Storage. */
import Dexie, { type Table } from 'dexie'
import type { User } from '@/types'

export type QueueStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface QueueItem {
  id: string // UUID события — ключ идемпотентности на сервере
  userId: number
  type: string
  payload: Record<string, unknown>
  client_ts: string
  offline: boolean
  status: QueueStatus
  tries: number
  error?: string | null
  result?: unknown
  createdAt: number
  syncedAt?: number | null
  nextTryAt?: number
}

export interface OfflineSession {
  id: 'current'
  user: User
  savedAt: number
  expiresAt: number // момент, после которого офлайн-вход без сети запрещён
}

export interface CourseRecord {
  key: string // `${userId}:${courseId}`
  userId: number
  courseId: number
  title: string
  version: number
  pkg: CoursePackage
  status: 'downloading' | 'ready' | 'partial' | 'error'
  totalBytes: number
  downloadedBytes: number
  error?: string | null
  downloadedAt: number
  updatedAt: number
}

export interface MediaRecord {
  id: string
  mime: string
  size: number
  name: string
  status: 'ready' | 'error'
  savedAt: number
  courseKeys: string[]
}

export interface LocalAttempt {
  id: string
  userId: number
  testId: number
  courseId: number | null
  testTitle: string
  status: 'pending' | 'synced' | 'rejected'
  createdAt: number
  answers: unknown
  result?: AttemptResult | null
  error?: string | null
}

export interface LessonLocalState {
  key: string // `${userId}:${lessonId}`
  userId: number
  lessonId: number
  courseId: number
  completed: boolean
  videoPosition?: number
  updatedAt: number
}

export interface KV {
  key: string
  value: unknown
  savedAt: number
}

// Типы пакетов определены в '@/types'
import type { AttemptResult, CoursePackage } from '@/types'

class DolceDB extends Dexie {
  session!: Table<OfflineSession, string>
  queue!: Table<QueueItem, string>
  courses!: Table<CourseRecord, string>
  media!: Table<MediaRecord, string>
  attempts!: Table<LocalAttempt, string>
  lessons!: Table<LessonLocalState, string>
  kv!: Table<KV, string>

  constructor() {
    super('dolce-learn')
    this.version(1).stores({
      session: 'id',
      queue: 'id, userId, status, createdAt, [userId+status]',
      courses: 'key, userId, courseId, status',
      media: 'id, status, *courseKeys',
      attempts: 'id, userId, testId, status, createdAt',
      lessons: 'key, userId, courseId, lessonId',
      kv: 'key',
    })
  }
}

export const db = new DolceDB()

export async function kvSet(key: string, value: unknown) {
  await db.kv.put({ key, value, savedAt: Date.now() })
}

export async function kvGet<T>(key: string): Promise<{ value: T; savedAt: number } | null> {
  const r = await db.kv.get(key)
  return r ? { value: r.value as T, savedAt: r.savedAt } : null
}
