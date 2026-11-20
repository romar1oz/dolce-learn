import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CloudOff, Download, ExternalLink, FileSpreadsheet, FileText, Info, ListChecks, Presentation, File as FileIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Spinner } from '@/components/ui'
import { RichText } from '@/components/RichText'
import { PdfViewer } from '@/components/PdfViewer'
import { openMedia, useMediaUrl } from '@/offline/media'
import { enqueue } from '@/offline/sync'
import { saveLessonLocal } from '@/offline/progress'
import { fmtBytes } from '@/lib/utils'
import { DialogueRunner } from '@/features/dialogue'
import type { CoursePackage, Material } from '@/types'

export function VideoBlock({ m, courseId, lessonId, userId, playingRef, startAt }: {
  m: Material; courseId: number; lessonId: number; userId: number; playingRef: React.MutableRefObject<boolean>; startAt?: number
}) {
  const { url, local, error, loading } = useMediaUrl(m.media_id)
  const ref = useRef<HTMLVideoElement>(null)
  const lastSent = useRef(0)
  const resumed = useRef(false)

  const report = (ended = false) => {
    const v = ref.current
    if (!v) return
    const pos = Math.floor(v.currentTime)
    void saveLessonLocal(userId, lessonId, courseId, { videoPosition: pos })
    void enqueue('video_progress', { lesson_id: lessonId, media_id: m.media_id, position_sec: pos, duration_sec: Math.floor(v.duration || 0), ended })
    lastSent.current = Date.now()
  }

  useEffect(() => () => { playingRef.current = false }, [playingRef])

  if (loading) return <div className="flex aspect-video items-center justify-center rounded-2xl bg-slate-900"><Spinner className="text-white" /></div>
  if (error || !url) return (
    <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl bg-slate-900 p-6 text-center text-sm text-slate-200">
      <CloudOff className="h-8 w-8 text-amber-300" />{error || 'Видео недоступно'}
    </div>
  )
  return (
    <div>
      <video ref={ref} src={url} controls playsInline preload="metadata" className="aspect-video w-full rounded-2xl bg-black" data-testid="lesson-video"
             onLoadedMetadata={(e) => {
               if (!resumed.current && startAt && startAt > 3 && startAt < (e.currentTarget.duration || 0) - 3) e.currentTarget.currentTime = startAt
               resumed.current = true
             }}
             onPlay={() => { playingRef.current = true }}
             onPause={() => { playingRef.current = false; report() }}
             onEnded={() => { playingRef.current = false; report(true) }}
             onTimeUpdate={() => { if (Date.now() - lastSent.current > 15_000 && playingRef.current) report() }} />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {local ? <Badge variant="green">Воспроизводится с устройства</Badge> : <Badge variant="outline">Потоковое воспроизведение</Badge>}
        {m.media?.size_bytes ? <span>{fmtBytes(m.media.size_bytes)}</span> : null}
      </div>
    </div>
  )
}

function PdfBlock({ m }: { m: Material }) {
  const { url, error, loading } = useMediaUrl(m.media_id)
  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>
  if (error || !url) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>
  return (
    <div className="space-y-2">
      <PdfViewer url={url} />
      <Button size="sm" variant="outline" onClick={() => openMedia(m.media_id!, m.media?.original_name || 'document.pdf', true).catch((e) => toast.error(e.message))}>
        <Download />Скачать PDF
      </Button>
    </div>
  )
}

function ImageBlock({ m }: { m: Material }) {
  const { url, error } = useMediaUrl(m.media_id)
  if (error) return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>
  return url ? <img src={url} alt={m.title || ''} className="w-full rounded-2xl border border-line" /> : <Spinner />
}

const FILE_ICONS: Record<string, any> = { word: FileText, excel: FileSpreadsheet, powerpoint: Presentation, file: FileIcon }
const FILE_LABEL: Record<string, string> = { word: 'Документ Word', excel: 'Таблица Excel', powerpoint: 'Презентация PowerPoint', file: 'Файл' }

function FileBlock({ m }: { m: Material }) {
  const Icon = FILE_ICONS[m.kind] || FileIcon
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
      <div className="rounded-xl bg-brand-50 p-3 text-brand-800"><Icon className="h-6 w-6" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{m.title || m.media?.original_name}</p>
        <p className="text-xs text-muted">{FILE_LABEL[m.kind]} · {m.media?.original_name} · {fmtBytes(m.media?.size_bytes)}</p>
      </div>
      <Button size="sm" variant="secondary" loading={busy} onClick={async () => {
        setBusy(true)
        try { await openMedia(m.media_id!, m.media?.original_name || 'file', true) } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
      }}><Download />Открыть</Button>
    </div>
  )
}

function TestBlock({ m, pkg, courseId }: { m: Material; pkg: CoursePackage; courseId: number }) {
  const t = pkg.tests.find((x) => x.id === m.test_id)
  if (!t) return <p className="rounded-xl bg-slate-50 p-3 text-sm text-muted">Тест пока не опубликован.</p>
  const total = Math.min(t.question_count || t.questions.length, t.questions.length)
  const passed = t.best_percent != null && t.best_percent >= t.pass_score
  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-500 p-2.5 text-white"><ListChecks className="h-5 w-5" /></div>
        <div className="flex-1">
          <p className="font-semibold">{t.title}</p>
          <p className="mt-0.5 text-sm text-muted">
            {total} вопр. · проходной балл {t.pass_score}%{t.time_limit_minutes ? ` · ${t.time_limit_minutes} мин` : ''}
            {t.max_attempts ? ` · попыток: ${t.attempts_used}/${t.max_attempts}` : ''}
          </p>
          {t.best_percent != null && <Badge variant={passed ? 'green' : 'amber'} className="mt-2">Лучший результат: {Math.round(t.best_percent)}%</Badge>}
          {t.pending_review > 0 && <Badge variant="amber" className="mt-2 ml-1">На проверке у методиста</Badge>}
        </div>
      </div>
      <Button asChild className="mt-4 w-full sm:w-auto" data-testid="open-test">
        <Link to={`/tests/${t.id}?course=${courseId}`}>{passed ? 'Пройти ещё раз' : t.best_percent != null ? 'Пересдать тест' : 'Начать тест'}</Link>
      </Button>
    </div>
  )
}

export function MaterialView(props: {
  m: Material; pkg: CoursePackage; courseId: number; lessonId: number; userId: number
  playingRef: React.MutableRefObject<boolean>; videoStart?: number
}) {
  const { m, pkg, courseId } = props
  const title = m.title && !['text'].includes(m.kind) ? <h3 className="mb-2 font-semibold">{m.title}</h3> : null
  switch (m.kind) {
    case 'text':
      return <div>{m.title && <h3 className="mb-2 text-lg font-semibold">{m.title}</h3>}<RichText text={m.body} /></div>
    case 'instruction':
      return (
        <div className="rounded-2xl border-l-4 border-brand-500 bg-brand-50/70 p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold text-brand-900"><Info className="h-4 w-4" />{m.title || 'Инструкция'}</p>
          <RichText text={m.body} />
        </div>
      )
    case 'video':
      return <div>{title}<VideoBlock {...props} startAt={props.videoStart} /></div>
    case 'pdf':
      return <div>{title}<PdfBlock m={m} /></div>
    case 'image':
      return <div>{title}<ImageBlock m={m} /></div>
    case 'word': case 'excel': case 'powerpoint': case 'file':
      return <FileBlock m={m} />
    case 'link':
      return (
        <a href={m.url!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 hover:bg-slate-50">
          <div className="rounded-xl bg-sky-50 p-3 text-sky-700"><ExternalLink className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="font-medium">{m.title || m.url}</p><p className="truncate text-xs text-muted">{m.url} · внешний ресурс (нужен интернет)</p></div>
        </a>
      )
    case 'test':
      return <TestBlock m={m} pkg={pkg} courseId={courseId} />
    case 'dialogue': {
      const d = pkg.dialogues.find((x) => x.id === m.dialogue_id)
      return d ? <DialogueRunner scenario={d} /> : <p className="text-sm text-muted">Сценарий недоступен</p>
    }
    default:
      return null
  }
}
