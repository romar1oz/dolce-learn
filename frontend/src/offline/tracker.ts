/* Учёт активного времени обучения.
   - Время идёт, только когда вкладка видима (Visibility API) И пользователь активен (ввод за последние 60 с)
     ИЛИ воспроизводится видео.
   - Каждые 30 с накопленное время отправляется heartbeat-событием в очередь (сервер дополнительно
     ограничивает одно событие 60 секундами).
   - Защита от двойного подсчёта: считать может только одна вкладка (Web Locks / BroadcastChannel). */
import { useEffect, useRef } from 'react'
import { enqueue } from './sync'

const IDLE_MS = 60_000
const TICK_MS = 1_000
const FLUSH_MS = 30_000

let lastInput = Date.now()
let listening = false
function listenActivity() {
  if (listening) return
  listening = true
  const mark = () => (lastInput = Date.now())
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel']) {
    window.addEventListener(ev, mark, { passive: true, capture: true })
  }
}

/** Активна ли эта вкладка как «ведущая» для учёта времени. */
const tabId = Math.random().toString(36).slice(2)
let leader = false
let leaderInit = false
function initLeader() {
  if (leaderInit) return
  leaderInit = true
  const locks = (navigator as any).locks
  if (locks?.request) {
    locks.request('dolce-time-tracker', () => {
      leader = true
      return new Promise(() => {}) // держим блокировку, пока вкладка жива
    })
  } else {
    leader = true
  }
}

export interface TrackerOpts {
  courseId?: number | null
  lessonId?: number | null
  mediaPlayingRef?: React.MutableRefObject<boolean>
  enabled?: boolean
}

export const trackerStats = { activeSec: 0 }

export function useLearningTimer({ courseId, lessonId, mediaPlayingRef, enabled = true }: TrackerOpts) {
  const acc = useRef({ active: 0, media: 0 })
  useEffect(() => {
    if (!enabled) return
    listenActivity()
    initLeader()
    lastInput = Date.now()
    const tick = setInterval(() => {
      if (!leader || document.visibilityState !== 'visible') return
      const playing = !!mediaPlayingRef?.current
      const active = playing || Date.now() - lastInput < IDLE_MS
      if (!active) return
      acc.current.active += 1
      trackerStats.activeSec += 1
      if (playing) acc.current.media += 1
    }, TICK_MS)
    const send = () => {
      const { active, media } = acc.current
      if (active < 1) return
      acc.current = { active: 0, media: 0 }
      void enqueue('heartbeat', { course_id: courseId ?? null, lesson_id: lessonId ?? null, active_sec: active,
                                  media_sec: media, tab: tabId })
    }
    const flushTimer = setInterval(send, FLUSH_MS)
    const onHide = () => document.visibilityState === 'hidden' && send()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', send)
    return () => {
      clearInterval(tick)
      clearInterval(flushTimer)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', send)
      send()
    }
  }, [courseId, lessonId, enabled, mediaPlayingRef])
}
