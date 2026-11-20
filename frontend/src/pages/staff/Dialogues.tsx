import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MessagesSquare, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui'
import { COURSE_STATUS } from '@/lib/utils'

export default function Dialogues() {
  const q = useQuery({ queryKey: ['dialogues'], queryFn: () => api.get<any[]>('/api/dialogues') })
  return (
    <div>
      <PageHeader title="Диалоговый тренажёр" subtitle="Ветвящиеся сценарии для отработки ситуаций на производстве — без внешних AI-сервисов"
                  actions={<Button asChild><Link to="/admin/dialogues/new"><Plus />Новый сценарий</Link></Button>} />
      {q.isLoading ? <Skeleton className="h-40" /> : !q.data?.length ? <EmptyState icon={MessagesSquare} title="Сценариев нет" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{d.title}</p>
                <Badge variant={d.status === 'published' ? 'green' : 'amber'}>{COURSE_STATUS[d.status]}</Badge>
              </div>
              {d.description && <p className="mt-1 text-sm text-muted">{d.description}</p>}
              <p className="mt-2 text-xs text-muted">{d.nodes} реплик · {d.characters} персонажей · прохождений: {d.runs}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" asChild><Link to={`/admin/dialogues/${d.id}`}>Редактировать</Link></Button>
                <Button size="sm" variant="outline" asChild><Link to={`/dialogues/${d.id}`}>Пройти</Link></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
