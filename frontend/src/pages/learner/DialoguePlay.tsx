import { useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { useOfflineQuery } from '@/hooks/useOffline'
import { ErrorBlock, LoadingBlock, PageHeader } from '@/components/ui'
import { DialogueRunner } from '@/features/dialogue'
import type { DialoguePackage } from '@/types'

export default function DialoguePlay() {
  const { id } = useParams()
  const q = useOfflineQuery(['dialogue', id], () => api.get<DialoguePackage>(`/api/dialogues/${id}/play`))
  if (q.isLoading) return <LoadingBlock />
  if (!q.data) return <ErrorBlock error={q.error} />
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Диалоговый тренажёр" />
      <DialogueRunner scenario={q.data.data} />
    </div>
  )
}
