import { Link } from 'react-router-dom'
import { Clock, ListChecks } from 'lucide-react'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { Badge, Button, Card, EmptyState, ErrorBlock, PageHeader, Skeleton } from '@/components/ui'
import { OfflineCopyNotice } from '@/features/learning'
import type { LearnerTest } from '@/types'

export default function TestsPage() {
  const q = useOfflineQuery(['tests-learner'], () => api.get<LearnerTest[]>('/api/tests'))
  const list = q.data?.data || []
  return (
    <div>
      <PageHeader title="Тесты" subtitle="Проверка знаний по доступным курсам" />
      <OfflineCopyNotice show={!!q.data?.cachedAt} cachedAt={q.data?.cachedAt} />
      {q.error && !q.data ? <ErrorBlock error={q.error} /> : q.isLoading ? <Skeleton className="h-48" />
        : list.length === 0 ? <EmptyState icon={ListChecks} title="Доступных тестов нет" />
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
                    <Badge variant="outline">{t.questions_total} вопр.</Badge>
                    <Badge variant="outline">проходной {t.pass_score}%</Badge>
                    {t.time_limit_minutes && <Badge variant="outline"><Clock className="h-3 w-3" />{t.time_limit_minutes} мин</Badge>}
                    {left != null && <Badge variant={left > 0 ? 'outline' : 'red'}>осталось попыток: {left}</Badge>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {t.best_percent != null ? <Badge variant={passed ? 'green' : 'amber'}>Лучший: {Math.round(t.best_percent)}%</Badge>
                      : t.pending_review ? <Badge variant="amber">На проверке</Badge> : <span className="text-xs text-muted">Не пройден</span>}
                    <Button size="sm" asChild disabled={left === 0}><Link to={`/tests/${t.id}${t.course_id ? `?course=${t.course_id}` : ''}`}>{t.best_percent != null ? 'Пройти снова' : 'Начать'}</Link></Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
    </div>
  )
}
