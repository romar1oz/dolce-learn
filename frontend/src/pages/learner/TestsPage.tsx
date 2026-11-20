import { Link } from 'react-router-dom'
import { Clock, ListChecks } from 'lucide-react'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { Badge, Button, Card, EmptyState, ErrorBlock, PageHeader, Skeleton } from '@/components/ui'
import { OfflineCopyNotice } from '@/features/learning'
import type { LearnerTest } from '@/types'
import { useT } from '@/i18n'

export default function TestsPage() {
  const t0 = useT()
  const q = useOfflineQuery(['tests-learner'], () => api.get<LearnerTest[]>('/api/tests'))
  const list = q.data?.data || []
  return (
    <div>
      <PageHeader title={t0('nav.tests')} subtitle={t0('tests.subtitle')} />
      <OfflineCopyNotice show={!!q.data?.cachedAt} cachedAt={q.data?.cachedAt} />
      {q.error && !q.data ? <ErrorBlock error={q.error} /> : q.isLoading ? <Skeleton className="h-48" />
        : list.length === 0 ? <EmptyState icon={ListChecks} title={t0('tests.empty')} />
        : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((t) => {
              const passed = t.best_percent != null && t.best_percent >= t.pass_score
              const left = t.max_attempts ? t.max_attempts - t.attempts_used : null
              return (
                <Card key={t.id} className="flex flex-col p-4">
                  <p className="text-xs font-medium text-brand-800">{t.course_title}</p>
                  <p className="mt-0.5 font-semibold">{t.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="outline">{t0('tests.questions', { n: t.questions_total ?? 0 })}</Badge>
                    <Badge variant="outline">{t0('tests.pass', { n: t.pass_score })}</Badge>
                    {t.time_limit_minutes && <Badge variant="outline"><Clock className="h-3 w-3" />{t0('test.minutes', { n: t.time_limit_minutes })}</Badge>}
                    {left != null && <Badge variant={left > 0 ? 'outline' : 'red'}>{t0('tests.attemptsLeft', { n: left })}</Badge>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {t.best_percent != null ? <Badge variant={passed ? 'green' : 'amber'}>{t0('tests.best', { n: Math.round(t.best_percent) })}</Badge>
                      : t.pending_review ? <Badge variant="amber">{t0('home.underReview')}</Badge> : <span className="text-xs text-muted">{t0('tests.notTaken')}</span>}
                    <Button size="sm" asChild disabled={left === 0}><Link to={`/tests/${t.id}${t.course_id ? `?course=${t.course_id}` : ''}`}>{t.best_percent != null ? t0('tests.again') : t0('tests.start')}</Link></Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
    </div>
  )
}
