import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { isNetworkError } from '@/lib/api'
import { db, kvGet, kvSet } from '@/offline/db'
import { useAuth } from '@/stores/auth'
import { useSync } from '@/offline/sync'

/** Запрос «сначала сеть, при отсутствии сети — сохранённый снимок из IndexedDB». */
export function useOfflineQuery<T>(key: unknown[], fetcher: () => Promise<T>,
                                   opts: Partial<UseQueryOptions<{ data: T; cachedAt: number | null }>> = {}) {
  const uid = useAuth((s) => s.user?.id)
  const kvKey = `${uid}:${JSON.stringify(key)}`
  return useQuery({
    queryKey: [...key, uid],
    queryFn: async () => {
      try {
        const data = await fetcher()
        void kvSet(kvKey, data)
        return { data, cachedAt: null as number | null }
      } catch (e) {
        if (isNetworkError(e) || !navigator.onLine) {
          const hit = await kvGet<T>(kvKey)
          if (hit) return { data: hit.value, cachedAt: hit.savedAt }
        }
        throw e
      }
    },
    retry: (n, e) => !isNetworkError(e) && n < 1,
    ...opts,
  })
}

export function useOnline() {
  return useSync((s) => s.online)
}

/** Локальный (ещё не подтверждённый сервером) статус уроков пользователя в курсе. */
export function useLocalLessons(courseId?: number) {
  const uid = useAuth((s) => s.user?.id)
  return useLiveQuery(async () => {
    if (!uid || !courseId) return {} as Record<number, { completed: boolean; videoPosition?: number }>
    const rows = await db.lessons.where({ courseId }).filter((r) => r.userId === uid).toArray()
    return Object.fromEntries(rows.map((r) => [r.lessonId, { completed: r.completed, videoPosition: r.videoPosition }]))
  }, [uid, courseId]) ?? {}
}

export function useDownloadedCourse(courseId?: number) {
  const uid = useAuth((s) => s.user?.id)
  return useLiveQuery(async () => (uid && courseId ? (await db.courses.get(`${uid}:${courseId}`)) ?? null : null),
    [uid, courseId])
}
