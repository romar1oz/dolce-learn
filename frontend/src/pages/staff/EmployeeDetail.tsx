import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Award, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge, Card, CardContent, CardHeader, CardTitle, ErrorBlock, LoadingBlock, PageHeader, Progress, StatCard, Table, Td, Th } from '@/components/ui'
import { StatusBadge } from '@/features/learning'
import { axisProps, ChartTooltip, gridProps, SERIES } from '@/features/charts'
import { fmtDate, fmtDateTime, fmtMinutes, fmtShort } from '@/lib/utils'

export default function EmployeeDetail() {
  const { id } = useParams()
  const q = useQuery({ queryKey: ['user-analytics', id], queryFn: () => api.get<any>(`/api/analytics/users/${id}`) })
  if (q.isLoading) return <LoadingBlock />
  if (q.error) return <ErrorBlock error={q.error} />
  const d = q.data
  const done = d.courses.filter((c: any) => c.status === 'completed').length
  return (
    <div className="space-y-6">
      <PageHeader back={<Link to="/admin/employees" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Сотрудники</Link>}
                  title={d.user.full_name} subtitle={`${d.user.position || ''} · ${d.user.department_name || ''} · последний вход ${fmtDateTime(d.user.last_login_at)}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Clock} label="Время на платформе" value={fmtMinutes(d.platform_time_min)} />
        <StatCard icon={Award} label="Завершено курсов" value={`${done} / ${d.courses.length}`} tone="blue" />
        <StatCard icon={Award} label="Попыток тестов" value={d.attempts.length} tone="amber" />
        <StatCard icon={Award} label="Просрочено" value={d.courses.filter((c: any) => c.status === 'overdue').length} tone="red" />
      </div>
      <Card>
        <CardHeader><CardTitle>Активное время обучения за 30 дней, мин</CardTitle></CardHeader>
        <CardContent className="h-52">
          <ResponsiveContainer>
            <BarChart data={d.daily} margin={{ left: -18, right: 8 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="date" {...axisProps} tickFormatter={fmtShort} />
              <YAxis {...axisProps} />
              <Tooltip content={<ChartTooltip unit=" мин" labelFormatter={fmtShort} />} cursor={{ fill: '#F1F5F9' }} />
              <Bar dataKey="minutes" name="Обучение" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Курсы</CardTitle></CardHeader>
        <Table>
          <thead><tr><Th>Курс</Th><Th>Статус</Th><Th>Прогресс</Th><Th>Результат</Th><Th className="hidden md:table-cell">Время</Th><Th className="hidden md:table-cell">Срок</Th></tr></thead>
          <tbody>{d.courses.map((c: any) => (
            <tr key={c.assignment_id}>
              <Td className="font-medium">{c.course_title}{c.is_mandatory && <Badge variant="outline" className="ml-2">обяз.</Badge>}</Td>
              <Td><StatusBadge status={c.status === 'overdue' ? 'assigned' : c.status} overdue={c.status === 'overdue'} /></Td>
              <Td className="min-w-28"><div className="flex items-center gap-2"><Progress value={c.progress_percent} className="h-1.5" /><span className="text-xs">{Math.round(c.progress_percent)}%</span></div></Td>
              <Td>{c.best_score != null ? `${c.best_score}% · ${c.result}` : c.result}{c.has_offline && <Badge variant="blue" className="ml-1">офлайн</Badge>}</Td>
              <Td className="hidden md:table-cell">{fmtMinutes(c.time_spent_min)}</Td>
              <Td className="hidden md:table-cell">{fmtDate(c.due_date)}</Td>
            </tr>
          ))}</tbody>
        </Table>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Время по урокам</CardTitle></CardHeader>
          <Table>
            <thead><tr><Th>Урок</Th><Th>Время</Th><Th>Видео</Th><Th>Статус</Th></tr></thead>
            <tbody>{d.lessons.slice(0, 30).map((l: any) => (
              <tr key={l.lesson_id}><Td><span className="font-medium">{l.lesson_title}</span><span className="block text-xs text-muted">{l.course_title}</span></Td>
                <Td>{fmtMinutes(l.time_spent_min)}</Td><Td>{fmtMinutes(l.media_time_min)}</Td>
                <Td>{l.status === 'completed' ? <Badge variant="green">завершён</Badge> : <Badge>в процессе</Badge>}</Td></tr>
            ))}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader><CardTitle>Попытки тестирования</CardTitle></CardHeader>
          <Table>
            <thead><tr><Th>Тест</Th><Th>Дата</Th><Th>Результат</Th></tr></thead>
            <tbody>{d.attempts.map((a: any) => (
              <tr key={a.id}><Td><span className="font-medium">{a.test_title}</span><span className="block text-xs text-muted">№{a.attempt_number}{a.source === 'offline' ? ' · офлайн' : ''}</span></Td>
                <Td className="text-xs">{fmtDateTime(a.submitted_at)}</Td>
                <Td>{a.status === 'rejected' ? <Badge variant="red">{a.rejection_reason}</Badge> : a.status === 'needs_review' ? <Badge variant="amber">на проверке</Badge>
                  : <Badge variant={a.passed ? 'green' : 'red'}>{Math.round(a.percent)}%</Badge>}</Td></tr>
            ))}</tbody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
