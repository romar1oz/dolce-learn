import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CloudDownload, HardDrive, Smartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/stores/auth'
import { db } from '@/offline/db'
import { removeCourse, requestPersistence, storageEstimate } from '@/offline/downloader'
import { Badge, Button, Card, EmptyState, PageHeader, Progress } from '@/components/ui'
import { fmtBytes, fmtDateTime } from '@/lib/utils'
import { useT } from '@/i18n'

export default function OfflinePage() {
  const uid = useAuth((s) => s.user!.id)
  const t = useT()
  const courses = useLiveQuery(() => db.courses.where({ userId: uid }).toArray(), [uid]) ?? []
  const [est, setEst] = useState({ usage: 0, quota: 0 })
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    storageEstimate().then(setEst)
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [courses.length])

  return (
    <div>
      <PageHeader title={t('nav.offline')} subtitle={t('off.subtitle')} />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 font-semibold"><HardDrive className="h-5 w-5 text-brand-600" />{t('off.storage')}</div>
          <p className="mt-3 text-sm text-muted">{t('off.used', { used: fmtBytes(est.usage), quota: fmtBytes(est.quota) })}</p>
          <Progress value={est.quota ? (100 * est.usage) / est.quota : 0} className="mt-2" />
          <div className="mt-3 flex items-center gap-2 text-sm">
            {persisted ? <Badge variant="green">{t('off.persisted')}</Badge>
              : <><Badge variant="amber">{t('off.mayClear')}</Badge>
                <Button size="sm" variant="ghost" onClick={async () => setPersisted(await requestPersistence())}>{t('off.request')}</Button></>}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 font-semibold"><Smartphone className="h-5 w-5 text-brand-600" />{t('off.howTo')}</div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>{t('off.step1')}</li>
            <li>{t('off.step2')}</li>
            <li>{t('off.step3')}</li>
            <li>{t('off.step4')}</li>
          </ol>
        </Card>
      </div>
      {courses.length === 0 ? (
        <EmptyState icon={CloudDownload} title={t('off.empty')} text={t('off.emptyText')}
                    action={<Button asChild variant="secondary"><Link to="/courses">{t('nav.myCourses')}</Link></Button>} />
      ) : (
        <div className="space-y-3">
          {courses.map((c) => (
            <Card key={c.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link to={`/courses/${c.courseId}`} className="font-semibold hover:underline">{c.title}</Link>
                <p className="text-xs text-muted">{t('off.meta', { size: fmtBytes(c.totalBytes), files: c.pkg.media.length, date: fmtDateTime(new Date(c.downloadedAt)) })}</p>
                {c.error && <p className="mt-1 text-xs text-red-600">{c.error}</p>}
              </div>
              <Badge variant={c.status === 'ready' ? 'green' : c.status === 'downloading' ? 'blue' : 'amber'}>
                {c.status === 'ready' ? t('off.ready') : c.status === 'downloading' ? t('off.downloading') : c.status === 'partial' ? t('off.partial') : t('off.error')}
              </Badge>
              <Button size="sm" variant="ghost" onClick={async () => { await removeCourse(uid, c.courseId); toast.success(t('off.removed')) }}>
                <Trash2 />{t('common.delete')}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
