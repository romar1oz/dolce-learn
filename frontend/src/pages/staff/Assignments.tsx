import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClipboardList, Plus, Search, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth, isStaff } from '@/stores/auth'
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, ErrorBlock, Field, Input, PageHeader, Progress, Select, Skeleton, Table, Td, Th } from '@/components/ui'
import { StatusBadge } from '@/features/learning'
import { cn, fmtDate } from '@/lib/utils'
import type { Assignment, CourseSummary, Department, Page, User } from '@/types'

function AssignDialog({ open, onOpenChange, initialCourse, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; initialCourse?: string; onDone: () => void }) {
  const courses = useQuery({ queryKey: ['courses-published'], queryFn: () => api.get<Page<CourseSummary>>('/api/courses', { status: 'published', page_size: 200 }), enabled: open })
  const users = useQuery({ queryKey: ['users', 'learners'], queryFn: () => api.get<Page<User>>('/api/users', { page_size: 500, is_active: true }), enabled: open })
  const deps = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/api/departments'), enabled: open })
  const [course, setCourse] = useState(initialCourse || '')
  const [due, setDue] = useState('')
  const [selUsers, setSelUsers] = useState<Set<number>>(new Set())
  const [selDeps, setSelDeps] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setCourse(initialCourse || ''); setSelUsers(new Set()); setSelDeps(new Set()); setDue('') } }, [open, initialCourse])
  const learners = (users.data?.items || []).filter((u) => ['employee', 'manager'].includes(u.role) && (!filter || u.full_name.toLowerCase().includes(filter.toLowerCase())))
  const toggle = (set: Set<number>, id: number, fn: (s: Set<number>) => void) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); fn(n) }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title="Назначение курса" description="Выберите курс и сотрудников или подразделения целиком">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Field label="Курс"><Select value={course} onChange={(e) => setCourse(e.target.value)} data-testid="assign-course">
              <option value="">— выберите опубликованный курс —</option>{courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select></Field>
            <Field label="Срок" hint="Пусто — по настройке курса"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">Подразделения</p>
            <div className="flex flex-wrap gap-2">
              {deps.data?.map((d) => (
                <button key={d.id} onClick={() => toggle(selDeps, d.id, setSelDeps)}
                        className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', selDeps.has(d.id) ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-white')}>
                  {d.name} ({d.employee_count})
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2"><p className="text-sm font-medium">Сотрудники ({selUsers.size})</p>
              <Input className="h-8 max-w-56" placeholder="Поиск" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
            <div className="max-h-64 divide-y divide-line/60 overflow-y-auto rounded-xl border border-line">
              {learners.map((u) => (
                <label key={u.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={selUsers.has(u.id)} onChange={() => toggle(selUsers, u.id, setSelUsers)} data-testid="assign-user" />
                  <span className="flex-1">{u.full_name}<span className="block text-xs text-muted">{u.position} · {u.department_name}</span></span>
                </label>
              ))}
            </div>
          </div>
          <Button className="w-full" loading={busy} disabled={!course || (!selUsers.size && !selDeps.size)} data-testid="assign-submit" onClick={async () => {
            setBusy(true)
            try {
              const r = await api.post<{ created: number; skipped: number }>('/api/assignments', { course_id: Number(course), user_ids: [...selUsers], department_ids: [...selDeps], due_date: due || null })
              toast.success(`Назначено: ${r.created}${r.skipped ? `, уже было назначено: ${r.skipped}` : ''}`)
              onDone()
              onOpenChange(false)
            } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
          }}>Назначить</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function Assignments() {
  const me = useAuth((s) => s.user)!
  const staff = isStaff(me)
  const qc = useQueryClient()
  const [sp] = useSearchParams()
  const [open, setOpen] = useState(!!sp.get('course') && staff)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [course, setCourse] = useState('')
  const list = useQuery({ queryKey: ['assignments', q, status, course], queryFn: () => api.get<Page<Assignment>>('/api/assignments', { q, status, course_id: course, page_size: 1000 }) })
  const courses = useQuery({ queryKey: ['staff-courses-all'], queryFn: () => api.get<Page<CourseSummary>>('/api/courses', { page_size: 200 }) })
  const counts = useMemo(() => {
    const items = list.data?.items || []
    return { total: items.length, done: items.filter((a) => a.status === 'completed').length, overdue: items.filter((a) => a.is_overdue).length }
  }, [list.data])
  return (
    <div>
      <PageHeader title="Назначения" subtitle={`Всего ${counts.total} · завершено ${counts.done} · просрочено ${counts.overdue}`}
                  actions={staff && <Button onClick={() => setOpen(true)} data-testid="new-assignment"><Plus />Назначить курс</Button>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Сотрудник или курс" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="sm:w-64" value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">Все курсы</option>{courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
        <Select className="sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option><option value="assigned">Не начат</option><option value="in_progress">В процессе</option>
          <option value="completed">Завершён</option><option value="overdue">Просрочен</option>
        </Select>
      </div>
      {list.error ? <ErrorBlock error={list.error} /> : list.isLoading ? <Skeleton className="h-80" />
        : !list.data?.items.length ? <EmptyState icon={ClipboardList} title="Назначений нет" />
        : (
          <Card>
            <Table>
              <thead><tr><Th>Сотрудник</Th><Th>Курс</Th><Th>Статус</Th><Th className="hidden md:table-cell">Прогресс</Th><Th className="hidden lg:table-cell">Результат</Th><Th className="hidden md:table-cell">Срок</Th><Th /></tr></thead>
              <tbody>
                {list.data.items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td><Link to={`/admin/employees/${a.user_id}`} className="font-medium hover:underline">{a.user_name}</Link><span className="block text-xs text-muted">{a.department_name}</span></Td>
                    <Td className="max-w-64"><span className="line-clamp-2">{a.course_title}</span>{a.is_mandatory && <Badge variant="outline" className="mt-0.5">обяз.</Badge>}</Td>
                    <Td><StatusBadge status={a.status} overdue={a.is_overdue} /></Td>
                    <Td className="hidden min-w-28 md:table-cell"><div className="flex items-center gap-2"><Progress value={a.progress_percent} className="h-1.5" /><span className="text-xs">{Math.round(a.progress_percent)}%</span></div></Td>
                    <Td className="hidden lg:table-cell">{a.best_score != null ? `${a.best_score}%` : '—'}</Td>
                    <Td className="hidden whitespace-nowrap md:table-cell">{fmtDate(a.due_date)}</Td>
                    <Td className="text-right">{staff && a.status !== 'completed' && (
                      <Button size="icon-sm" variant="ghost" aria-label="Отменить назначение" onClick={async () => {
                        if (!confirm(`Отменить назначение «${a.course_title}» для ${a.user_name}?`)) return
                        try { await api.del(`/api/assignments/${a.id}`); qc.invalidateQueries({ queryKey: ['assignments'] }) } catch (e: any) { toast.error(e.message) }
                      }}><Trash2 className="text-red-500" /></Button>
                    )}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      {staff && <AssignDialog open={open} onOpenChange={setOpen} initialCourse={sp.get('course') || undefined}
                              onDone={() => qc.invalidateQueries({ queryKey: ['assignments'] })} />}
    </div>
  )
}
