import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClipboardCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Skeleton, Textarea } from '@/components/ui'
import { fmtDateTime } from '@/lib/utils'
import type { AttemptResult, Page } from '@/types'

function ReviewCard({ id, onDone }: { id: string; onDone: () => void }) {
  const q = useQuery({ queryKey: ['attempt', id], queryFn: () => api.get<AttemptResult>(`/api/attempts/${id}`) })
  const [pts, setPts] = useState<Record<number, string>>({})
  const [cmt, setCmt] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  if (!q.data) return <Skeleton className="h-32" />
  const open = q.data.answers.filter((a) => a.needs_review)
  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      {open.map((a) => (
        <div key={a.question_id} className="rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-medium">{a.question_text}</p>
          <p className="mt-2 rounded-lg bg-white p-2.5 text-sm">{a.text_answer}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr]">
            <Input type="number" min={0} max={a.points} step={0.5} placeholder={`0–${a.points} балл.`} value={pts[a.question_id] ?? ''} onChange={(e) => setPts({ ...pts, [a.question_id]: e.target.value })} />
            <Textarea rows={1} className="min-h-10" placeholder="Комментарий сотруднику" value={cmt[a.question_id] ?? ''} onChange={(e) => setCmt({ ...cmt, [a.question_id]: e.target.value })} />
          </div>
        </div>
      ))}
      <Button loading={busy} disabled={open.some((a) => pts[a.question_id] === undefined || pts[a.question_id] === '')} onClick={async () => {
        setBusy(true)
        try {
          const r = await api.post<AttemptResult>(`/api/attempts/${id}/review`, { items: open.map((a) => ({ question_id: a.question_id, points: Number(pts[a.question_id]), comment: cmt[a.question_id] || null })) })
          toast.success(`Проверено: ${Math.round(r.percent)}% — ${r.passed ? 'сдал' : 'не сдал'}`)
          onDone()
        } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
      }}>Сохранить оценку</Button>
    </div>
  )
}

export default function ReviewPage() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['review-queue'], queryFn: () => api.get<Page<AttemptResult>>('/api/attempts', { status: 'needs_review', page_size: 200 }) })
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Проверка открытых ответов" subtitle="Попытки, ожидающие ручной оценки методистом" />
      {list.isLoading ? <Skeleton className="h-40" /> : !list.data?.items.length ? <EmptyState icon={ClipboardCheck} title="Нет ответов на проверку" text="Все открытые ответы проверены." /> : list.data.items.map((a) => (
        <Card key={a.id} className="mb-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1"><p className="font-semibold">{a.user_name}</p><p className="text-sm text-muted">{a.test_title} · {fmtDateTime(a.submitted_at)}{a.source === 'offline' ? ' · офлайн' : ''}</p></div>
            <Badge variant="amber">Предварительно {Math.round(a.percent)}%</Badge>
            <Button size="sm" variant="secondary" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Свернуть' : 'Проверить'}</Button>
          </div>
          {open === a.id && <ReviewCard id={a.id} onDone={() => { setOpen(null); qc.invalidateQueries({ queryKey: ['review-queue'] }) }} />}
        </Card>
      ))}
    </div>
  )
}
