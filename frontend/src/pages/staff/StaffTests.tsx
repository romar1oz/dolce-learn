import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ListChecks, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Badge, Button, Card, Dialog, DialogContent, EmptyState, ErrorBlock, Field, Input, PageHeader, Select, Skeleton, Table, Td, Th } from '@/components/ui'
import { COURSE_STATUS, fmtDate } from '@/lib/utils'
import type { CourseSummary, Page } from '@/types'

export default function StaffTests() {
  const navigate = useNavigate()
  const tests = useQuery({ queryKey: ['staff-tests'], queryFn: () => api.get<any[]>('/api/tests') })
  const courses = useQuery({ queryKey: ['staff-courses-all'], queryFn: () => api.get<Page<CourseSummary>>('/api/courses', { page_size: 200 }) })
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [courseId, setCourseId] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <PageHeader title="Конструктор тестов" subtitle="Тесты с одиночным и множественным выбором, открытыми ответами и последовательностями"
                  actions={<Button onClick={() => setOpen(true)} data-testid="new-test"><Plus />Новый тест</Button>} />
      {tests.error ? <ErrorBlock error={tests.error} /> : tests.isLoading ? <Skeleton className="h-60" />
        : !tests.data?.length ? <EmptyState icon={ListChecks} title="Тестов пока нет" />
        : (
          <Card>
            <Table>
              <thead><tr><Th>Тест</Th><Th className="hidden md:table-cell">Курс</Th><Th>Вопросов</Th><Th className="hidden sm:table-cell">Попыток</Th><Th>Статус</Th></tr></thead>
              <tbody>
                {tests.data.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/tests/${t.id}`)}>
                    <Td><Link to={`/admin/tests/${t.id}`} className="font-medium">{t.title}</Link>
                      <span className="block text-xs text-muted">проходной {t.pass_score}% · обновлён {fmtDate(t.updated_at)}</span></Td>
                    <Td className="hidden text-muted md:table-cell">{t.course_title || '—'}</Td>
                    <Td>{t.questions_total}</Td>
                    <Td className="hidden sm:table-cell">{t.attempts_count}{t.needs_review_count ? <Badge variant="amber" className="ml-2">проверить: {t.needs_review_count}</Badge> : null}</Td>
                    <Td><Badge variant={t.status === 'published' ? 'green' : t.status === 'draft' ? 'amber' : 'default'}>{COURSE_STATUS[t.status]}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Новый тест">
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault()
            if (title.trim().length < 2) return toast.error('Введите название')
            setBusy(true)
            try {
              const t = await api.post<any>('/api/tests', { title, course_id: courseId ? Number(courseId) : null })
              navigate(`/admin/tests/${t.id}`)
            } catch (er: any) { toast.error(er.message) } finally { setBusy(false) }
          }}>
            <Field label="Название"><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus data-testid="test-title" /></Field>
            <Field label="Связанный курс">
              <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">— без курса —</option>
                {courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
            <Button type="submit" className="w-full" loading={busy}>Создать и перейти к вопросам</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
