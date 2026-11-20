import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ExternalLink, FileText, FolderOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, Field, Input, PageHeader, Select, Skeleton, Table, Td, Textarea, Th } from '@/components/ui'
import { FileUploader } from '@/features/upload'
import { openMedia } from '@/offline/media'
import { cn, fmtBytes, fmtDate } from '@/lib/utils'
import type { Category, Department } from '@/types'

export default function StaffLibrary() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const items = useQuery({ queryKey: ['library-staff', q, cat], queryFn: () => api.get<{ items: any[] }>('/api/library', { q, category_id: cat, page_size: 500 }) })
  const cats = useQuery({ queryKey: ['categories', 'library'], queryFn: () => api.get<Category[]>('/api/categories', { kind: 'library' }) })
  const deps = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/api/departments') })
  const [edit, setEdit] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const payload = { title: edit.title, description: edit.description || null, category_id: edit.category_id ? Number(edit.category_id) : null,
                        media_id: edit.media?.id ?? null, url: edit.media ? null : edit.url || null, department_ids: edit.department_ids }
      if (edit.id) await api.patch(`/api/library/${edit.id}`, payload)
      else await api.post('/api/library', payload)
      toast.success('Сохранено')
      setEdit(null)
      qc.invalidateQueries({ queryKey: ['library-staff'] })
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="Библиотека материалов" subtitle="Документы, инструкции и шаблоны с доступом по подразделениям"
                  actions={<Button onClick={() => setEdit({ title: '', description: '', category_id: '', url: '', media: null, department_ids: [] })}><Plus />Добавить материал</Button>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="sm:w-60" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Все категории</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </div>
      {items.isLoading ? <Skeleton className="h-60" /> : !items.data?.items.length ? <EmptyState icon={FolderOpen} title="Материалов нет" /> : (
        <Card><Table>
          <thead><tr><Th>Материал</Th><Th className="hidden md:table-cell">Категория</Th><Th className="hidden md:table-cell">Доступ</Th><Th className="hidden lg:table-cell">Обновлён</Th><Th /></tr></thead>
          <tbody>{items.data.items.map((i) => (
            <tr key={i.id} className="hover:bg-slate-50">
              <Td><button className="text-left font-medium hover:underline" onClick={() => i.media ? openMedia(i.media.id, i.media.original_name).catch((e) => toast.error(e.message)) : window.open(i.url, '_blank', 'noopener')}>
                {i.media ? <FileText className="mr-1.5 inline h-4 w-4 text-brand-700" /> : <ExternalLink className="mr-1.5 inline h-4 w-4 text-sky-700" />}{i.title}</button>
                <span className="block text-xs text-muted">{i.media ? `${i.media.original_name} · ${fmtBytes(i.media.size_bytes)}` : i.url}</span></Td>
              <Td className="hidden md:table-cell">{i.category_name || '—'}</Td>
              <Td className="hidden md:table-cell">{i.department_names.length ? <span className="text-xs">{i.department_names.join(', ')}</span> : <Badge variant="green">Все</Badge>}</Td>
              <Td className="hidden text-xs lg:table-cell">{fmtDate(i.updated_at)}</Td>
              <Td className="whitespace-nowrap text-right">
                <Button size="icon-sm" variant="ghost" aria-label="Редактировать" onClick={() => setEdit({ ...i, category_id: i.category_id ? String(i.category_id) : '', url: i.url || '' })}><Pencil /></Button>
                <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={async () => { if (confirm(`Удалить «${i.title}»?`)) { await api.del(`/api/library/${i.id}`); qc.invalidateQueries({ queryKey: ['library-staff'] }) } }}><Trash2 className="text-red-500" /></Button>
              </Td>
            </tr>
          ))}</tbody>
        </Table></Card>
      )}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent wide title={edit?.id ? 'Редактирование материала' : 'Новый материал'}>
          {edit && <div className="space-y-3">
            <Field label="Название"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Описание"><Textarea rows={2} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Категория"><Select value={edit.category_id} onChange={(e) => setEdit({ ...edit, category_id: e.target.value })}><option value="">—</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Файл">{edit.media ? (
              <div className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm"><FileText className="h-4 w-4" /><span className="flex-1 truncate">{edit.media.original_name} · {fmtBytes(edit.media.size_bytes)}</span>
                <Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, media: null })}>Заменить</Button></div>
            ) : <FileUploader compact withMeta={false} onUploaded={(m) => setEdit((e: any) => ({ ...e, media: m, title: e.title || m.title }))} />}</Field>
            {!edit.media && <Field label="…или внешняя ссылка"><Input placeholder="https://" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} /></Field>}
            <Field label="Доступ подразделениям" hint="Ничего не выбрано — материал доступен всем">
              <div className="flex flex-wrap gap-2">{deps.data?.map((d) => {
                const on = edit.department_ids.includes(d.id)
                return <button key={d.id} type="button" onClick={() => setEdit({ ...edit, department_ids: on ? edit.department_ids.filter((x: number) => x !== d.id) : [...edit.department_ids, d.id] })}
                               className={cn('rounded-full border px-3 py-1 text-xs font-medium', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-line')}>{d.name}</button>
              })}</div>
            </Field>
            <Button className="w-full" onClick={save} loading={busy}>Сохранить</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
