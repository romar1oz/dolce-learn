import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/stores/auth'
import { Button, Card, Dialog, DialogContent, EmptyState, Field, Input, PageHeader, Select, Skeleton, Textarea } from '@/components/ui'
import type { Department, Page, User } from '@/types'

export default function Departments() {
  const me = useAuth((s) => s.user)!
  const qc = useQueryClient()
  const deps = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/api/departments') })
  const managers = useQuery({ queryKey: ['users', 'managers'], queryFn: () => api.get<Page<User>>('/api/users', { role: 'manager', page_size: 200 }) })
  const [edit, setEdit] = useState<Partial<Department> | null>(null)
  const save = async () => {
    try {
      const payload = { name: edit!.name, code: edit!.code, description: edit!.description || null, manager_id: edit!.manager_id || null }
      if (edit!.id) await api.patch(`/api/departments/${edit!.id}`, payload)
      else await api.post('/api/departments', payload)
      toast.success('Сохранено')
      setEdit(null)
      qc.invalidateQueries({ queryKey: ['departments'] })
    } catch (e: any) { toast.error(e.message) }
  }
  return (
    <div>
      <PageHeader title="Подразделения" subtitle="Структура предприятия и руководители" actions={<Button onClick={() => setEdit({})}><Plus />Подразделение</Button>} />
      {deps.isLoading ? <Skeleton className="h-60" /> : !deps.data?.length ? <EmptyState icon={Building2} title="Нет подразделений" /> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {deps.data.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-xl bg-brand-50 p-2.5 text-brand-800"><Building2 className="h-5 w-5" /></div>
                <div className="flex">
                  <Button size="icon-sm" variant="ghost" onClick={() => setEdit(d)} aria-label="Редактировать"><Pencil /></Button>
                  {me.role === 'super_admin' && <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={async () => {
                    if (!confirm(`Удалить подразделение «${d.name}»?`)) return
                    try { await api.del(`/api/departments/${d.id}`); qc.invalidateQueries({ queryKey: ['departments'] }) } catch (e: any) { toast.error(e.message) }
                  }}><Trash2 className="text-red-500" /></Button>}
                </div>
              </div>
              <p className="mt-3 font-semibold">{d.name}</p>
              <p className="text-xs text-muted">Код: {d.code}</p>
              {d.description && <p className="mt-1 text-sm text-muted">{d.description}</p>}
              <div className="mt-3 flex justify-between text-sm"><span className="text-muted">Сотрудников</span><b>{d.employee_count}</b></div>
              <div className="flex justify-between text-sm"><span className="text-muted">Руководитель</span><span className="truncate pl-2">{d.manager_name || '—'}</span></div>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent title={edit?.id ? 'Редактирование подразделения' : 'Новое подразделение'}>
          {edit && (
            <div className="space-y-3">
              <Field label="Название"><Input value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="Код"><Input value={edit.code || ''} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
              <Field label="Описание"><Textarea rows={2} value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
              <Field label="Руководитель">
                <Select value={edit.manager_id || ''} onChange={(e) => setEdit({ ...edit, manager_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">—</option>{managers.data?.items.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </Select>
              </Field>
              <Button className="w-full" onClick={save}>Сохранить</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
