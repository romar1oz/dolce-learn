import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Award, FileCheck2, FileText, Plus, Search } from 'lucide-react'
import { api, openAuthorizedPdf } from '@/lib/api'
import { useAuth, isStaff } from '@/stores/auth'
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, Field, Input, PageHeader, Select, Skeleton, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Textarea, Th } from '@/components/ui'
import { fmtDate } from '@/lib/utils'
import type { CourseSummary, Department, Page } from '@/types'

export default function Documents() {
  const me = useAuth((s) => s.user)!
  const staff = isStaff(me)
  const qc = useQueryClient()
  const certs = useQuery({ queryKey: ['certs-all'], queryFn: () => api.get<any[]>('/api/certificates') })
  const prots = useQuery({ queryKey: ['protocols'], queryFn: () => api.get<any[]>('/api/reports/protocols') })
  const courses = useQuery({ queryKey: ['staff-courses-all'], queryFn: () => api.get<Page<CourseSummary>>('/api/courses', { page_size: 200 }) })
  const deps = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/api/departments') })
  const [q, setQ] = useState('')
  const [p, setP] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const open = (path: string) => openAuthorizedPdf(path).catch((e) => toast.error(e.message))
  const list = (certs.data || []).filter((c) => !q || `${c.user_name} ${c.course_title} ${c.number}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <PageHeader title="Сертификаты и протоколы" subtitle="PDF-документы формируются на сервере"
                  actions={staff && <Button onClick={() => setP({ course_id: '', department_id: '', check_date: new Date().toISOString().slice(0, 10), commission: '', program_name: '' })} data-testid="new-protocol"><Plus />Протокол аттестации</Button>} />
      <Tabs defaultValue="certs">
        <TabsList><TabsTrigger value="certs">Сертификаты ({certs.data?.length ?? 0})</TabsTrigger><TabsTrigger value="protocols">Протоколы ({prots.data?.length ?? 0})</TabsTrigger></TabsList>
        <TabsContent value="certs" className="mt-4">
          <div className="relative mb-4 max-w-md"><Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" placeholder="Сотрудник, курс или номер" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {certs.isLoading ? <Skeleton className="h-48" /> : !list.length ? <EmptyState icon={Award} title="Сертификатов нет" /> : (
            <Card><Table>
              <thead><tr><Th>Номер</Th><Th>Сотрудник</Th><Th>Курс</Th><Th>Балл</Th><Th className="hidden md:table-cell">Дата</Th><Th /></tr></thead>
              <tbody>{list.map((c) => (
                <tr key={c.id}>
                  <Td className="font-mono text-xs">{c.number}</Td>
                  <Td><span className="font-medium">{c.user_name}</span><span className="block text-xs text-muted">{c.department_name}</span></Td>
                  <Td className="max-w-64"><span className="line-clamp-2">{c.course_title}</span></Td>
                  <Td>{c.score != null ? `${Math.round(c.score)}%` : '—'}</Td>
                  <Td className="hidden md:table-cell">{fmtDate(c.completed_at)}</Td>
                  <Td><Button size="sm" variant="outline" onClick={() => open(`/api/certificates/${c.id}/pdf`)}><FileText />PDF</Button></Td>
                </tr>
              ))}</tbody>
            </Table></Card>
          )}
        </TabsContent>
        <TabsContent value="protocols" className="mt-4">
          {prots.isLoading ? <Skeleton className="h-48" /> : !prots.data?.length ? <EmptyState icon={FileCheck2} title="Протоколов нет" /> : (
            <div className="grid gap-3 md:grid-cols-2">
              {prots.data.map((pr) => (
                <Card key={pr.id} className="p-4">
                  <p className="font-mono text-xs text-muted">№ {pr.number}</p>
                  <p className="mt-1 font-semibold">{pr.program_name}</p>
                  <p className="text-sm text-muted">Дата проверки: {fmtDate(pr.check_date)}{pr.department_name ? ` · ${pr.department_name}` : ''}</p>
                  <div className="mt-2 flex gap-1.5"><Badge variant="green">Аттестовано: {pr.passed}</Badge><Badge variant={pr.total - pr.passed ? 'red' : 'outline'}>Не аттестовано: {pr.total - pr.passed}</Badge></div>
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => open(`/api/reports/protocols/${pr.id}/pdf`)}><FileText />Открыть PDF</Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <Dialog open={!!p} onOpenChange={(v) => !v && setP(null)}>
        <DialogContent title="Новый протокол аттестации" description="В протокол попадут сотрудники с результатами по выбранному курсу">
          {p && <div className="space-y-3">
            <Field label="Курс / программа"><Select value={p.course_id} onChange={(e) => setP({ ...p, course_id: e.target.value })} data-testid="protocol-course">
              <option value="">—</option>{courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
            <Field label="Название программы" hint="По умолчанию — название курса"><Input value={p.program_name} onChange={(e) => setP({ ...p, program_name: e.target.value })} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Подразделение"><Select value={p.department_id} onChange={(e) => setP({ ...p, department_id: e.target.value })}>
                <option value="">Все</option>{deps.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
              <Field label="Дата проверки"><Input type="date" value={p.check_date} onChange={(e) => setP({ ...p, check_date: e.target.value })} /></Field>
            </div>
            <Field label="Комиссия"><Textarea rows={2} value={p.commission} onChange={(e) => setP({ ...p, commission: e.target.value })} /></Field>
            <Button className="w-full" loading={busy} disabled={!p.course_id} onClick={async () => {
              setBusy(true)
              try {
                const r = await api.post<any>('/api/reports/protocols', { course_id: Number(p.course_id), department_id: p.department_id ? Number(p.department_id) : null,
                  check_date: p.check_date, commission: p.commission || null, program_name: p.program_name || null })
                toast.success(`Протокол № ${r.number} сформирован`)
                setP(null)
                qc.invalidateQueries({ queryKey: ['protocols'] })
                open(`/api/reports/protocols/${r.id}/pdf`)
              } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
            }}>Сформировать</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}
