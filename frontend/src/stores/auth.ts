/* Состояние авторизации. Онлайн: access-токен в памяти, восстановление сессии через refresh-cookie.
   Офлайн: если ранее была создана действительная локальная сессия (без пароля и токенов), пользователь
   может открывать скачанные материалы. Роль из локальной сессии влияет только на интерфейс —
   все права заново проверяются сервером при синхронизации. */
import { create } from 'zustand'
import { api, configureAuthHooks, NetworkError, refreshSession, setAccessToken } from '@/lib/api'
import { db } from '@/offline/db'
import type { TokenResponse, User } from '@/types'

const OFFLINE_SESSION_DAYS = 14

type Status = 'loading' | 'authenticated' | 'offline' | 'anonymous'

interface AuthState {
  status: Status
  user: User | null
  offlineExpiresAt: number | null
  bootstrap: () => Promise<void>
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  setUser: (u: User) => void
  tryReconnect: () => Promise<boolean>
}

async function persistSession(t: TokenResponse) {
  const refreshExp = new Date(t.refresh_expires_at).getTime()
  const cap = Date.now() + OFFLINE_SESSION_DAYS * 86400000
  await db.session.put({ id: 'current', user: t.user, savedAt: Date.now(), expiresAt: Math.min(refreshExp, cap) })
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  offlineExpiresAt: null,

  async bootstrap() {
    try {
      const t = await refreshSession()
      if (t) {
        await persistSession(t)
        set({ status: 'authenticated', user: t.user, offlineExpiresAt: null })
      } else {
        await db.session.delete('current')
        set({ status: 'anonymous', user: null })
      }
    } catch (e) {
      // сервер недоступен — пробуем офлайн-сессию
      const s = await db.session.get('current')
      if (s && s.expiresAt > Date.now()) {
        set({ status: 'offline', user: s.user, offlineExpiresAt: s.expiresAt })
      } else {
        set({ status: 'anonymous', user: null })
        if (!(e instanceof NetworkError)) console.error(e)
      }
    }
  },

  async login(email, password) {
    const t = await api.post<TokenResponse>('/api/auth/login', { email, password })
    setAccessToken(t.access_token)
    await persistSession(t)
    set({ status: 'authenticated', user: t.user, offlineExpiresAt: null })
    return t.user
  },

  async logout() {
    try {
      await api.post('/api/auth/logout')
    } catch { /* офлайн-выход: сессия на сервере истечёт сама */ }
    setAccessToken(null)
    await db.session.delete('current')
    set({ status: 'anonymous', user: null, offlineExpiresAt: null })
  },

  setUser(u) {
    set({ user: u })
    db.session.update('current', { user: u })
  },

  async tryReconnect() {
    if (get().status !== 'offline') return get().status === 'authenticated'
    try {
      const t = await refreshSession()
      if (t) {
        await persistSession(t)
        set({ status: 'authenticated', user: t.user, offlineExpiresAt: null })
        return true
      }
      // сервер доступен, но сессия недействительна — нужен повторный вход
      await db.session.delete('current')
      set({ status: 'anonymous', user: null })
      return false
    } catch {
      return false
    }
  },
}))

configureAuthHooks({
  refreshed: (t) => {
    persistSession(t)
    const st = useAuth.getState()
    if (st.status !== 'authenticated' || st.user?.id !== t.user.id) {
      useAuth.setState({ status: 'authenticated', user: t.user, offlineExpiresAt: null })
    }
  },
  unauthorized: () => {
    setAccessToken(null)
    db.session.delete('current')
    useAuth.setState({ status: 'anonymous', user: null })
  },
})

export function hasRole(user: User | null, ...roles: User['role'][]) {
  return !!user && roles.includes(user.role)
}
export const isStaff = (u: User | null) => hasRole(u, 'super_admin', 'methodist')
