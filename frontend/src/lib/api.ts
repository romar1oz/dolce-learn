/* HTTP-клиент: access-токен хранится только в памяти, refresh-токен — в httpOnly cookie.
   При 401 выполняется одно обновление токена (single-flight) и повтор запроса. */
import type { TokenResponse } from '@/types'

export class ApiError extends Error {
  status: number
  data: unknown
  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

/** Ошибка сети: сервер недоступен (нет интернета, сервер выключен). */
export class NetworkError extends Error {
  constructor(message = 'Нет соединения с сервером') {
    super(message)
  }
}

let accessToken: string | null = null
let refreshPromise: Promise<TokenResponse | null> | null = null
let onSessionRefreshed: ((t: TokenResponse) => void) | null = null
let onUnauthorized: (() => void) | null = null

export function setAccessToken(t: string | null) {
  accessToken = t
}
export function getAccessToken() {
  return accessToken
}
export function configureAuthHooks(h: { refreshed: (t: TokenResponse) => void; unauthorized: () => void }) {
  onSessionRefreshed = h.refreshed
  onUnauthorized = h.unauthorized
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof NetworkError
}

async function rawFetch(input: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(input, { credentials: 'same-origin', ...init })
  } catch {
    throw new NetworkError()
  }
}

export async function refreshSession(): Promise<TokenResponse | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const r = await rawFetch('/api/auth/refresh', { method: 'POST' })
      if (r.status === 401 || r.status === 403) return null
      if (!r.ok) throw new ApiError(r.status, 'Не удалось обновить сессию')
      const data = (await r.json()) as TokenResponse
      accessToken = data.access_token
      onSessionRefreshed?.(data)
      return data
    })().finally(() => {
      setTimeout(() => (refreshPromise = null), 0)
    })
  }
  return refreshPromise
}

async function parseError(r: Response): Promise<ApiError> {
  let data: any = null
  try {
    data = await r.json()
  } catch { /* не JSON */ }
  const detail = typeof data?.detail === 'string' ? data.detail
    : Array.isArray(data?.detail) ? data.detail.map((d: any) => d.msg).join('; ')
    : r.status === 403 ? 'Недостаточно прав' : r.status >= 500 ? 'Ошибка сервера' : `Ошибка ${r.status}`
  return new ApiError(r.status, detail, data)
}

export async function request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const r = await rawFetch(path, { ...init, headers })
  if (r.status === 401 && retry && !path.startsWith('/api/auth/login')) {
    const refreshed = await refreshSession().catch((e) => {
      if (e instanceof NetworkError) throw e
      return null
    })
    if (refreshed) return request(path, init, false)
    onUnauthorized?.()
  }
  if (!r.ok) throw await parseError(r)
  return r
}

export const api = {
  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const r = await request(withParams(path, params))
    return r.json()
  },
  async post<T>(path: string, body?: unknown): Promise<T> {
    const r = await request(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
    return r.status === 204 ? (undefined as T) : r.json()
  },
  async patch<T>(path: string, body?: unknown): Promise<T> {
    const r = await request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) })
    return r.json()
  },
  async put<T>(path: string, body?: unknown): Promise<T> {
    const r = await request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) })
    return r.json()
  },
  async del<T>(path: string): Promise<T> {
    const r = await request(path, { method: 'DELETE' })
    return r.json()
  },
  async blob(path: string, params?: Record<string, unknown>): Promise<Blob> {
    const r = await request(withParams(path, params))
    return r.blob()
  },
}

export function withParams(path: string, params?: Record<string, unknown>) {
  if (!params) return path
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const q = sp.toString()
  return q ? `${path}${path.includes('?') ? '&' : '?'}${q}` : path
}

/** Загрузка файла с прогрессом (XHR — у fetch нет событий прогресса отправки). */
export function uploadFile(
  file: File, fields: Record<string, string | number | undefined>, onProgress?: (pct: number) => void,
  path = '/api/materials/upload',
): { promise: Promise<any>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<any>((resolve, reject) => {
    const send = (isRetry: boolean) => {
      xhr.open('POST', path)
      if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`)
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
      xhr.onerror = () => reject(new NetworkError('Загрузка прервана: нет соединения'))
      xhr.onabort = () => reject(new ApiError(0, 'Загрузка отменена'))
      xhr.onload = async () => {
        if (xhr.status === 401 && !isRetry) {
          const ok = await refreshSession().catch(() => null)
          if (ok) return send(true)
        }
        let data: any = null
        try { data = JSON.parse(xhr.responseText) } catch { /* empty */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data)
        else reject(new ApiError(xhr.status, data?.detail || `Ошибка загрузки (${xhr.status})`, data))
      }
      const fd = new FormData()
      fd.append('file', file)
      for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== '') fd.append(k, String(v))
      xhr.send(fd)
    }
    send(false)
  })
  return { promise, abort: () => xhr.abort() }
}

/** Скачивание файла (xlsx/csv/pdf) с авторизацией. */
export async function downloadAuthorized(path: string, filename: string, params?: Record<string, unknown>) {
  const blob = await api.blob(path, params)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function openAuthorizedPdf(path: string) {
  const win = window.open('', '_blank')
  try {
    const blob = await api.blob(path)
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
    if (win) win.location.href = url
    else window.location.href = url
  } catch (e) {
    win?.close()
    throw e
  }
}
