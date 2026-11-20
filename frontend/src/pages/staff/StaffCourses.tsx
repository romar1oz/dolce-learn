import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap, PlusCircle, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge, Button, EmptyState, ErrorBlock, Input, PageHeader, Select, Skeleton } from '@/components/ui'
import { CoverImage } from '@/features/learning'
import { COURSE_STATUS, fmtDate, fmtMinutes } from '@/lib/utils'
import type { Category, CourseSummary, Page } from '@/types'

export default function StaffCourses() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [cat, setCat] = useState('')
  const courses = useQuery({ queryKey: ['staff-courses', q, status, cat],
    queryFn: () => api.get<Page<CourseSummary>>('/api/courses', { q, status, category_id: cat, page_size: 200 }) })
  const cats = useQuery({ queryKey: ['categories', 'course'], queryFn: () => api.get<Category[]>('/api/categories', { kind: 'course' }) })
  return (
    <div>
      <PageHeader title="Курсы" subtitle="Создание, редактирование и публикация курсов"
                  actions={<Button asChild><Link to="/admin/courses/new"><PlusCircle />Создать курс</Link></Button>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option><option value="draft">Черновики</option><option value="published">Опубликованные</option><option value="archived">Архив</option>
        </Select>
        <Select className="sm:w-56" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Все категории</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {courses.error ? <ErrorBlock error={courses.error} /> : courses.isLoading ? <Skeleton className="h-60" />
        : !courses.data?.items.length ? <EmptyState icon={GraduationCap} title="Курсов не найдено" action={<Button asChild><Link to="/admin/courses/new">Создать первый курс</Link></Button>} />
        : (
          <div className="space-y-3">
            {courses.data.items.map((c) => (
              <Link key={c.id} to={`/admin/courses/${c.id}`} className="card flex flex-col gap-4 p-3 transition hover:shadow-[var(--shadow-lift)] sm:flex-row sm:items-center">
                <CoverImage mediaId={c.cover_media_id} className="aspect-video w-full shrink-0 rounded-xl sm:w-40" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={c.status === 'published' ? 'green' : c.status === 'draft' ? 'amber' : 'default'}>{COURSE_STATUS[c.status]}</Badge>
                    {c.is_mandatory && <Badge variant="dark">Обязательный</Badge>}
                    {c.category_name && <Badge variant="outline">{c.category_name}</Badge>}
                  </div>
                  <p className="mt-1.5 font-semibold">{c.title}</p>
                  <p className="text-xs text-muted">{c.module_count} мод. · {c.lesson_count} ур. · {fmtMinutes(c.duration_minutes)} · обновлён {fmtDate(c.updated_at)} · v{c.version}</p>
                </div>
                <div className="flex shrink-0 gap-6 px-2 text-center text-sm">
                  <div><p className="text-lg font-bold">{c.assigned_count}</p><p className="text-xs text-muted">назначено</p></div>
                  <div><p className="text-lg font-bold text-brand-700">{c.completed_count}</p><p className="text-xs text-muted">завершили</p></div>
                </div>
              </Link>
            ))}
          </div>
        )}
    </div>
  )
}
