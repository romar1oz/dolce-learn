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

export default function OfflinePage() {
  const uid = useAuth((s) => s.user!.id)
  const courses = useLiveQuery(() => db.courses.where({ userId: uid }).toArray(), [uid]) ?? []
  const [est, setEst] = useState({ usage: 0, quota: 0 })
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    storageEstimate().then(setEst)
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [courses.length])

  return (
    <div>
      <PageHeader title="Офлайн-доступ" subtitle="Курсы, скачанные на это устройство" />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 font-semibold"><HardDrive className="h-5 w-5 text-brand-600" />Хранилище устройства</div>
          <p className="mt-3 text-sm text-muted">Использовано {fmtBytes(est.usage)} из доступных ~{fmtBytes(est.quota)}</p>
          <Progress value={est.quota ? (100 * est.usage) / est.quota : 0} className="mt-2" />
          <div className="mt-3 flex items-center gap-2 text-sm">
            {persisted ? <Badge variant="green">Постоянное хранение разрешено</Badge>
              : <><Badge variant="amber">Браузер может очистить данные при нехватке места</Badge>
                <Button size="sm" variant="ghost" onClick={async () => setPersisted(await requestPersistence())}>Запросить</Button></>}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 font-semibold"><Smartphone className="h-5 w-5 text-brand-600" />Как учиться без интернета</div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Откройте курс и нажмите «Скачать для офлайн-доступа».</li>
            <li>Дождитесь окончания скачивания всех материалов.</li>
            <li>Без сети откройте приложение — курс, видео, PDF и тесты будут доступны.</li>
            <li>Когда появится интернет, прогресс и ответы отправятся автоматически.</li>
          </ol>
        </Card>
      </div>
      {courses.length === 0 ? (
        <EmptyState icon={CloudDownload} title="Нет скачанных курсов" text="Скачайте курс со страницы курса, чтобы учиться без интернета."
                    action={<Button asChild variant="secondary"><Link to="/courses">Мои курсы</Link></Button>} />
      ) : (
        <div className="space-y-3">
          {courses.map((c) => (
            <Card key={c.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link to={`/courses/${c.courseId}`} className="font-semibold hover:underline">{c.title}</Link>
                <p className="text-xs text-muted">{fmtBytes(c.totalBytes)} · {c.pkg.media.length} файлов · скачан {fmtDateTime(new Date(c.downloadedAt))}</p>
                {c.error && <p className="mt-1 text-xs text-red-600">{c.error}</p>}
              </div>
              <Badge variant={c.status === 'ready' ? 'green' : c.status === 'downloading' ? 'blue' : 'amber'}>
                {c.status === 'ready' ? 'Готов офлайн' : c.status === 'downloading' ? 'Скачивается' : c.status === 'partial' ? 'Требует обновления' : 'Ошибка'}
              </Badge>
              <Button size="sm" variant="ghost" onClick={async () => { await removeCourse(uid, c.courseId); toast.success('Удалено с устройства') }}>
                <Trash2 />Удалить
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
