import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { Button, EmptyState, ErrorBlock, PageHeader, Skeleton, Tabs, TabsList, TabsTrigger } from '@/components/ui'
import { CourseCard, OfflineCopyNotice } from '@/features/learning'
import type { Assignment, CourseSummary } from '@/types'
import { useT } from '@/i18n'

type Item = CourseSummary & { assignment: Assignment }

export default function MyCourses() {
  const q = useOfflineQuery(['my-courses'], () => api.get<Item[]>('/api/progress/my'))
  const [tab, setTab] = useState('all')
  const t = useT()
  const items = q.data?.data || []
  const filtered = items.filter((c) => tab === 'all' ? true
    : tab === 'overdue' ? c.assignment.is_overdue : c.assignment.status === tab)
  return (
    <div>
      <PageHeader title={t('nav.myCourses')} subtitle={t('courses.subtitle')} />
      <OfflineCopyNotice show={!!q.data?.cachedAt} cachedAt={q.data?.cachedAt} />
      <Tabs value={tab} onValueChange={setTab} className="mb-5">
        <TabsList>
          <TabsTrigger value="all">{t('courses.tabAll', { n: items.length })}</TabsTrigger>
          <TabsTrigger value="in_progress">{t('courses.tabInProgress')}</TabsTrigger>
          <TabsTrigger value="assigned">{t('courses.tabAssigned')}</TabsTrigger>
          <TabsTrigger value="completed">{t('courses.tabCompleted')}</TabsTrigger>
          <TabsTrigger value="overdue">{t('courses.tabOverdue')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {q.error && !q.data ? <ErrorBlock error={q.error} retry={() => q.refetch()} />
        : q.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div>
        : filtered.length === 0 ? <EmptyState icon={BookOpen} title={t('courses.empty')} text={t('courses.emptyText')}
                                              action={<Button asChild variant="secondary"><Link to="/catalog">{t('courses.openCatalog')}</Link></Button>} />
        : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((c) => <CourseCard key={c.id} c={c} />)}</div>}
    </div>
  )
}
