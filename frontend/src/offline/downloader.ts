/* Скачивание курса для офлайн-доступа: пакет курса (структура, тесты без ответов, тренажёры) — в IndexedDB,
   файлы (видео, PDF, документы, изображения) — целиком в Cache Storage. Проверяется квота хранилища. */
import { create } from 'zustand'
import { api, getAccessToken, refreshSession } from '@/lib/api'
import { fmtBytes } from '@/lib/utils'
import { getLocale, translate } from '@/i18n'

const tr = (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) => translate(getLocale(), k, p)
import { db, type CourseRecord } from './db'
import { enqueue } from './sync'
import type { CoursePackage, MediaBrief } from '@/types'

export const MEDIA_CACHE = 'dolce-media-v1'
export const mediaKey = (id: string) => `/offline-media/${id}`

interface DlProgress { courseId: number; loaded: number; total: number; current?: string; error?: string | null }
export const useDownloads = create<{ active: Record<number, DlProgress> }>(() => ({ active: {} }))

function setProgress(p: DlProgress | null, courseId: number) {
  useDownloads.setState((s) => {
    const active = { ...s.active }
    if (p) active[courseId] = p
    else delete active[courseId]
    return { active }
  })
}

export async function storageEstimate() {
  try {
    const est = await navigator.storage?.estimate?.()
    return { usage: est?.usage ?? 0, quota: est?.quota ?? 0 }
  } catch {
    return { usage: 0, quota: 0 }
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export async function isMediaCached(id: string): Promise<boolean> {
  try {
    const cache = await caches.open(MEDIA_CACHE)
    return !!(await cache.match(mediaKey(id)))
  } catch {
    return false
  }
}

async function fetchMedia(m: MediaBrief, onChunk: (n: number) => void, signal?: AbortSignal): Promise<Response> {
  if (!getAccessToken()) await refreshSession()
  let r = await fetch(`/api/materials/${m.id}/file`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, signal })
  if (r.status === 401) {
    await refreshSession()
    r = await fetch(`/api/materials/${m.id}/file`, { headers: { Authorization: `Bearer ${getAccessToken()}` }, signal })
  }
  if (!r.ok || !r.body) throw new Error(tr('dl.errFetch', { name: m.title || m.original_name, status: r.status }))
  // читаем поток, чтобы показывать прогресс, и собираем Blob
  const reader = r.body.getReader()
  const chunks: BlobPart[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value as BlobPart)
    onChunk(value.byteLength)
  }
  const blob = new Blob(chunks, { type: m.mime_type })
  if (blob.size !== m.size_bytes) throw new Error(tr('dl.errIncomplete', { name: m.original_name }))
  return new Response(blob, {
    headers: { 'Content-Type': m.mime_type, 'Content-Length': String(blob.size), 'X-Dolce-Saved': new Date().toISOString() },
  })
}

export async function downloadCourse(userId: number, courseId: number): Promise<CourseRecord> {
  const key = `${userId}:${courseId}`
  const pkg = await api.get<CoursePackage>(`/api/courses/${courseId}/package`)
  const { usage, quota } = await storageEstimate()
  const already = await Promise.all(pkg.media.map((m) => isMediaCached(m.id)))
  const needBytes = pkg.media.reduce((s, m, i) => s + (already[i] ? 0 : m.size_bytes), 0)
  if (quota && usage + needBytes > quota * 0.9) {
    throw new Error(tr('dl.errSpace', { need: fmtBytes(needBytes), avail: fmtBytes(Math.max(0, quota * 0.9 - usage)) }))
  }
  await requestPersistence()
  const rec: CourseRecord = {
    key, userId, courseId, title: pkg.course.title, version: pkg.version, pkg, status: 'downloading',
    totalBytes: pkg.total_bytes, downloadedBytes: 0, downloadedAt: Date.now(), updatedAt: Date.now(),
  }
  await db.courses.put(rec)
  const progress: DlProgress = { courseId, loaded: 0, total: pkg.total_bytes }
  setProgress({ ...progress }, courseId)
  const cache = await caches.open(MEDIA_CACHE)
  try {
    for (let i = 0; i < pkg.media.length; i++) {
      const m = pkg.media[i]
      if (already[i]) {
        progress.loaded += m.size_bytes
      } else {
        progress.current = m.title || m.original_name
        setProgress({ ...progress }, courseId)
        const resp = await fetchMedia(m, (n) => {
          progress.loaded += n
          setProgress({ ...progress }, courseId)
        })
        try {
          await cache.put(mediaKey(m.id), resp)
        } catch (e: any) {
          if (e?.name === 'QuotaExceededError') {
            throw new Error(tr('dl.errQuota'))
          }
          throw e
        }
      }
      const prev = await db.media.get(m.id)
      await db.media.put({ id: m.id, mime: m.mime_type, size: m.size_bytes, name: m.original_name, status: 'ready',
                           savedAt: Date.now(), courseKeys: Array.from(new Set([...(prev?.courseKeys || []), key])) })
      await db.courses.update(key, { downloadedBytes: progress.loaded })
    }
    await db.courses.update(key, { status: 'ready', downloadedBytes: pkg.total_bytes, updatedAt: Date.now(), error: null })
    await enqueue('course_download', { course_id: courseId, bytes: pkg.total_bytes, files: pkg.media.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : tr('dl.errGeneric')
    await db.courses.update(key, { status: 'error', error: msg })
    setProgress({ ...progress, error: msg }, courseId)
    setTimeout(() => setProgress(null, courseId), 8000)
    throw e
  }
  setProgress(null, courseId)
  return (await db.courses.get(key))!
}

/** Обновление пакета (структура/прогресс) без повторного скачивания файлов, если версия не изменилась. */
export async function refreshCoursePackage(userId: number, courseId: number, pkg: CoursePackage) {
  const key = `${userId}:${courseId}`
  const rec = await db.courses.get(key)
  if (!rec) return
  const missing = (await Promise.all(pkg.media.map(async (m) => ((await isMediaCached(m.id)) ? null : m)))).filter(Boolean)
  await db.courses.update(key, { pkg, version: pkg.version, title: pkg.course.title, updatedAt: Date.now(),
                                 status: missing.length ? 'partial' : 'ready', totalBytes: pkg.total_bytes })
}

export async function removeCourse(userId: number, courseId: number) {
  const key = `${userId}:${courseId}`
  await db.courses.delete(key)
  const cache = await caches.open(MEDIA_CACHE)
  const media = await db.media.where('courseKeys').equals(key).toArray()
  for (const m of media) {
    const rest = m.courseKeys.filter((k) => k !== key)
    if (rest.length) await db.media.update(m.id, { courseKeys: rest })
    else {
      await db.media.delete(m.id)
      await cache.delete(mediaKey(m.id))
    }
  }
}

/** Сохранение отдельного файла (например, из библиотеки) для офлайн-доступа. */
export async function saveSingleMedia(m: MediaBrief, tag: string) {
  const cache = await caches.open(MEDIA_CACHE)
  if (!(await cache.match(mediaKey(m.id)))) {
    const resp = await fetchMedia(m, () => {})
    await cache.put(mediaKey(m.id), resp)
  }
  const prev = await db.media.get(m.id)
  await db.media.put({ id: m.id, mime: m.mime_type, size: m.size_bytes, name: m.original_name, status: 'ready',
                       savedAt: Date.now(), courseKeys: Array.from(new Set([...(prev?.courseKeys || []), tag])) })
}
