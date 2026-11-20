/* Получение URL для медиафайла: сначала из локального кэша (офлайн), иначе — подписанная ссылка с сервера. */
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { MEDIA_CACHE, mediaKey } from './downloader'

const signedCache = new Map<string, { url: string; exp: number }>()

export async function resolveMediaUrl(id: string): Promise<{ url: string; local: boolean; revoke?: () => void }> {
  try {
    const cache = await caches.open(MEDIA_CACHE)
    const hit = await cache.match(mediaKey(id))
    if (hit) {
      const blob = await hit.blob()
      const url = URL.createObjectURL(blob)
      return { url, local: true, revoke: () => URL.revokeObjectURL(url) }
    }
  } catch { /* Cache Storage недоступен (например, приватный режим) */ }
  const c = signedCache.get(id)
  if (c && c.exp > Date.now()) return { url: c.url, local: false }
  const { url } = await api.get<{ url: string }>(`/api/materials/${id}/url`)
  signedCache.set(id, { url, exp: Date.now() + 60 * 60 * 1000 })
  return { url, local: false }
}

export function useMediaUrl(id?: string | null) {
  const [state, setState] = useState<{ url: string | null; local: boolean; error: string | null; loading: boolean }>(
    { url: null, local: false, error: null, loading: !!id })
  useEffect(() => {
    if (!id) {
      setState({ url: null, local: false, error: null, loading: false })
      return
    }
    let revoke: (() => void) | undefined
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    resolveMediaUrl(id)
      .then((r) => {
        revoke = r.revoke
        if (!cancelled) setState({ url: r.url, local: r.local, error: null, loading: false })
        else r.revoke?.()
      })
      .catch((e) => {
        if (!cancelled) setState({ url: null, local: false, loading: false,
          error: navigator.onLine ? (e?.message || 'Файл недоступен') : 'Файл не скачан на устройство. Подключитесь к сети или скачайте курс.' })
      })
    return () => {
      cancelled = true
      revoke?.()
    }
  }, [id])
  return state
}

export async function openMedia(id: string, filename: string, download = false) {
  const r = await resolveMediaUrl(id)
  const a = document.createElement('a')
  a.href = r.local || !download ? r.url : `${r.url}&download=1`
  if (download || r.local) a.download = filename
  a.target = '_blank'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (r.revoke) setTimeout(r.revoke, 60_000)
}
