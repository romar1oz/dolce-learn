import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Hourglass, Trophy } from 'lucide-react'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { useAuth } from '@/stores/auth'
import { db } from '@/offline/db'
import { Badge, Card, EmptyState, ErrorBlock, PageHeader, Skeleton, Table, Td, Th } from '@/components/ui'
import { OfflineCopyNotice } from '@/features/learning'
import { fmtDateTime, fmtDuration } from '@/lib/utils'
import type { AttemptResult, Page } from '@/types'
import { useT } from '@/i18n'

export default function ResultsPage() {
  const uid = useAuth((s) => s.user!.id)
  const t = useT()
  const q = useOfflineQuery(['my-attempts'], () => api.get<Page<AttemptResult>>('/api/attempts', { page_size: 200 }))
  const pending = useLiveQuery(() => db.attempts.where({ status: 'pending' }).filter((a) => a.userId === uid).toArray(), [uid]) ?? []
  const items = q.data?.data.items || []
  const passed = items.filter((i) => i.passed).length
  const graded = items.filter((i) => i.status === 'graded')
  const avg = graded.length ? Math.round(graded.reduce((s, i) => s + i.percent, 0) / graded.length) : null
  return (
    <div>
      <PageHeader title={t('nav.results')} subtitle={t('res.subtitle')} />
      <OfflineCopyNotice show={!!q.data?.cachedAt} cachedAt={q.data?.cachedAt} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="p-4"><p className="text-xs text-muted">{t('res.attempts')}</p><p className="text-2xl font-bold">{items.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">{t('res.passed')}</p><p className="text-2xl font-bold text-brand-700">{passed}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted">{t('res.avg')}</p><p className="text-2xl font-bold">{avg != null ? `${avg}%` : '—'}</p></Card>
      </div>
      {pending.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/60 p-4">
          <p className="flex items-center gap-2 font-semibold text-amber-800"><Hourglass className="h-4 w-4" />{t('res.pendingSync', { n: pending.length })}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {pending.map((p) => <li key={p.id}><Link className="underline" to={`/attempts/${p.id}`}>{p.testTitle}</Link> · {fmtDateTime(new Date(p.createdAt))}</li>)}
          </ul>
        </Card>
      )}
      {q.error && !q.data ? <ErrorBlock error={q.error} /> : q.isLoading ? <Skeleton className="h-48" />
        : items.length === 0 ? <EmptyState icon={Trophy} title={t('res.empty')} />
        : (
          <Card>
            <Table>
              <thead><tr><Th>{t('res.colTest')}</Th><Th>{t('res.colDate')}</Th><Th>{t('res.colResult')}</Th><Th className="hidden sm:table-cell">{t('res.colTime')}</Th><Th>{t('res.colStatus')}</Th></tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td><Link to={`/attempts/${a.id}`} className="font-medium hover:underline">{a.test_title}</Link>
                      <span className="block text-xs text-muted">{t('res.attemptN', { n: a.attempt_number })}{a.source === 'offline' ? t('res.offline') : ''}</span></Td>
                    <Td className="whitespace-nowrap text-muted">{fmtDateTime(a.submitted_at)}</Td>
                    <Td className="font-semibold">{a.status === 'rejected' ? '—' : `${Math.round(a.percent)}%`}</Td>
                    <Td className="hidden text-muted sm:table-cell">{fmtDuration(a.duration_sec)}</Td>
                    <Td>{a.status === 'rejected' ? <Badge variant="red">{t('res.notCounted')}</Badge> : a.status === 'needs_review' ? <Badge variant="amber">{t('home.underReview')}</Badge>
                      : <Badge variant={a.passed ? 'green' : 'red'}>{a.passed ? t('att.pass') : t('att.fail')}</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
    </div>
  )
}
