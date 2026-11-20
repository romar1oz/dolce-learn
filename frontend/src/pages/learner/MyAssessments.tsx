import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Target } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, Textarea } from '@/components/ui'
import { cn, fmtDate } from '@/lib/utils'
import { useT, type TKey } from '@/i18n'

export default function MyAssessments() {
  const q = useOfflineQuery(['my-assessments'], () => api.get<any[]>('/api/competencies/assessments'))
  const qc = useQueryClient()
  const t = useT()
  const list = (q.data?.data || []).filter((a) => a.my)
  const [open, setOpen] = useState<number | null>(null)
  const [scores, setScores] = useState<Record<number, number>>({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('ass.title')} subtitle={t('ass.subtitle')} />
      {q.isLoading ? <Skeleton className="h-40" /> : list.length === 0 ? <EmptyState icon={Target} title={t('ass.empty')} />
        : list.map((a) => {
          const isOpen = open === a.id
          const done = !!a.my.submitted_at
          const qs = a.competencies.flatMap((c: any) => c.questions.map((x: any) => ({ ...x, comp: c.name })))
          return (
            <Card key={a.id} className="mb-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-sm text-muted">{t('ass.subject', { name: a.subject_name })} · {t('ass.role', { role: t(`ass.rel.${a.my.relation}` as TKey) })}</p>
                  {a.due_date && <p className="text-xs text-muted">{t('ass.due', { date: fmtDate(a.due_date) })}</p>}
                </div>
                {done ? <Badge variant="green"><CheckCircle2 className="h-3 w-3" />{t('ass.sent')}</Badge>
                  : a.status !== 'active' ? <Badge>{t('common.closed')}</Badge>
                  : <Button size="sm" onClick={() => { setOpen(isOpen ? null : a.id); setScores({}); setComment('') }}>{isOpen ? t('common.collapse') : t('ass.rate')}</Button>}
              </div>
              {isOpen && !done && (
                <div className="mt-5 space-y-4">
                  {qs.map((x: any) => (
                    <div key={x.id}>
                      <p className="text-xs font-semibold text-brand-700">{x.comp}</p>
                      <p className="text-sm font-medium">{x.text}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from({ length: a.scale_max - a.scale_min + 1 }, (_, i) => a.scale_min + i).map((v) => (
                          <button key={v} onClick={() => setScores({ ...scores, [x.id]: v })}
                                  className={cn('h-10 min-w-10 rounded-xl border px-3 text-sm font-semibold transition',
                                    scores[x.id] === v ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white hover:border-brand-300')}
                                  title={a.scale_labels?.[String(v)]}>{v}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {a.scale_labels && <p className="text-xs text-muted">{Object.entries(a.scale_labels).map(([k, v]) => `${k} — ${v}`).join('; ')}</p>}
                  <Textarea placeholder={t('ass.comment')} value={comment} onChange={(e) => setComment(e.target.value)} />
                  <Button loading={busy} disabled={Object.keys(scores).length !== qs.length} onClick={async () => {
                    setBusy(true)
                    try {
                      await api.post(`/api/competencies/assessments/${a.id}/submit`, {
                        scores: Object.entries(scores).map(([qid, score]) => ({ question_id: Number(qid), score })), comment })
                      toast.success(t('ass.submitted'))
                      setOpen(null)
                      qc.invalidateQueries({ queryKey: ['my-assessments'] })
                    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
                  }}>{t('ass.submit', { done: Object.keys(scores).length, total: qs.length })}</Button>
                </div>
              )}
            </Card>
          )
        })}
    </div>
  )
}
