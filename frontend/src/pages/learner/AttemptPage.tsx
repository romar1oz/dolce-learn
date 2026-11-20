import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, CloudUpload, Hourglass, RefreshCw, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { db } from '@/offline/db'
import { flush, useSync } from '@/offline/sync'
import { Badge, Button, Card, ErrorBlock, LoadingBlock, ProgressRing } from '@/components/ui'
import { cn, fmtDateTime } from '@/lib/utils'
import type { AttemptResult } from '@/types'
import { useT } from '@/i18n'

export function AttemptReview({ r }: { r: AttemptResult }) {
  const t = useT()
  if (!r.answers?.length) return null
  return (
    <div className="mt-6 space-y-3">
      <h2 className="text-lg font-semibold">{t('att.review')}</h2>
      {r.answers.map((a, i) => {
        const selected = new Set(a.selected_option_ids || [])
        const order = a.type === 'ordering' ? (a.selected_option_ids || []) : []
        return (
          <Card key={a.question_id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium"><span className="text-muted">{i + 1}.</span> {a.question_text}</p>
              {a.needs_review ? <Badge variant="amber">{t('home.underReview')}</Badge>
                : a.is_correct ? <Badge variant="green">+{a.points_awarded}</Badge> : <Badge variant="red">0 / {a.points}</Badge>}
            </div>
            {a.type === 'text' ? (
              <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">{a.text_answer || <span className="text-muted">{t('att.noAnswer')}</span>}</div>
            ) : a.type === 'ordering' ? (
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><p className="mb-1 text-xs text-muted">{t('att.yourOrder')}</p>
                  <ol className="list-decimal space-y-0.5 pl-5">{order.map((id) => <li key={id}>{a.options.find((o) => o.id === id)?.text}</li>)}</ol></div>
                <div><p className="mb-1 text-xs text-muted">{t('att.correctOrder')}</p>
                  <ol className="list-decimal space-y-0.5 pl-5">{[...a.options].sort((x, y) => x.position - y.position).map((o) => <li key={o.id}>{o.text}</li>)}</ol></div>
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                {a.options.map((o) => (
                  <div key={o.id} className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                    o.is_correct ? 'bg-brand-50 text-brand-900' : selected.has(o.id) ? 'bg-red-50 text-red-800' : 'bg-slate-50')}>
                    {o.is_correct ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : selected.has(o.id) ? <XCircle className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4" />}
                    {o.text}{selected.has(o.id) && <span className="ml-auto text-xs opacity-70">{t('att.yourMark')}</span>}
                  </div>
                ))}
              </div>
            )}
            {a.explanation && <p className="mt-2 text-sm text-muted">💡 {a.explanation}</p>}
            {a.reviewer_comment && <p className="mt-2 text-sm text-brand-800">{t('att.reviewerComment', { text: a.reviewer_comment })}</p>}
          </Card>
        )
      })}
    </div>
  )
}

export function ResultHero({ r }: { r: AttemptResult }) {
  const t = useT()
  const pending = r.status === 'needs_review'
  return (
    <Card className="p-6 text-center">
      <div className="flex justify-center"><ProgressRing value={r.percent} size={120} stroke={10}><span className="text-2xl font-bold">{Math.round(r.percent)}%</span></ProgressRing></div>
      <h1 className="mt-4 text-2xl font-bold">
        {r.status === 'rejected' ? t('att.rejected') : pending ? t('att.awaiting') : r.passed ? t('att.passed') : t('att.failed')}
      </h1>
      <p className="mt-1 text-muted">{r.test_title}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {r.status === 'rejected' ? <Badge variant="red">{r.rejection_reason}</Badge>
          : pending ? <Badge variant="amber">{t('att.openAnswers')}</Badge>
          : <Badge variant={r.passed ? 'green' : 'red'}>{r.passed ? t('att.pass') : t('att.fail')}</Badge>}
        <Badge variant="outline">{t('att.points', { score: r.score, max: r.max_score })}</Badge>
        <Badge variant="outline">{t('att.correct', { n: r.correct_count, total: r.question_total })}</Badge>
        <Badge variant="outline">{t('att.passScore', { n: r.pass_score })}</Badge>
        {r.source === 'offline' && <Badge variant="blue">{t('att.offline')}</Badge>}
      </div>
      {r.submitted_at && <p className="mt-3 text-xs text-muted">{t('att.confirmed', { date: fmtDateTime(r.submitted_at) })}</p>}
    </Card>
  )
}

export default function AttemptPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const t = useT()
  const local = useLiveQuery(() => db.attempts.get(id!), [id])
  const online = useSync((s) => s.online)
  const syncing = useSync((s) => s.syncing)
  const remote = useQuery({
    queryKey: ['attempt', id], enabled: local === undefined ? false : !local?.result,
    queryFn: () => api.get<AttemptResult>(`/api/attempts/${id}`), retry: false,
  })
  if (local === undefined) return <LoadingBlock />
  const r = local?.result ?? remote.data

  return (
    <div className="mx-auto max-w-2xl">
      {local && local.status === 'pending' && !r ? (
        <Card className="p-6 text-center" data-testid="attempt-pending">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Hourglass className="h-8 w-8" /></div>
          <h1 className="text-xl font-bold">{t('att.savedTitle')}</h1>
          <p className="mt-2 text-sm text-muted">{t('att.savedText', { title: local.testTitle })}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button disabled={!online} loading={syncing} onClick={() => flush()}><CloudUpload />{online ? t('att.sendNow') : t('att.waitingNet')}</Button>
            <Button variant="outline" onClick={() => navigate(-2)}>{t('att.backToCourse')}</Button>
          </div>
        </Card>
      ) : local?.status === 'rejected' && !r ? (
        <ErrorBlock error={new Error(local.error || t('att.rejectedServer'))} />
      ) : r ? (
        <>
          <ResultHero r={r} />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {r.course_id && <Button asChild variant="secondary"><Link to={`/courses/${r.course_id}`}>{t('att.backToCourse')}</Link></Button>}
            <Button asChild variant="outline"><Link to="/results">{t('att.myResults')}</Link></Button>
            {r.passed === false && <Button variant="ghost" onClick={() => navigate(`/tests/${r.test_id}${r.course_id ? `?course=${r.course_id}` : ''}`)}><RefreshCw />{t('att.retake')}</Button>}
          </div>
          <AttemptReview r={r} />
        </>
      ) : remote.isLoading ? <LoadingBlock /> : <ErrorBlock error={remote.error ?? new Error(t('att.notFound'))} />}
    </div>
  )
}
