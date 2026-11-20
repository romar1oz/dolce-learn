import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CheckCircle2, Clock, CloudDownload, Download, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useDownloadedCourse, useOfflineQuery, useLocalLessons } from '@/hooks/useOffline'
import { downloadCourse, refreshCoursePackage, removeCourse, useDownloads } from '@/offline/downloader'
import { useMediaUrl } from '@/offline/media'
import { useAuth } from '@/stores/auth'
import { ASSIGN_STATUS, cn, daysUntil, fmtBytes, fmtDate, fmtMinutes, plural } from '@/lib/utils'
import { Badge, Button, Progress } from '@/components/ui'
import type { CoursePackage, CourseSummary } from '@/types'

export function CoverImage({ mediaId, className, title }: { mediaId?: string | null; className?: string; title?: string }) {
  const { url } = useMediaUrl(mediaId)
  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-brand-900 to-brand-800', className)}>
      {url ? <img src={url} alt={title || ''} className="h-full w-full object-cover" loading="lazy" />
        : <div className="flex h-full w-full items-center justify-center text-brand-200/60"><BookOpen className="h-10 w-10" /></div>}
    </div>
  )
}

export function StatusBadge({ status, overdue }: { status?: string | null; overdue?: boolean }) {
  if (overdue) return <Badge variant="red">Просрочен</Badge>
  if (!status) return null
  const v = status === 'completed' ? 'green' : status === 'in_progress' ? 'blue' : 'default'
  return <Badge variant={v as any}>{ASSIGN_STATUS[status] || status}</Badge>
}

export function DeadlineBadge({ due, status }: { due?: string | null; status?: string | null }) {
  const d = daysUntil(due)
  if (d === null || status === 'completed') return null
  if (d < 0) return <Badge variant="red">Просрочен на {-d} {plural(-d, 'день', 'дня', 'дней')}</Badge>
  if (d <= 3) return <Badge variant="amber">Осталось {d} {plural(d, 'день', 'дня', 'дней')}</Badge>
  return <Badge variant="outline">до {fmtDate(due)}</Badge>
}

export function CourseCard({ c, to }: { c: CourseSummary & { assignment?: any }; to?: string }) {
  const uid = useAuth((s) => s.user?.id)
  const dl = useDownloadedCourse(c.id)
  const status = c.assignment?.status ?? c.assignment_status
  const progress = c.assignment?.progress_percent ?? c.progress_percent ?? 0
  const due = c.assignment?.due_date ?? c.due_date
  return (
    <Link to={to || `/courses/${c.id}`} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <div className="relative">
        <CoverImage mediaId={c.cover_media_id} title={c.title} className="aspect-[16/9]" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {c.is_mandatory && <Badge variant="dark">Обязательный</Badge>}
          {dl?.status === 'ready' && uid && <Badge variant="green"><CloudDownload className="h-3 w-3" />Офлайн</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium text-brand-800">{c.category_name || 'Курс'}</p>
        <h3 className="mt-1 line-clamp-2 font-semibold leading-snug">{c.title}</h3>
        {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{c.lesson_count} {plural(c.lesson_count, 'урок', 'урока', 'уроков')}</span>
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtMinutes(c.duration_minutes)}</span>
        </div>
        <div className="mt-auto pt-4">
          {status ? (
            <>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <StatusBadge status={status} overdue={c.assignment?.is_overdue} />
                <span className="font-semibold">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} />
              <div className="mt-2"><DeadlineBadge due={due} status={status} /></div>
            </>
          ) : <Badge variant="outline">Доступен для изучения</Badge>}
        </div>
      </div>
    </Link>
  )
}

/** Данные курса для обучающегося: онлайн — свежий пакет с сервера, офлайн — скачанный пакет из IndexedDB. */
export function useCoursePackage(courseId: number) {
  const uid = useAuth((s) => s.user?.id)
  const downloaded = useDownloadedCourse(courseId)
  const q = useOfflineQuery(['package', courseId], () => api.get<CoursePackage>(`/api/courses/${courseId}/package`),
    { staleTime: 10_000 })
  const fresh = q.data && q.data.cachedAt === null ? q.data.data : null
  useEffect(() => {
    if (fresh && uid && downloaded && (downloaded.status === 'ready' || downloaded.status === 'partial')) {
      void refreshCoursePackage(uid, courseId, fresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, uid, courseId, !!downloaded])
  const pkg: CoursePackage | undefined = fresh ?? downloaded?.pkg ?? q.data?.data
  return { pkg, downloaded, query: q, isOfflineCopy: !fresh && !!pkg }
}

export function useCourseProgress(pkg?: CoursePackage) {
  const local = useLocalLessons(pkg?.course.id)
  const lessons = pkg ? pkg.course.modules.flatMap((m) => m.lessons) : []
  const isDone = (lessonId: number) => pkg?.progress[lessonId]?.status === 'completed' || !!local[lessonId]?.completed
  const done = lessons.filter((l) => isDone(l.id)).length
  const tests = pkg?.tests ?? []
  const passed = tests.filter((t) => t.best_percent != null && t.best_percent >= t.pass_score).length
  const units = lessons.length + tests.length
  const localPct = units ? Math.round((100 * (done + passed)) / units) : 0
  const serverPct = pkg?.assignment?.progress_percent ?? 0
  return { lessons, isDone, done, percent: Math.max(serverPct, localPct), local }
}

export function DownloadButton({ courseId, totalBytes, size = 'default' }: { courseId: number; totalBytes?: number; size?: 'default' | 'lg' | 'sm' }) {
  const uid = useAuth((s) => s.user?.id)
  const dl = useDownloadedCourse(courseId)
  const active = useDownloads((s) => s.active[courseId])
  if (!uid) return null
  if (active && !active.error) {
    const pct = active.total ? Math.round((100 * active.loaded) / active.total) : 0
    return (
      <div className="w-full min-w-[220px] rounded-xl border border-brand-200 bg-brand-50 p-3" data-testid="download-progress">
        <div className="flex items-center justify-between text-xs font-medium text-brand-900">
          <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Скачивание… {pct}%</span>
          <span>{fmtBytes(active.loaded)} / {fmtBytes(active.total)}</span>
        </div>
        <Progress value={pct} className="mt-2 bg-white" />
        {active.current && <p className="mt-1 truncate text-[11px] text-muted">{active.current}</p>}
      </div>
    )
  }
  if (dl?.status === 'ready') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="green" className="py-1.5"><CheckCircle2 className="h-3.5 w-3.5" />Доступен офлайн · {fmtBytes(dl.totalBytes)}</Badge>
        <Button size="sm" variant="ghost" onClick={async () => {
          if (!confirm('Удалить скачанные материалы курса с устройства? Прогресс обучения сохранится.')) return
          await removeCourse(uid, courseId)
          toast.success('Материалы курса удалены с устройства')
        }}><Trash2 />Удалить с устройства</Button>
      </div>
    )
  }
  return (
    <Button size={size} variant="secondary" data-testid="download-course" disabled={!navigator.onLine}
            onClick={async () => {
              try {
                await downloadCourse(uid, courseId)
                toast.success('Курс скачан и доступен без интернета')
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Не удалось скачать курс')
              }
            }}>
      <Download />{dl?.status === 'partial' || dl?.status === 'error' ? 'Докачать для офлайн-доступа' : 'Скачать для офлайн-доступа'}
      {totalBytes ? <span className="font-normal opacity-70">· {fmtBytes(totalBytes)}</span> : null}
    </Button>
  )
}

export function OfflineCopyNotice({ show, cachedAt }: { show: boolean; cachedAt?: number | null }) {
  if (!show) return null
  return (
    <div className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Нет связи с сервером — показаны сохранённые на устройстве данные{cachedAt ? ` от ${new Date(cachedAt).toLocaleString('ru-RU')}` : ''}.
    </div>
  )
}
