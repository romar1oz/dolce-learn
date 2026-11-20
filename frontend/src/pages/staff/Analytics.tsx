import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { AlarmClock, CheckCircle2, FileDown, FileSpreadsheet, RotateCcw, Target, Timer } from 'lucide-react'
import { api, downloadAuthorized } from '@/lib/api'
import { useAuth, isStaff } from '@/stores/auth'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader, Progress, Select, Skeleton, StatCard, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th } from '@/components/ui'
import { StatusBadge } from '@/features/learning'
import { axisProps, ChartTooltip, gridProps, SERIES } from '@/features/charts'
import { StatusBars, type Overview } from './AdminDashboard'
import { fmtDate, fmtMinutes, fmtShort, fmtRelative } from '@/lib/utils'
import type { CourseSummary, Department, Page, User } from '@/types'

const EMPTY = { user_id: '', department_id: '', course_id: '', date_from: '', date_to: '', status: '', result: '', min_score: '' }

export default function Analytics() {
  const me = useAuth((s) => s.user)!
  const staff = isStaff(me)
  const [f, setF] = useState(EMPTY)
  const set = (k: keyof typeof EMPTY, v: string) => setF({ ...f, [k]: v })
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v))
  const overview = useQuery({ queryKey: ['overview', f.department_id, f.course_id, f.date_from, f.date_to],
    queryFn: () => api.get<Overview>('/api/analytics/overview', { department_id: f.department_id, course_id: f.course_id, date_from: f.date_from, date_to: f.date_to }) })
  const report = useQuery({ queryKey: ['report', params], queryFn: () => api.get<{ items: any[] }>('/api/analytics/report', params) })
  const byEmp = useQuery({ queryKey: ['emp-summary', f.department_id], queryFn: () => api.get<any[]>('/api/analytics/employees', { department_id: f.department_id }) })
  const byCourse = useQuery({ queryKey: ['course-summary', f.department_id], queryFn: () => api.get<any[]>('/api/analytics/courses', { department_id: f.department_id }) })
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => api.get<Page<User>>('/api/users', { page_size: 500 }) })
  const deps = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/api/departments') })
  const courses = useQuery({ queryKey: ['staff-courses-all'], queryFn: () => api.get<Page<CourseSummary>>('/api/courses', { page_size: 200 }) })
  const [exporting, setExporting] = useState<string | null>(null)
  const exp = async (format: 'xlsx' | 'csv') => {
    setExporting(format)
    try { await downloadAuthorized('/api/reports/export', `dolce_learn_report.${format}`, { ...params, format }) }
    catch (e: any) { toast.error(e.message) } finally { setExporting(null) }
  }
  const o = overview.data

  return (
    <div className="space-y-6">
      <PageHeader title="Аналитика" subtitle={staff ? 'Прогресс, время обучения и результаты аттестации' : `Подразделение: ${me.department_name}`}
                  actions={<>
                    <Button variant="outline" onClick={() => exp('csv')} loading={exporting === 'csv'} data-testid="export-csv"><FileDown />CSV</Button>
                    <Button onClick={() => exp('xlsx')} loading={exporting === 'xlsx'} data-testid="export-xlsx"><FileSpreadsheet />Excel</Button>
                  </>} />
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Сотрудник"><Select value={f.user_id} onChange={(e) => set('user_id', e.target.value)}>
            <option value="">Все</option>{users.data?.items.filter((u) => ['employee', 'manager'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</Select></Field>
          {staff && <Field label="Подразделение"><Select value={f.department_id} onChange={(e) => set('department_id', e.target.value)}>
            <option value="">Все</option>{deps.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>}
          <Field label="Курс"><Select value={f.course_id} onChange={(e) => set('course_id', e.target.value)}>
            <option value="">Все</option>{courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
          <Field label="Статус"><Select value={f.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Все</option><option value="assigned">Не начат</option><option value="in_progress">В процессе</option><option value="completed">Завершён</option><option value="overdue">Просрочен</option></Select></Field>
          <Field label="Период с"><Input type="date" value={f.date_from} onChange={(e) => set('date_from', e.target.value)} /></Field>
          <Field label="по"><Input type="date" value={f.date_to} onChange={(e) => set('date_to', e.target.value)} /></Field>
          <Field label="Результат"><Select value={f.result} onChange={(e) => set('result', e.target.value)}>
            <option value="">Любой</option><option value="passed">Сдал</option><option value="failed">Не сдал</option></Select></Field>
          <Field label="Балл от, %"><div className="flex gap-2"><Input type="number" min={0} max={100} value={f.min_score} onChange={(e) => set('min_score', e.target.value)} />
            <Button variant="ghost" size="icon" onClick={() => setF(EMPTY)} aria-label="Сбросить фильтры" title="Сбросить"><RotateCcw /></Button></div></Field>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!o ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />) : (<>
          <StatCard icon={CheckCircle2} label="Завершение" value={`${o.completion_rate}%`} hint={`${o.completed} из ${o.assignments}`} />
          <StatCard icon={Target} label="Средний балл" value={o.avg_score != null ? `${o.avg_score}%` : '—'} hint={o.pass_rate != null ? `сдают ${o.pass_rate}%` : ''} tone="amber" />
          <StatCard icon={AlarmClock} label="Просрочено" value={o.overdue} tone={o.overdue ? 'red' : 'slate'} />
          <StatCard icon={Timer} label="Часов обучения" value={o.learning_hours} tone="blue" />
        </>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader><CardTitle>Динамика: активное время обучения, мин/день</CardTitle></CardHeader>
          <CardContent className="h-56">{o && (
            <ResponsiveContainer>
              <AreaChart data={o.time_series} margin={{ left: -18, right: 8, top: 8 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={fmtShort} minTickGap={24} />
                <YAxis {...axisProps} />
                <Tooltip content={<ChartTooltip unit=" мин" labelFormatter={fmtShort} />} />
                <Area dataKey="minutes" name="Обучение" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>)}
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Статусы</CardTitle></CardHeader><CardContent>{o && <StatusBars data={o.status_distribution} />}</CardContent></Card>
      </div>

      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">Детальный отчёт ({report.data?.items.length ?? '…'})</TabsTrigger>
          <TabsTrigger value="employees">По сотрудникам</TabsTrigger>
          <TabsTrigger value="courses">По курсам</TabsTrigger>
        </TabsList>
        <TabsContent value="report" className="mt-4">
          <Card>{report.isLoading ? <Skeleton className="h-60" /> : (
            <Table>
              <thead><tr><Th>Сотрудник</Th><Th>Курс</Th><Th>Статус</Th><Th>Прогресс</Th><Th>Балл</Th><Th className="hidden md:table-cell">Аттестация</Th><Th className="hidden lg:table-cell">Время</Th><Th className="hidden lg:table-cell">Завершён</Th></tr></thead>
              <tbody>{report.data?.items.map((r) => (
                <tr key={r.assignment_id} className="hover:bg-slate-50">
                  <Td><Link className="font-medium hover:underline" to={`/admin/employees/${r.user_id}`}>{r.user_name}</Link><span className="block text-xs text-muted">{r.department_name}</span></Td>
                  <Td className="max-w-56"><span className="line-clamp-2">{r.course_title}</span></Td>
                  <Td><StatusBadge status={r.status === 'overdue' ? 'assigned' : r.status} overdue={r.status === 'overdue'} /></Td>
                  <Td className="min-w-24"><div className="flex items-center gap-2"><Progress value={r.progress_percent} className="h-1.5" /><span className="text-xs">{Math.round(r.progress_percent)}%</span></div></Td>
                  <Td>{r.best_score != null ? `${r.best_score}%` : '—'}</Td>
                  <Td className="hidden md:table-cell">{r.result === 'Сдал' ? <Badge variant="green">Аттестован</Badge> : r.result === 'Не сдал' ? <Badge variant="red">Не аттестован</Badge> : '—'}{r.has_offline && <Badge variant="blue" className="ml-1">офлайн</Badge>}</Td>
                  <Td className="hidden lg:table-cell">{fmtMinutes(r.time_spent_min)}</Td>
                  <Td className="hidden whitespace-nowrap lg:table-cell">{fmtDate(r.completed_at)}</Td>
                </tr>
              ))}</tbody>
            </Table>
          )}</Card>
        </TabsContent>
        <TabsContent value="employees" className="mt-4">
          <Card><Table>
            <thead><tr><Th>Сотрудник</Th><Th>Назначено</Th><Th>Завершено</Th><Th>Просрочено</Th><Th>Ср. балл</Th><Th className="hidden md:table-cell">Время на платформе</Th><Th className="hidden md:table-cell">Активность</Th></tr></thead>
            <tbody>{byEmp.data?.map((r) => (
              <tr key={r.user_id} className="hover:bg-slate-50">
                <Td><Link className="font-medium hover:underline" to={`/admin/employees/${r.user_id}`}>{r.user_name}</Link><span className="block text-xs text-muted">{r.department_name}</span></Td>
                <Td>{r.assigned}</Td><Td>{r.completed}</Td><Td>{r.overdue ? <Badge variant="red">{r.overdue}</Badge> : 0}</Td>
                <Td>{r.avg_score != null ? `${r.avg_score}%` : '—'}</Td>
                <Td className="hidden md:table-cell">{fmtMinutes(r.platform_time_min)}</Td>
                <Td className="hidden text-xs text-muted md:table-cell">{fmtRelative(r.last_activity)}</Td>
              </tr>
            ))}</tbody>
          </Table></Card>
        </TabsContent>
        <TabsContent value="courses" className="mt-4">
          <Card><Table>
            <thead><tr><Th>Курс</Th><Th>Назначено</Th><Th>Завершение</Th><Th>Просрочено</Th><Th>Ср. балл</Th><Th className="hidden md:table-cell">Ср. время</Th></tr></thead>
            <tbody>{byCourse.data?.map((r) => (
              <tr key={r.course_id}>
                <Td className="font-medium">{r.course_title}{r.is_mandatory && <Badge variant="outline" className="ml-2">обяз.</Badge>}</Td>
                <Td>{r.assigned}</Td>
                <Td className="min-w-32"><div className="flex items-center gap-2"><Progress value={r.completion} className="h-1.5" /><span className="text-xs">{r.completion}%</span></div></Td>
                <Td>{r.overdue}</Td><Td>{r.avg_score != null ? `${r.avg_score}%` : '—'}</Td>
                <Td className="hidden md:table-cell">{fmtMinutes(r.avg_time_min)}</Td>
              </tr>
            ))}</tbody>
          </Table></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
