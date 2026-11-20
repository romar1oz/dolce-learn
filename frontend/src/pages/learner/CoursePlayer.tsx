import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ListOrdered, X } from 'lucide-react'
import { useAuth } from '@/stores/auth'
import { Button, Card, ErrorBlock, LoadingBlock, Progress } from '@/components/ui'
import { useCoursePackage, useCourseProgress } from '@/features/learning'
import { MaterialView } from '@/features/materials'
import { enqueue } from '@/offline/sync'
import { completeLesson, saveLessonLocal } from '@/offline/progress'
import { useLearningTimer } from '@/offline/tracker'
import { cn } from '@/lib/utils'

export default function CoursePlayer() {
  const { courseId: cid, lessonId: lid } = useParams()
  const courseId = Number(cid)
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)!
  const { pkg, query } = useCoursePackage(courseId)
  const { lessons, isDone, percent, local } = useCourseProgress(pkg)
  const [menu, setMenu] = useState(false)
  const playingRef = useRef(false)
  const lessonId = Number(lid) || lessons[0]?.id
  const idx = lessons.findIndex((l) => l.id === lessonId)
  const lesson = lessons[idx]
  const moduleOf = useMemo(() => pkg?.course.modules.find((m) => m.lessons.some((l) => l.id === lessonId)), [pkg, lessonId])

  useLearningTimer({ courseId, lessonId: lesson?.id, mediaPlayingRef: playingRef, enabled: !!lesson })

  useEffect(() => {
    if (!lesson) return
    void enqueue('lesson_open', { lesson_id: lesson.id, course_id: courseId })
    void saveLessonLocal(user.id, lesson.id, courseId, {})
    window.scrollTo({ top: 0 })
    setMenu(false)
  }, [lesson?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!pkg) return query.isLoading ? <LoadingBlock /> : <ErrorBlock error={query.error ?? new Error('Курс недоступен офлайн — он не был скачан на устройство.')} />
  if (!lesson) return lessons.length ? <Navigate to={`/learn/${courseId}/${lessons[0].id}`} replace /> : <ErrorBlock error={new Error('В курсе нет уроков')} />

  const hasTest = lesson.materials.some((m) => m.kind === 'test')
  const done = isDone(lesson.id)
  const prev = lessons[idx - 1]
  const next = lessons[idx + 1]
  const serverPos = pkg.progress[lesson.id]?.video_position_sec
  const videoStart = local[lesson.id]?.videoPosition ?? serverPos

  const goNext = async () => {
    if (!hasTest) await completeLesson(user.id, lesson.id, courseId)
    if (next) navigate(`/learn/${courseId}/${next.id}`)
    else navigate(`/courses/${courseId}`)
  }

  const Outline = () => (
    <div className="space-y-4">
      {pkg.course.modules.map((m, mi) => (
        <div key={m.id}>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">Модуль {mi + 1}. {m.title}</p>
          <div className="space-y-0.5">
            {m.lessons.map((l) => (
              <Link key={l.id} to={`/learn/${courseId}/${l.id}`}
                    className={cn('flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition',
                      l.id === lesson.id ? 'bg-brand-100 font-semibold text-brand-900' : 'hover:bg-slate-100')}>
                {isDone(l.id) ? <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-500" />
                  : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" />}
                <span className="line-clamp-2">{l.title}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl">
      {/* мобильная шапка урока */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-line bg-page/95 px-3 py-2.5 backdrop-blur sm:-mx-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0">
        <Link to={`/courses/${courseId}`} className="rounded-full border border-line bg-white p-2 hover:bg-slate-50" aria-label="К курсу"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{pkg.course.title}</p>
          <div className="flex items-center gap-2"><Progress value={percent} className="h-1.5" /><span className="text-xs font-semibold">{percent}%</span></div>
        </div>
        <Button variant="outline" size="icon" className="rounded-full lg:hidden" onClick={() => setMenu(true)} aria-label="Список уроков"><ListOrdered /></Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">{moduleOf?.title} · урок {idx + 1} из {lessons.length}</p>
          <h1 className="mt-1 mb-5 text-xl font-bold tracking-tight sm:text-2xl" data-testid="lesson-title">{lesson.title}</h1>
          {lesson.description && <p className="mb-5 text-muted">{lesson.description}</p>}
          <div className="space-y-6">
            {lesson.materials.map((m) => (
              <MaterialView key={m.id} m={m} pkg={pkg} courseId={courseId} lessonId={lesson.id} userId={user.id}
                            playingRef={playingRef} videoStart={videoStart} />
            ))}
            {lesson.materials.length === 0 && <p className="text-muted">В уроке пока нет материалов.</p>}
          </div>

          <Card className="mt-8 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              {done ? <span className="flex items-center gap-1.5 font-medium text-brand-800"><CheckCircle2 className="h-4 w-4" />Урок завершён</span>
                : hasTest ? <span className="text-muted">Урок засчитывается после успешной сдачи теста</span>
                : <span className="text-muted">Изучите материалы и переходите дальше</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!prev} onClick={() => prev && navigate(`/learn/${courseId}/${prev.id}`)}><ChevronLeft />Назад</Button>
              <Button onClick={goNext} data-testid="next-lesson">{next ? 'Следующий урок' : 'Завершить'}<ChevronRight /></Button>
            </div>
          </Card>
        </div>

        <aside className="hidden lg:block">
          <Card className="sticky top-20 max-h-[calc(100dvh-7rem)] overflow-y-auto p-4"><Outline /></Card>
        </aside>
      </div>

      {menu && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenu(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold">Уроки курса</p>
              <button onClick={() => setMenu(false)} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Закрыть"><X className="h-5 w-5" /></button>
            </div>
            <Outline />
          </div>
        </div>
      )}
    </div>
  )
}
