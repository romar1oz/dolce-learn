import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, CheckCircle2, Clock, FileText, ListChecks, MessagesSquare, PlayCircle, Signal, Trophy, User, Video } from 'lucide-react'
import { Badge, Button, Card, ErrorBlock, LoadingBlock, Progress } from '@/components/ui'
import { CoverImage, DeadlineBadge, DownloadButton, OfflineCopyNotice, StatusBadge, useCoursePackage, useCourseProgress } from '@/features/learning'
import { RichText } from '@/components/RichText'
import { cn, fmtMinutes, LEVELS, plural } from '@/lib/utils'
import { enqueue } from '@/offline/sync'
import type { Lesson } from '@/types'

function lessonIcon(l: Lesson) {
  const kinds = l.materials.map((m) => m.kind)
  if (kinds.includes('test')) return ListChecks
  if (kinds.includes('dialogue')) return MessagesSquare
  if (kinds.includes('video')) return Video
  if (kinds.some((k) => ['pdf', 'word', 'excel', 'powerpoint', 'file'].includes(k))) return FileText
  return BookOpen
}

export default function CourseOverview() {
  const { id } = useParams()
  const courseId = Number(id)
  const navigate = useNavigate()
  const { pkg, query, isOfflineCopy, downloaded } = useCoursePackage(courseId)
  const { lessons, isDone, done, percent } = useCourseProgress(pkg)

  if (!pkg) {
    if (query.isLoading) return <LoadingBlock />
    return <ErrorBlock error={query.error ?? new Error(navigator.onLine ? 'Курс не найден' : 'Курс не скачан на устройство. Подключитесь к сети.')} />
  }
  const c = pkg.course
  const nextLesson = lessons.find((l) => !isDone(l.id)) ?? lessons[0]
  const status = pkg.assignment?.status
  const start = () => {
    if (!pkg.assignment) void enqueue('course_start', { course_id: courseId })
    if (nextLesson) navigate(`/learn/${courseId}/${nextLesson.id}`)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Назад</button>
      <OfflineCopyNotice show={isOfflineCopy && !downloaded} cachedAt={query.data?.cachedAt} />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CoverImage mediaId={c.cover_media_id} title={c.title} className="aspect-[16/8]" />
            <div className="p-5">
              <div className="flex flex-wrap gap-1.5">
                {c.is_mandatory && <Badge variant="dark">Обязательный</Badge>}
                {c.category_name && <Badge variant="green">{c.category_name}</Badge>}
                {status && <StatusBadge status={status} />}
                <DeadlineBadge due={pkg.assignment?.due_date} status={status} />
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight">{c.title}</h1>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted">
                {c.author_name && <span className="flex items-center gap-1.5"><User className="h-4 w-4" />{c.author_name}</span>}
                <span className="flex items-center gap-1.5"><BookOpen className="h-4 w-4" />{lessons.length} {plural(lessons.length, 'урок', 'урока', 'уроков')}</span>
                <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />{fmtMinutes(c.duration_minutes)}</span>
                <span className="flex items-center gap-1.5"><Signal className="h-4 w-4" />{LEVELS[c.level]}</span>
                <span className="flex items-center gap-1.5"><Trophy className="h-4 w-4" />Проходной балл {c.pass_score}%</span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Progress value={percent} className="h-2.5" />
                <span className="w-12 text-right text-sm font-semibold">{percent}%</span>
              </div>
              {c.description && <RichText text={c.description} className="mt-4" />}
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="bg-gradient-to-br from-brand-900 to-brand-800 p-5 text-white">
            <p className="text-sm text-brand-100/80">{done ? `Пройдено уроков: ${done} из ${lessons.length}` : 'Курс ещё не начат'}</p>
            <p className="mt-1 truncate text-lg font-semibold">{nextLesson?.title}</p>
            <Button size="lg" className="mt-4 w-full bg-white text-brand-900 hover:bg-brand-50" onClick={start} data-testid="start-course">
              <PlayCircle />{done ? (done === lessons.length ? 'Повторить курс' : 'Продолжить обучение') : 'Начать курс'}
            </Button>
          </Card>
          <Card className="p-4">
            <p className="mb-1 text-sm font-semibold">Офлайн-доступ</p>
            <p className="mb-3 text-xs text-muted">Скачайте курс — видео, документы и тесты будут доступны без интернета. Результаты отправятся автоматически при появлении сети.</p>
            <DownloadButton courseId={courseId} totalBytes={pkg.total_bytes} />
          </Card>
        </div>
      </div>

      <h2 className="mt-8 mb-4 text-lg font-semibold">Программа курса</h2>
      <div className="space-y-5">
        {c.modules.map((m, mi) => (
          <Card key={m.id} className="p-4 sm:p-5">
            <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Модуль {mi + 1}</p>
            <h3 className="font-semibold">{m.title}</h3>
            <ol className="relative mt-4 space-y-1 before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-0.5 before:bg-brand-100">
              {m.lessons.map((l) => {
                const Icon = lessonIcon(l)
                const finished = isDone(l.id)
                const current = l.id === nextLesson?.id && !finished
                return (
                  <li key={l.id}>
                    <Link to={`/learn/${courseId}/${l.id}`} className={cn('relative flex items-center gap-3 rounded-2xl p-1.5 pr-3 transition hover:bg-slate-50', current && 'bg-brand-50')}>
                      <span className={cn('relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2',
                        finished ? 'border-brand-500 bg-brand-500 text-white' : current ? 'border-brand-500 bg-white text-brand-700 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]' : 'border-slate-200 bg-white text-slate-400')}>
                        {finished ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-[18px] w-[18px]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm font-medium', !finished && !current && 'text-slate-600')}>{l.title}</span>
                        <span className="text-xs text-muted">{l.duration_minutes ? fmtMinutes(l.duration_minutes) : `${l.materials.length} элем.`}</span>
                      </span>
                      {current && <Badge variant="green">Далее</Badge>}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  )
}
