import { useState } from 'react'
import { CheckCircle2, CloudDownload, ExternalLink, FileSpreadsheet, FileText, FolderOpen, Image, Presentation, Search, Video } from 'lucide-react'
import { toast } from 'sonner'
import { useLiveQuery } from 'dexie-react-hooks'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { Badge, Button, Card, EmptyState, ErrorBlock, Input, PageHeader, Select, Skeleton } from '@/components/ui'
import { OfflineCopyNotice } from '@/features/learning'
import { openMedia } from '@/offline/media'
import { saveSingleMedia } from '@/offline/downloader'
import { db } from '@/offline/db'
import { fmtBytes, fmtDate } from '@/lib/utils'
import type { Category } from '@/types'

const ICONS: Record<string, any> = { pdf: FileText, word: FileText, excel: FileSpreadsheet, powerpoint: Presentation, video: Video, image: Image }

export default function LibraryPage() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const items = useOfflineQuery(['library'], () => api.get<{ items: any[] }>('/api/library', { page_size: 500 }))
  const cats = useOfflineQuery(['categories', 'library'], () => api.get<Category[]>('/api/categories', { kind: 'library' }))
  const saved = useLiveQuery(async () => new Set((await db.media.toArray()).map((m) => m.id)), []) ?? new Set<string>()
  const list = (items.data?.data.items || []).filter((i) => (!cat || String(i.category_id) === cat)
    && (!q || `${i.title} ${i.description || ''}`.toLowerCase().includes(q.toLowerCase())))

  return (
    <div>
      <PageHeader title="Библиотека" subtitle="Инструкции, СОП, нормативные документы и шаблоны" />
      <OfflineCopyNotice show={!!items.data?.cachedAt} cachedAt={items.data?.cachedAt} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Поиск по названию и описанию" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="sm:w-60" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Все категории</option>
          {(cats.data?.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {items.error && !items.data ? <ErrorBlock error={items.error} />
        : items.isLoading ? <Skeleton className="h-60" />
        : list.length === 0 ? <EmptyState icon={FolderOpen} title="Материалы не найдены" />
        : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.map((i) => {
              const Icon = i.media ? ICONS[i.media.kind] || FileText : ExternalLink
              const isSaved = i.media && saved.has(i.media.id)
              return (
                <Card key={i.id} className="flex gap-3 p-4">
                  <div className="h-fit rounded-xl bg-brand-50 p-3 text-brand-800"><Icon className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{i.title}</p>
                    {i.description && <p className="mt-0.5 text-sm text-muted">{i.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {i.category_name && <Badge variant="green">{i.category_name}</Badge>}
                      {i.media && <span>{i.media.original_name} · {fmtBytes(i.media.size_bytes)}</span>}
                      <span>· {fmtDate(i.updated_at)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {i.media ? (
                        <>
                          <Button size="sm" onClick={() => {
                            void api.post(`/api/library/${i.id}/opened`).catch(() => {})
                            openMedia(i.media.id, i.media.original_name).catch((e) => toast.error(e.message))
                          }}>Открыть</Button>
                          {isSaved ? <Badge variant="green" className="py-1"><CheckCircle2 className="h-3 w-3" />На устройстве</Badge>
                            : <Button size="sm" variant="outline" disabled={!navigator.onLine} onClick={async () => {
                              try { await saveSingleMedia(i.media, `library:${i.id}`); toast.success('Сохранено для офлайн-доступа') }
                              catch (e: any) { toast.error(e.message) }
                            }}><CloudDownload />Сохранить офлайн</Button>}
                        </>
                      ) : (
                        <Button size="sm" variant="outline" asChild><a href={i.url} target="_blank" rel="noopener noreferrer"><ExternalLink />Перейти</a></Button>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
    </div>
  )
}
