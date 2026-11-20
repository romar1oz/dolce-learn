import { Link } from 'react-router-dom'
import { Award, BookOpen, CalendarClock, CheckCircle2, ChevronRight, Clock, PlayCircle, Target, Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { useAuth } from '@/stores/auth'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, ErrorBlock, ProgressRing, Progress, Skeleton } from '@/components/ui'
import { CoverImage, DeadlineBadge, OfflineCopyNotice, StatusBadge } from '@/features/learning'
import { fmtDate, fmtDuration } from '@/lib/utils'
import type { Assignment } from '@/types'

interface Dash {
  user: { full_name: string; department_name?: string; position?: string }
  overall_progress: number
  assigned_count: number
  completed_count: number
  in_progress_count: number
  overdue_count: number
  learning_time_sec: number
  unfinished: Assignment[]
  upcoming_deadlines: Assignment[]
  recent_results: { id: string; test_title: string; percent: number; passed: boolean | null; status: string; submitted_at: string; source: string }[]
  certificates: { id: number; number: string; course_title: string; issued_at: string; score?: number }[]
}

function greeting() {
  const h = new Date().getHours()
  return h < 6 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'
}

export default function LearnerHome() {
  const user = useAuth((s) => s.user)!
  const q = useOfflineQuery(['dashboard'], () => api.get<Dash>('/api/progress/dashboard'))
  const assessments = useOfflineQuery(['my-assessments'], () => api.get<any[]>('/api/competencies/assessments'))
  const pending360 = (assessments.data?.data || []).filter((a) => a.my && !a.my.submitted_at && a.status === 'active')
  const d = q.data?.data
  const firstName = user.full_name.split(' ')[1] || user.full_name.split(' ')[0]

  if (q.error && !d) return <ErrorBlock error={q.error} retry={() => q.refetch()} />
  const next = d?.unfinished.find((a) => a.status === 'in_progress') || d?.unfinished[0]

  return (
    <div className="space-y-6">
      <OfflineCopyNotice show={!!q.data?.cachedAt} cachedAt={q.data?.cachedAt} />
      <section className="relative overflow-hidden rounded-3xl bg-brand-900 p-5 text-white sm:p-7">
        <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-brand-500/30 blur-2xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-brand-100/80">{greeting()},</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">{firstName}!</h1>
            <p className="mt-1 text-sm text-brand-100/80">{user.department_name}{user.position ? ` · ${user.position}` : ''}</p>
          </div>
          <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-3 pr-5">
            <div className="rounded-full bg-white p-1 text-ink"><ProgressRing value={d?.overall_progress ?? 0} size={64} /></div>
            <div>
              <p className="text-xs text-brand-100/80">Общий прогресс</p>
              <p className="text-sm font-semibold">{d ? `${d.completed_count} из ${d.assigned_count} курсов` : '…'}</p>
              <p className="text-xs text-brand-100/70">{d ? `${fmtDuration(d.learning_time_sec)} обучения` : ''}</p>
            </div>
          </div>
        </div>
        {next && (
          <Link to={`/courses/${next.course_id}`} className="relative mt-5 flex items-center gap-3 rounded-2xl bg-white p-3 text-ink transition hover:bg-brand-50">
            <CoverImage mediaId={next.cover_media_id} className="h-14 w-20 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-brand-800">{next.status === 'in_progress' ? 'Продолжить обучение' : 'Начать обучение'}</p>
              <p className="truncate font-semibold">{next.course_title}</p>
              <Progress value={next.progress_percent} className="mt-1.5 h-1.5" />
            </div>
            <PlayCircle className="h-9 w-9 shrink-0 text-brand-500" />
          </Link>
        )}
      </section>

      {pending360.length > 0 && (
        <Link to="/assessments" className="card flex items-center gap-3 p-4 hover:bg-brand-50/40">
          <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><Target className="h-5 w-5" /></div>
          <div className="flex-1"><p className="font-semibold">Ожидает вашей оценки: {pending360.length}</p><p className="text-sm text-muted">Оценка компетенций 180/360</p></div>
          <ChevronRight className="h-5 w-5 text-muted" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: BookOpen, label: 'Назначено', value: d?.assigned_count },
          { icon: PlayCircle, label: 'В процессе', value: d?.in_progress_count },
          { icon: CheckCircle2, label: 'Завершено', value: d?.completed_count },
          { icon: CalendarClock, label: 'Просрочено', value: d?.overdue_count, red: true },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <s.icon className={`h-5 w-5 ${s.red && s.value ? 'text-red-500' : 'text-brand-600'}`} />
            <p className="mt-2 text-2xl font-bold">{s.value ?? '–'}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Незавершённые курсы</CardTitle><Link to="/courses" className="text-sm font-medium text-brand-800">Все курсы</Link></CardHeader>
          <CardContent className="space-y-2">
            {!d ? <Skeleton className="h-40" /> : d.unfinished.length === 0
              ? <EmptyState icon={Trophy} title="Все назначенные курсы пройдены" text="Загляните в каталог — там есть дополнительные материалы." action={<Button asChild variant="secondary"><Link to="/catalog">Каталог курсов</Link></Button>} />
              : d.unfinished.map((a) => (
                <Link key={a.id} to={`/courses/${a.course_id}`} className="flex items-center gap-3 rounded-2xl p-2 transition hover:bg-slate-50">
                  <CoverImage mediaId={a.cover_media_id} className="h-14 w-20 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.course_title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={a.status} overdue={a.is_overdue} />
                      {a.is_mandatory && <Badge variant="outline">обязательный</Badge>}
                    </div>
                    <Progress value={a.progress_percent} className="mt-2 h-1.5" />
                  </div>
                  <span className="w-10 text-right text-sm font-semibold">{Math.round(a.progress_percent)}%</span>
                </Link>
              ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Ближайшие сроки</CardTitle><Clock className="h-4 w-4 text-muted" /></CardHeader>
            <CardContent className="space-y-2.5">
              {!d ? <Skeleton className="h-20" /> : d.upcoming_deadlines.length === 0 ? <p className="text-sm text-muted">Сроков нет</p>
                : d.upcoming_deadlines.map((a) => (
                  <Link to={`/courses/${a.course_id}`} key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{a.course_title}</span><DeadlineBadge due={a.due_date} status={a.status} />
                  </Link>
                ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Последние результаты</CardTitle><Link to="/results" className="text-sm font-medium text-brand-800">Все</Link></CardHeader>
            <CardContent className="space-y-2.5">
              {!d ? <Skeleton className="h-20" /> : d.recent_results.length === 0 ? <p className="text-sm text-muted">Вы ещё не проходили тесты</p>
                : d.recent_results.map((r) => (
                  <Link to={`/attempts/${r.id}`} key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{r.test_title}<span className="block text-xs text-muted">{fmtDate(r.submitted_at)}</span></span>
                    {r.status === 'needs_review' ? <Badge variant="amber">На проверке</Badge>
                      : <Badge variant={r.passed ? 'green' : 'red'}>{Math.round(r.percent)}%</Badge>}
                  </Link>
                ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Сертификаты</CardTitle><Award className="h-4 w-4 text-muted" /></CardHeader>
            <CardContent className="space-y-2">
              {!d ? <Skeleton className="h-12" /> : d.certificates.length === 0 ? <p className="text-sm text-muted">Пока нет сертификатов</p>
                : d.certificates.slice(0, 3).map((c) => (
                  <Link to="/certificates" key={c.id} className="flex items-center gap-2 rounded-xl bg-brand-50 p-2.5 text-sm">
                    <Award className="h-4 w-4 shrink-0 text-brand-700" /><span className="truncate">{c.course_title}</span>
                  </Link>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
