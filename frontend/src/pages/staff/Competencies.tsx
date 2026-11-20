import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts'
import { toast } from 'sonner'
import { BarChart3, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth, isStaff } from '@/stores/auth'
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, Field, Input, PageHeader, Select, Skeleton, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Textarea, Th } from '@/components/ui'
import { ChartTooltip, SERIES } from '@/features/charts'
import { fmtDate } from '@/lib/utils'
import type { Page, User } from '@/types'

function Results({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['comp-results', id], queryFn: () => api.get<any>(`/api/competencies/assessments/${id}/results`) })
  if (q.isLoading) return <Skeleton className="h-60" />
  if (!q.data) return null
  const d = q.data
  const data = d.table.map((r: any) => ({ name: r.competency, ...Object.fromEntries(d.relations.map((rel: any) => [rel.label, r.by_relation[rel.code] ?? 0])) }))
  return (
    <div className="space-y-4">
      <div className="h-80">
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke="#E2E8F0" />
            <PolarAngleAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} />
            <PolarRadiusAxis domain={[d.assessment.scale_min, d.assessment.scale_max]} tick={{ fill: '#94A3B8', fontSize: 10 }} />
            {d.relations.map((rel: any, i: number) => (
              <Radar key={rel.code} name={rel.label} dataKey={rel.label} stroke={SERIES[i % 4]} fill={SERIES[i % 4]} fillOpacity={0.08} strokeWidth={2} dot={{ r: 3 }} />
            ))}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <Table>
        <thead><tr><Th>Компетенция</Th>{d.relations.map((r: any) => <Th key={r.code}>{r.label}</Th>)}<Th>Итог (без самооценки)</Th></tr></thead>
        <tbody>{d.table.map((r: any) => (
          <tr key={r.competency_id}><Td className="font-medium">{r.competency}</Td>
            {d.relations.map((rel: any) => <Td key={rel.code}>{r.by_relation[rel.code] ?? '—'}</Td>)}
            <Td className="font-semibold">{r.overall ?? '—'}</Td></tr>
        ))}</tbody>
      </Table>
      {d.comments.length > 0 && <div className="space-y-1 text-sm">{d.comments.map((c: any, i: number) => <p key={i}><b>{c.relation}:</b> {c.comment}</p>)}</div>}
    </div>
  )
}

export default function Competencies() {
  const me = useAuth((s) => s.user)!
  const staff = isStaff(me)
  const qc = useQueryClient()
  const comps = useQuery({ queryKey: ['competencies'], queryFn: () => api.get<any[]>('/api/competencies') })
  const assess = useQuery({ queryKey: ['assessments'], queryFn: () => api.get<any[]>('/api/competencies/assessments') })
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => api.get<Page<User>>('/api/users', { page_size: 500 }), enabled: staff })
  const [comp, setComp] = useState<any | null>(null)
  const [newA, setNewA] = useState<any | null>(null)
  const [view, setView] = useState<number | null>(null)

  const saveComp = async () => {
    try {
      const payload = { name: comp.name, description: comp.description || null, group_name: comp.group_name || null,
                        questions: comp.questionsText.split('\n').map((s: string) => s.trim()).filter(Boolean) }
      if (comp.id) await api.put(`/api/competencies/${comp.id}`, payload)
      else await api.post('/api/competencies', payload)
      setComp(null); qc.invalidateQueries({ queryKey: ['competencies'] }); toast.success('Сохранено')
    } catch (e: any) { toast.error(e.message) }
  }
  const createA = async () => {
    try {
      await api.post('/api/competencies/assessments', {
        title: newA.title, description: newA.description || null, subject_user_id: Number(newA.subject), assessment_type: newA.type,
        scale_min: Number(newA.min), scale_max: Number(newA.max), due_date: newA.due || null, competency_ids: [...newA.comps],
        reviewers: [{ user_id: Number(newA.subject), relation: 'self' }, ...(newA.manager ? [{ user_id: Number(newA.manager), relation: 'manager' }] : []),
                    ...[...newA.peers].map((id: number) => ({ user_id: id, relation: 'peer' }))],
        scale_labels: { [newA.min]: 'Не проявляет', [newA.max]: 'Образец для других' },
      })
      setNewA(null); qc.invalidateQueries({ queryKey: ['assessments'] }); toast.success('Оценка назначена')
    } catch (e: any) { toast.error(e.message) }
  }
  const people = users.data?.items || []

  return (
    <div>
      <PageHeader title="Компетенции 180/360" subtitle="Самооценка, оценка руководителя и коллег"
                  actions={staff && <Button onClick={() => setNewA({ title: '', type: '360', min: 1, max: 5, comps: new Set(), peers: new Set(), subject: '', manager: '' })}><Plus />Назначить оценку</Button>} />
      <Tabs defaultValue="assessments">
        <TabsList><TabsTrigger value="assessments">Оценки</TabsTrigger>{staff && <TabsTrigger value="competencies">Модель компетенций</TabsTrigger>}</TabsList>
        <TabsContent value="assessments" className="mt-4 space-y-3">
          {assess.isLoading ? <Skeleton className="h-40" /> : !assess.data?.length ? <EmptyState icon={Target} title="Оценок пока нет" /> : assess.data.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-sm text-muted">{a.subject_name} · {a.subject_department} · шкала {a.scale_min}–{a.scale_max}{a.due_date ? ` · до ${fmtDate(a.due_date)}` : ''}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">{a.reviewers.map((r: any) => <Badge key={r.id} variant={r.submitted_at ? 'green' : 'outline'}>{r.relation_label}: {r.name.split(' ')[0]}</Badge>)}</div>
                </div>
                <Badge variant="blue">{a.assessment_type}°</Badge>
                <Badge variant={a.status === 'active' ? 'green' : 'default'}>{a.status === 'active' ? `Заполнено ${a.submitted}/${a.total_reviewers}` : 'Закрыта'}</Badge>
                <Button size="sm" variant="secondary" onClick={() => setView(view === a.id ? null : a.id)}><BarChart3 />Результаты</Button>
                {staff && <Button size="sm" variant="ghost" onClick={async () => { await api.patch(`/api/competencies/assessments/${a.id}?status=${a.status === 'active' ? 'closed' : 'active'}`); qc.invalidateQueries({ queryKey: ['assessments'] }) }}>{a.status === 'active' ? 'Закрыть' : 'Открыть'}</Button>}
              </div>
              {view === a.id && <div className="mt-4 border-t border-line pt-4"><Results id={a.id} /></div>}
            </Card>
          ))}
        </TabsContent>
        {staff && (
          <TabsContent value="competencies" className="mt-4">
            <div className="mb-3 flex justify-end"><Button variant="secondary" onClick={() => setComp({ name: '', group_name: '', description: '', questionsText: '' })}><Plus />Компетенция</Button></div>
            <div className="grid gap-3 md:grid-cols-2">
              {comps.data?.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-semibold">{c.name}</p>{c.group_name && <Badge variant="outline" className="mt-1">{c.group_name}</Badge>}</div>
                    <div className="flex">
                      <Button size="icon-sm" variant="ghost" onClick={() => setComp({ ...c, questionsText: c.questions.map((q: any) => q.text).join('\n') })} aria-label="Редактировать"><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={async () => { if (!confirm('Удалить компетенцию?')) return; try { await api.del(`/api/competencies/${c.id}`); qc.invalidateQueries({ queryKey: ['competencies'] }) } catch (e: any) { toast.error(e.message) } }}><Trash2 className="text-red-500" /></Button>
                    </div>
                  </div>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">{c.questions.map((q: any) => <li key={q.id}>{q.text}</li>)}</ul>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!comp} onOpenChange={(v) => !v && setComp(null)}>
        <DialogContent title={comp?.id ? 'Редактирование компетенции' : 'Новая компетенция'}>
          {comp && <div className="space-y-3">
            <Field label="Название"><Input value={comp.name} onChange={(e) => setComp({ ...comp, name: e.target.value })} /></Field>
            <Field label="Группа"><Input value={comp.group_name || ''} onChange={(e) => setComp({ ...comp, group_name: e.target.value })} placeholder="Профессиональные / Корпоративные" /></Field>
            <Field label="Индикаторы (вопросы), по одному в строке"><Textarea rows={5} value={comp.questionsText} onChange={(e) => setComp({ ...comp, questionsText: e.target.value })} /></Field>
            <Button className="w-full" onClick={saveComp}>Сохранить</Button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!newA} onOpenChange={(v) => !v && setNewA(null)}>
        <DialogContent wide title="Назначение оценки компетенций">
          {newA && <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название"><Input value={newA.title} onChange={(e) => setNewA({ ...newA, title: e.target.value })} /></Field>
              <Field label="Тип"><Select value={newA.type} onChange={(e) => setNewA({ ...newA, type: e.target.value })}><option value="360">360° — самооценка, руководитель, коллеги</option><option value="180">180° — самооценка и руководитель</option></Select></Field>
              <Field label="Оцениваемый сотрудник"><Select value={newA.subject} onChange={(e) => setNewA({ ...newA, subject: e.target.value })}><option value="">—</option>{people.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></Field>
              <Field label="Руководитель (оценивающий)"><Select value={newA.manager} onChange={(e) => setNewA({ ...newA, manager: e.target.value })}><option value="">—</option>{people.filter((u) => u.role !== 'employee').map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></Field>
              <Field label="Шкала от"><Input type="number" value={newA.min} onChange={(e) => setNewA({ ...newA, min: e.target.value })} /></Field>
              <Field label="Шкала до"><Input type="number" value={newA.max} onChange={(e) => setNewA({ ...newA, max: e.target.value })} /></Field>
              <Field label="Срок"><Input type="date" value={newA.due || ''} onChange={(e) => setNewA({ ...newA, due: e.target.value })} /></Field>
            </div>
            <Field label="Компетенции"><div className="flex flex-wrap gap-2">{comps.data?.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm"><input type="checkbox" className="accent-emerald-600" checked={newA.comps.has(c.id)}
                onChange={() => { const s = new Set(newA.comps); s.has(c.id) ? s.delete(c.id) : s.add(c.id); setNewA({ ...newA, comps: s }) }} />{c.name}</label>
            ))}</div></Field>
            {newA.type === '360' && <Field label="Коллеги"><div className="max-h-40 overflow-y-auto rounded-xl border border-line p-2">{people.filter((u) => String(u.id) !== newA.subject && u.role === 'employee').map((u) => (
              <label key={u.id} className="flex items-center gap-2 px-1 py-1 text-sm"><input type="checkbox" className="accent-emerald-600" checked={newA.peers.has(u.id)}
                onChange={() => { const s = new Set(newA.peers); s.has(u.id) ? s.delete(u.id) : s.add(u.id); setNewA({ ...newA, peers: s }) }} />{u.full_name} <span className="text-xs text-muted">{u.department_name}</span></label>
            ))}</div></Field>}
            <Button className="w-full" onClick={createA} disabled={!newA.title || !newA.subject || !newA.comps.size}>Назначить</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  )
}

