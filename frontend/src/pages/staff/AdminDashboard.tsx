import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlarmClock, BookOpen, CheckCircle2, ClipboardList, Download, FileCheck2, GraduationCap, ListChecks, PlusCircle,
  Target, Timer, Upload, Users,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { useAuth, isStaff } from '@/stores/auth'
import { Button, Card, CardContent, CardHeader, CardTitle, ErrorBlock, PageHeader, Skeleton, StatCard } from '@/components/ui'
import { OfflineCopyNotice } from '@/features/learning'
import { axisProps, ChartTooltip, gridProps, SERIES, STATUS_COLORS } from '@/features/charts'
import { fmtRelative, fmtShort } from '@/lib/utils'

export interface Overview {
  employees: number; courses_total: number; courses_active: number; assignments: number; completed: number
  completion_rate: number; overdue: number; avg_score: number | null; pass_rate: number | null; attempts: number
  learning_hours: number
  time_series: { date: string; minutes: number }[]
  weekly_completions: { week: string; completed: number }[]
  status_distribution: { status: string; label: string; value: number }[]
  by_department: { department: string; assigned: number; completed: number; completion: number; overdue: number }[]
  recent_activity: { id: number; type: string; user_name: string; at: string; source: string; course_title?: string; payload?: any }[]
}

const EVENT_LABEL: Record<string, string> = {
  login: 'вошёл(ла) в систему', lesson_complete: 'завершил(а) урок', test_attempt: 'прошёл(ла) тест',
  course_download: 'скачал(а) курс для офлайн', sync: 'синхронизировал(а) данные', dialogue_run: 'прошёл(ла) тренажёр',
  course_start: 'начал(а) курс',
}

export function StatusBars({ data }: { data: Overview['status_distribution'] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {data.filter((d) => d.value).map((d) => (
          <div key={d.status} style={{ width: `${(100 * d.value) / total}%`, background: STATUS_COLORS[d.status] }} title={`${d.label}: ${d.value}`} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {data.map((d) => (
          <div key={d.status} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[d.status] }} />
            <span className="text-muted">{d.label}</span>
            <span className="ml-auto font-semibold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const user = useAuth((s) => s.user)!
  const staff = isStaff(user)
  const q = useOfflineQuery(['overview'], () => api.get<Overview>('/api/analytics/overview'))
  const d = q.data?.data
  if (q.error && !d) return <ErrorBlock error={q.error} retry={() => q.refetch()} />

  return (
    <div className="space-y-6">
      <PageHeader title={staff ? 'Кабинет методиста' : 'Обучение подразделения'}
                  subtitle={staff ? `Здравствуйте, ${user.full_name.split(' ')[1] || user.full_name}. Сводка по обучению персонала.` : user.department_name || ''}
                  actions={staff ? (
                    <>
                      <Button asChild variant="outline"><Link to="/admin/assignments"><ClipboardList />Назначить</Link></Button>
                      <Button asChild><Link to="/admin/courses/new"><PlusCircle />Создать курс</Link></Button>
                    </>
                  ) : <Button asChild variant="outline"><Link to="/admin/analytics"><Download />Отчёт</Link></Button>} />
      <OfflineCopyNotice show={!!q.data?.cachedAt} cachedAt={q.data?.cachedAt} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!d ? [1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-24" />) : (<>
          <StatCard icon={Users} label="Сотрудников" value={d.employees} />
          <StatCard icon={GraduationCap} label="Всего курсов" value={d.courses_total} hint={`активных: ${d.courses_active}`} tone="blue" />
          <StatCard icon={ClipboardList} label="Назначено курсов" value={d.assignments} tone="slate" />
          <StatCard icon={CheckCircle2} label="Завершение обучения" value={`${d.completion_rate}%`} hint={`${d.completed} из ${d.assignments}`} />
          <StatCard icon={AlarmClock} label="Просроченные аттестации" value={d.overdue} tone={d.overdue ? 'red' : 'slate'} />
          <StatCard icon={Target} label="Средний результат тестов" value={d.avg_score != null ? `${d.avg_score}%` : '—'} hint={d.pass_rate != null ? `сдают ${d.pass_rate}%` : undefined} tone="amber" />
          <StatCard icon={ListChecks} label="Попыток тестирования" value={d.attempts} tone="blue" />
          <StatCard icon={Timer} label="Часов обучения" value={d.learning_hours} tone="slate" />
        </>)}
      </div>

      {staff && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Быстрые действия</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { to: '/admin/courses/new', icon: PlusCircle, label: 'Новый курс' },
              { to: '/admin/library', icon: Upload, label: 'Загрузить материал' },
              { to: '/admin/tests', icon: ListChecks, label: 'Создать тест' },
              { to: '/admin/assignments', icon: ClipboardList, label: 'Назначить курс' },
              { to: '/admin/analytics', icon: Download, label: 'Экспорт отчёта' },
              { to: '/admin/documents', icon: FileCheck2, label: 'Протокол' },
            ].map((a) => (
              <Link key={a.to + a.label} to={a.to} className="flex flex-col items-center gap-2 rounded-2xl border border-line p-3 text-center text-xs font-medium transition hover:border-brand-200 hover:bg-brand-50">
                <a.icon className="h-5 w-5 text-brand-700" />{a.label}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader><div><CardTitle>Время обучения, минут в день</CardTitle><p className="text-xs text-muted">Последние 30 дней · учитывается только активное время</p></div></CardHeader>
          <CardContent className="h-64">
            {!d ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer>
                <AreaChart data={d.time_series} margin={{ left: -18, right: 8, top: 8 }}>
                  <defs><linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.25} /><stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={fmtShort} minTickGap={24} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip unit=" мин" labelFormatter={fmtShort} />} cursor={{ stroke: '#94A3B8', strokeDasharray: '3 3' }} />
                  <Area type="monotone" dataKey="minutes" name="Обучение" stroke={SERIES[0]} strokeWidth={2} fill="url(#g1)" activeDot={{ r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Статусы назначений</CardTitle></CardHeader>
          <CardContent>{!d ? <Skeleton className="h-24" /> : <StatusBars data={d.status_distribution} />}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Завершённые курсы по неделям</CardTitle></CardHeader>
          <CardContent className="h-56">
            {!d ? <Skeleton className="h-full" /> : (
              <ResponsiveContainer>
                <BarChart data={d.weekly_completions} margin={{ left: -18, right: 8, top: 8 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="week" {...axisProps} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip labelFormatter={(l) => `Неделя с ${l}`} />} cursor={{ fill: '#F1F5F9' }} />
                  <Bar dataKey="completed" name="Завершено" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Завершение по подразделениям</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!d ? <Skeleton className="h-40" /> : d.by_department.map((r) => (
              <div key={r.department}>
                <div className="mb-1 flex justify-between gap-2 text-sm"><span className="truncate">{r.department}</span>
                  <span className="shrink-0 font-semibold">{r.completion}% <span className="font-normal text-muted">({r.completed}/{r.assigned}{r.overdue ? `, просрочено ${r.overdue}` : ''})</span></span></div>
                <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${r.completion}%`, background: SERIES[0] }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Последняя активность</CardTitle><BookOpen className="h-4 w-4 text-muted" /></CardHeader>
        <CardContent>
          {!d ? <Skeleton className="h-32" /> : (
            <ul className="divide-y divide-line/70">
              {d.recent_activity.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0"><b className="font-semibold">{e.user_name}</b> {EVENT_LABEL[e.type] || e.type}
                    {e.course_title && <span className="text-muted"> · {e.course_title}</span>}
                    {e.type === 'test_attempt' && e.payload?.percent != null && <span className="text-muted"> · {Math.round(e.payload.percent)}%</span>}
                    {e.source === 'offline' && <span className="ml-1 rounded bg-sky-50 px-1 text-xs text-sky-700">офлайн</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{fmtRelative(e.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
