import { useState } from 'react'
import { Search, LayoutGrid } from 'lucide-react'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { EmptyState, ErrorBlock, Input, PageHeader, Select, Skeleton } from '@/components/ui'
import { CourseCard, OfflineCopyNotice } from '@/features/learning'
import type { Category, CourseSummary, Page } from '@/types'

export default function Catalog() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const courses = useOfflineQuery(['catalog'], () => api.get<Page<CourseSummary>>('/api/courses', { page_size: 200 }))
  const cats = useOfflineQuery(['categories', 'course'], () => api.get<Category[]>('/api/categories', { kind: 'course' }))
  const items = (courses.data?.data.items || []).filter((c) =>
    c.status === 'published' && (!cat || String(c.category_id) === cat)
    && (!q || (c.title + ' ' + (c.description || '')).toLowerCase().includes(q.toLowerCase())))
  return (
    <div>
      <PageHeader title="Каталог курсов" subtitle="Все доступные вам курсы. Начните любой курс — прогресс сохранится." />
      <OfflineCopyNotice show={!!courses.data?.cachedAt} cachedAt={courses.data?.cachedAt} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Поиск курса" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="sm:w-60" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Все категории</option>
          {(cats.data?.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {courses.error && !courses.data ? <ErrorBlock error={courses.error} />
        : courses.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>
        : items.length === 0 ? <EmptyState icon={LayoutGrid} title="Ничего не найдено" />
        : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((c) => <CourseCard key={c.id} c={c} />)}</div>}
    </div>
  )
}
