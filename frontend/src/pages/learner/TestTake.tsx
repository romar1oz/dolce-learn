import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, Clock, ListChecks, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useOfflineQuery, useDownloadedCourse } from '@/hooks/useOffline'
import { useAuth } from '@/stores/auth'
import { db, kvGet, kvSet } from '@/offline/db'
import { enqueue } from '@/offline/sync'
import { useLearningTimer } from '@/offline/tracker'
import { Badge, Button, Card, ErrorBlock, LoadingBlock, Progress, Textarea } from '@/components/ui'
import { cn, shuffle, uuid } from '@/lib/utils'
import type { LearnerQuestion, LearnerTest } from '@/types'
import { useLiveQuery } from 'dexie-react-hooks'

interface Draft {
  attemptId: string
  startedAt: string
  questions: LearnerQuestion[]
  answers: Record<number, { selected: number[]; text?: string }>
  index: number
}

const LETTERS = 'ABCDEFGHIJ'

export default function TestTake() {
  const { id } = useParams()
  const testId = Number(id)
  const [sp] = useSearchParams()
  const courseParam = Number(sp.get('course')) || undefined
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)!
  const downloaded = useDownloadedCourse(courseParam)
  const q = useOfflineQuery(['take', testId], () => api.get<LearnerTest>(`/api/tests/${testId}/take`), { staleTime: 0 })
  const fromPkg = downloaded?.pkg.tests.find((t) => t.id === testId)
  const test: LearnerTest | undefined = (q.data && q.data.cachedAt === null ? q.data.data : undefined) ?? fromPkg ?? q.data?.data
  const localPending = useLiveQuery(() => db.attempts.where({ testId }).filter((a) => a.userId === user.id && a.status === 'pending').count(), [testId, user.id]) ?? 0
  const draftKey = `testdraft:${user.id}:${testId}`
  const [draft, setDraft] = useState<Draft | null>(null)
  const [restored, setRestored] = useState(false)
  const [now, setNow] = useState(Date.now())
  const submitting = useRef(false)

  useLearningTimer({ courseId: test?.course_id ?? courseParam, enabled: !!draft })

  useEffect(() => {
    kvGet<Draft>(draftKey).then((d) => {
      if (d?.value) setDraft(d.value)
      setRestored(true)
    })
  }, [draftKey])
  useEffect(() => { if (draft) void kvSet(draftKey, draft) }, [draft, draftKey])
  useEffect(() => {
    if (!draft) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [draft])

  const limitMs = test?.time_limit_minutes ? test.time_limit_minutes * 60_000 : null
  const leftMs = draft && limitMs ? Math.max(0, +new Date(draft.startedAt) + limitMs - now) : null

  const submit = async (auto = false) => {
    if (!draft || !test || submitting.current) return
    submitting.current = true
    const courseId = test.course_id ?? courseParam ?? null
    const answers = draft.questions.map((qq) => ({
      question_id: qq.id,
      selected_option_ids: draft.answers[qq.id]?.selected ?? [],
      text_answer: draft.answers[qq.id]?.text ?? null,
    }))
    await db.attempts.put({ id: draft.attemptId, userId: user.id, testId, courseId, testTitle: test.title, status: 'pending',
                            createdAt: Date.now(), answers })
    await enqueue('test_attempt', {
      attempt_id: draft.attemptId, test_id: testId, course_id: courseId, question_ids: draft.questions.map((x) => x.id),
      answers, started_at: draft.startedAt, finished_at: new Date().toISOString(),
    }, { flush: true })
    await db.kv.delete(draftKey)
    if (auto) toast.info('Время теста истекло — ответы отправлены автоматически')
    navigate(`/attempts/${draft.attemptId}`, { replace: true })
  }

  useEffect(() => {
    if (leftMs === 0) void submit(true)
  }, [leftMs]) // eslint-disable-line react-hooks/exhaustive-deps

  const begin = () => {
    if (!test) return
    let qs = test.shuffle_questions ? shuffle(test.questions) : [...test.questions]
    if (test.question_count && test.question_count < qs.length) qs = shuffle(qs).slice(0, test.question_count)
    qs = qs.map((qq) => ({ ...qq, options: qq.type === 'ordering' ? shuffle(qq.options) : test.shuffle_options ? shuffle(qq.options) : qq.options }))
    const answers: Draft['answers'] = {}
    qs.forEach((qq) => { if (qq.type === 'ordering') answers[qq.id] = { selected: qq.options.map((o) => o.id) } })
    setDraft({ attemptId: uuid(), startedAt: new Date().toISOString(), questions: qs, answers, index: 0 })
  }

  const current = draft?.questions[draft.index]
  const answered = useMemo(() => draft ? draft.questions.filter((qq) => {
    const a = draft.answers[qq.id]
    return qq.type === 'text' ? !!a?.text?.trim() : qq.type === 'ordering' ? true : !!a?.selected?.length
  }).length : 0, [draft])

  if (!restored || (!test && q.isLoading)) return <LoadingBlock />
  if (!test) return <ErrorBlock error={q.error ?? new Error('Тест недоступен офлайн. Скачайте курс заранее.')} />

  const used = test.attempts_used + localPending
  const limitReached = !!test.max_attempts && used >= test.max_attempts
  const total = Math.min(test.question_count || test.questions.length, test.questions.length)

  if (!draft) {
    return (
      <div className="mx-auto max-w-xl py-4">
        <button onClick={() => navigate(-1)} className="mb-4 text-sm font-medium text-muted hover:text-ink">← Назад</button>
        <Card className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-800"><ListChecks className="h-7 w-7" /></div>
          <h1 className="text-2xl font-bold tracking-tight">{test.title}</h1>
          {test.description && <p className="mt-2 text-muted">{test.description}</p>}
          <div className="mt-5 grid grid-cols-2 gap-3 text-left text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted">Вопросов</p><p className="font-semibold">{total}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted">Проходной балл</p><p className="font-semibold">{test.pass_score}%</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted">Время</p><p className="font-semibold">{test.time_limit_minutes ? `${test.time_limit_minutes} мин` : 'Без ограничения'}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-muted">Попытки</p><p className="font-semibold">{test.max_attempts ? `${used} из ${test.max_attempts}` : `${used} (без лимита)`}</p></div>
          </div>
          {test.best_percent != null && <p className="mt-4 text-sm">Лучший результат: <b>{Math.round(test.best_percent)}%</b></p>}
          {!navigator.onLine && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Вы офлайн. Ответы сохранятся на устройстве, а результат будет рассчитан сервером после синхронизации.</p>}
          {limitReached ? <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">Лимит попыток исчерпан. Обратитесь к методисту.</p>
            : <Button size="lg" className="mt-6 w-full" onClick={begin} data-testid="begin-test">Начать тест</Button>}
        </Card>
      </div>
    )
  }

  const setAns = (patch: { selected?: number[]; text?: string }) => setDraft((d) => d && ({
    ...d, answers: { ...d.answers, [current!.id]: { ...d.answers[current!.id], selected: d.answers[current!.id]?.selected ?? [], ...patch } },
  }))
  const a = draft.answers[current!.id] ?? { selected: [] }
  const isLast = draft.index === draft.questions.length - 1
  const mm = leftMs != null ? `${Math.floor(leftMs / 60000)}:${String(Math.floor((leftMs % 60000) / 1000)).padStart(2, '0')}` : null

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] max-w-2xl flex-col py-2 lg:min-h-0">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Тест</h1>
        <div className="flex items-center gap-2">
          {mm && <Badge variant={leftMs! < 60000 ? 'red' : 'outline'} className="py-1"><Clock className="h-3.5 w-3.5" />{mm}</Badge>}
          <button className="rounded-full border border-line bg-white p-2 hover:bg-slate-50" aria-label="Прервать"
                  onClick={() => { if (confirm('Прервать тест? Ответы сохранены — можно продолжить позже.')) navigate(-1) }}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <Progress value={((draft.index + 1) / draft.questions.length) * 100} className="mb-6 h-1.5" />
      <p className="text-sm font-medium text-muted">Вопрос {draft.index + 1} из {draft.questions.length}</p>
      <h2 className="mt-2 text-xl leading-snug font-semibold sm:text-2xl" data-testid="question-text">{current!.text}</h2>
      <p className="mt-1 text-xs text-muted">
        {current!.type === 'single' ? 'Выберите один вариант' : current!.type === 'multiple' ? 'Выберите все правильные варианты'
          : current!.type === 'ordering' ? 'Расставьте элементы в правильном порядке' : 'Напишите развёрнутый ответ — его проверит методист'}
      </p>

      <div className="mt-6 flex-1 space-y-3">
        {(current!.type === 'single' || current!.type === 'multiple') && current!.options.map((o, i) => {
          const sel = a.selected.includes(o.id)
          return (
            <button key={o.id} data-testid="option"
                    onClick={() => setAns({ selected: current!.type === 'single' ? [o.id] : sel ? a.selected.filter((x) => x !== o.id) : [...a.selected, o.id] })}
                    className={cn('flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-4 text-left transition',
                      sel ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-transparent bg-white shadow-[var(--shadow-soft)] hover:border-brand-200')}>
              <span className={cn('mt-px flex h-6 w-6 shrink-0 items-center justify-center text-xs font-bold',
                current!.type === 'multiple' ? 'rounded-md border-2' : 'rounded-full border-2', sel ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 text-slate-500')}>
                {sel ? <Check className="h-3.5 w-3.5" /> : LETTERS[i]}
              </span>
              <span className="font-medium">{o.text}</span>
            </button>
          )
        })}
        {current!.type === 'ordering' && a.selected.map((oid, i) => {
          const o = current!.options.find((x) => x.id === oid)!
          const move = (d: number) => {
            const arr = [...a.selected]
            ;[arr[i], arr[i + d]] = [arr[i + d], arr[i]]
            setAns({ selected: arr })
          }
          return (
            <div key={oid} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3 shadow-[var(--shadow-soft)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-900">{i + 1}</span>
              <span className="flex-1 font-medium">{o.text}</span>
              <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(-1)} aria-label="Выше"><ArrowUp /></Button>
              <Button size="icon-sm" variant="ghost" disabled={i === a.selected.length - 1} onClick={() => move(1)} aria-label="Ниже"><ArrowDown /></Button>
            </div>
          )
        })}
        {current!.type === 'text' && (
          <Textarea rows={6} placeholder="Ваш ответ" value={a.text ?? ''} onChange={(e) => setAns({ text: e.target.value })} />
        )}
      </div>

      <div className="safe-bottom sticky bottom-0 mt-6 flex gap-3 bg-page/95 py-3 backdrop-blur">
        <Button variant="outline" size="lg" className="flex-1" disabled={draft.index === 0}
                onClick={() => setDraft({ ...draft, index: draft.index - 1 })}>Назад</Button>
        {!isLast ? (
          <Button size="lg" className="flex-[2]" onClick={() => setDraft({ ...draft, index: draft.index + 1 })} data-testid="next-question">Далее</Button>
        ) : (
          <Button size="lg" variant="accent" className="flex-[2]" data-testid="finish-test" onClick={() => {
            const missing = draft.questions.length - answered
            if (missing > 0 && !confirm(`Без ответа: ${missing}. Завершить тест?`)) return
            void submit()
          }}>Завершить тест</Button>
        )}
      </div>
    </div>
  )
}
