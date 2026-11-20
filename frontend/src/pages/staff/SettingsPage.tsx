import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/stores/auth'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Select, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th } from '@/components/ui'
import { fmtDateTime } from '@/lib/utils'
import type { Category } from '@/types'

export default function SettingsPage() {
  const me = useAuth((s) => s.user)!
  const admin = me.role === 'super_admin'
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Record<string, any>>('/api/settings') })
  const cats = useQuery({ queryKey: ['categories', 'all'], queryFn: () => api.get<Category[]>('/api/categories') })
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api.get<any[]>('/api/audit', { limit: 200 }), enabled: admin })
  const [s, setS] = useState<Record<string, any>>({})
  const [cat, setCat] = useState({ name: '', kind: 'course' })
  useEffect(() => { if (settings.data) setS(settings.data) }, [settings.data])

  return (
    <div>
      <PageHeader title="Настройки" subtitle="Параметры платформы, категории и журнал действий" />
      <Tabs defaultValue="platform">
        <TabsList><TabsTrigger value="platform">Платформа</TabsTrigger><TabsTrigger value="categories">Категории</TabsTrigger>{admin && <TabsTrigger value="audit">Журнал аудита</TabsTrigger>}</TabsList>
        <TabsContent value="platform" className="mt-4">
          <Card className="max-w-2xl"><CardHeader><CardTitle>Параметры</CardTitle>{!admin && <Badge>только просмотр</Badge>}</CardHeader>
            <CardContent className="space-y-3">
              <Field label="Название компании"><Input disabled={!admin} value={s.company_name || ''} onChange={(e) => setS({ ...s, company_name: e.target.value })} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Проходной балл по умолчанию, %"><Input disabled={!admin} type="number" value={s.default_pass_score ?? ''} onChange={(e) => setS({ ...s, default_pass_score: Number(e.target.value) })} /></Field>
                <Field label="Срок действия сертификата, мес."><Input disabled={!admin} type="number" value={s.certificate_validity_months ?? ''} onChange={(e) => setS({ ...s, certificate_validity_months: Number(e.target.value) })} /></Field>
                <Field label="Офлайн-сессия, дней" hint="Сколько дней можно работать без сети"><Input disabled={!admin} type="number" value={s.offline_session_days ?? ''} onChange={(e) => setS({ ...s, offline_session_days: Number(e.target.value) })} /></Field>
                <Field label="Контакт поддержки"><Input disabled={!admin} value={s.support_contact || ''} onChange={(e) => setS({ ...s, support_contact: e.target.value })} /></Field>
              </div>
              {admin && <Button onClick={async () => {
                try { const { max_video_mb: _m, ...rest } = s; await api.put('/api/settings', rest); toast.success('Настройки сохранены'); qc.invalidateQueries({ queryKey: ['settings'] }) }
                catch (e: any) { toast.error(e.message) }
              }}>Сохранить</Button>}
              <p className="text-xs text-muted">Лимиты размера файлов, CORS, сроки токенов и секреты задаются переменными окружения сервера (.env).</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <Card className="max-w-2xl"><CardContent className="space-y-3 pt-5">
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => {
              e.preventDefault()
              try { await api.post('/api/categories', cat); setCat({ ...cat, name: '' }); qc.invalidateQueries({ queryKey: ['categories'] }) } catch (er: any) { toast.error(er.message) }
            }}>
              <Input placeholder="Название категории" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
              <Select className="sm:w-44" value={cat.kind} onChange={(e) => setCat({ ...cat, kind: e.target.value })}><option value="course">Курсы</option><option value="library">Библиотека</option></Select>
              <Button type="submit"><Plus />Добавить</Button>
            </form>
            <div className="divide-y divide-line/70">
              {cats.data?.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-2">
                  <Input className="h-8 flex-1" defaultValue={c.name} onBlur={async (e) => {
                    if (e.target.value !== c.name) { try { await api.patch(`/api/categories/${c.id}`, { name: e.target.value, kind: c.kind }); toast.success('Переименовано') } catch (er: any) { toast.error(er.message) } }
                  }} />
                  <Badge variant={c.kind === 'course' ? 'green' : 'blue'}>{c.kind === 'course' ? 'курсы' : 'библиотека'}</Badge>
                  <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={async () => { if (confirm('Удалить категорию?')) { await api.del(`/api/categories/${c.id}`); qc.invalidateQueries({ queryKey: ['categories'] }) } }}><Trash2 className="text-red-500" /></Button>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
        {admin && <TabsContent value="audit" className="mt-4">
          <Card><Table>
            <thead><tr><Th>Время</Th><Th>Пользователь</Th><Th>Действие</Th><Th className="hidden md:table-cell">Объект</Th><Th className="hidden lg:table-cell">IP</Th></tr></thead>
            <tbody>{audit.data?.map((a) => (
              <tr key={a.id}><Td className="whitespace-nowrap text-xs">{fmtDateTime(a.created_at)}</Td><Td>{a.user_name || '—'}</Td>
                <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{a.action}</code></Td>
                <Td className="hidden text-xs text-muted md:table-cell">{a.entity_type} {a.entity_id}</Td><Td className="hidden text-xs lg:table-cell">{a.ip}</Td></tr>
            ))}</tbody>
          </Table></Card>
        </TabsContent>}
      </Tabs>
    </div>
  )
}
