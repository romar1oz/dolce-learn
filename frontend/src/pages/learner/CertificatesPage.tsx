import { Award, Download } from 'lucide-react'
import { toast } from 'sonner'
import { api, openAuthorizedPdf } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { Badge, Button, Card, EmptyState, ErrorBlock, PageHeader, Skeleton } from '@/components/ui'
import { OfflineCopyNotice } from '@/features/learning'
import { fmtDate } from '@/lib/utils'
import { useT } from '@/i18n'

export default function CertificatesPage() {
  const t = useT()
  const q = useOfflineQuery(['my-certs'], () => api.get<any[]>('/api/certificates'))
  const list = q.data?.data || []
  return (
    <div>
      <PageHeader title={t('nav.certificates')} subtitle={t('cert.subtitle')} />
      <OfflineCopyNotice show={!!q.data?.cachedAt} cachedAt={q.data?.cachedAt} />
      {q.error && !q.data ? <ErrorBlock error={q.error} /> : q.isLoading ? <Skeleton className="h-40" />
        : list.length === 0 ? <EmptyState icon={Award} title={t('cert.empty')} text={t('cert.emptyText')} />
        : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((c) => (
              <Card key={c.id} className="relative overflow-hidden p-5">
                <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-brand-100" />
                <Award className="relative h-8 w-8 text-brand-600" />
                <p className="relative mt-3 font-semibold leading-snug">{c.course_title}</p>
                <div className="relative mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="green">{c.score != null ? `${Math.round(c.score)}%` : t('cert.completed')}</Badge>
                  <Badge variant="outline">{fmtDate(c.completed_at)}</Badge>
                </div>
                <p className="relative mt-2 font-mono text-xs text-muted">№ {c.number}</p>
                <Button size="sm" variant="secondary" className="relative mt-4" disabled={!navigator.onLine}
                        onClick={() => openAuthorizedPdf(`/api/certificates/${c.id}/pdf`).catch((e) => toast.error(e.message))}>
                  <Download />PDF
                </Button>
              </Card>
            ))}
          </div>
        )}
    </div>
  )
}
