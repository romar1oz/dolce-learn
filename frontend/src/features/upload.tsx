/* Загрузка файлов: выбор, drag & drop, прогресс, определение длительности видео и превью-кадр. */
import { useRef, useState } from 'react'
import { CheckCircle2, UploadCloud, X } from 'lucide-react'
import { toast } from 'sonner'
import { uploadFile } from '@/lib/api'
import { Button, Field, Input, Progress, Textarea } from '@/components/ui'
import { cn, fmtBytes } from '@/lib/utils'
import type { MediaBrief } from '@/types'

const ACCEPT: Record<string, string> = {
  video: '.mp4,.m4v,.webm,.mov,video/mp4,video/webm,video/quicktime',
  pdf: '.pdf,application/pdf',
  word: '.doc,.docx',
  excel: '.xls,.xlsx',
  powerpoint: '.ppt,.pptx',
  image: '.png,.jpg,.jpeg,.webp,.gif',
  file: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.png,.jpg,.jpeg,.webp,.mp4,.webm,.mov',
}
const MAX_MB: Record<string, number> = { video: 1024 }

function probeVideo(file: File): Promise<{ duration: number | null; thumb: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.playsInline = true
    v.src = url
    const done = (r: { duration: number | null; thumb: Blob | null }) => { URL.revokeObjectURL(url); resolve(r) }
    const timeout = setTimeout(() => done({ duration: null, thumb: null }), 8000)
    v.onloadedmetadata = () => {
      const duration = isFinite(v.duration) ? v.duration : null
      v.currentTime = Math.min(1.5, (duration || 2) / 3)
      v.onseeked = () => {
        try {
          const c = document.createElement('canvas')
          c.width = Math.min(960, v.videoWidth || 960)
          c.height = Math.round(c.width * ((v.videoHeight || 540) / (v.videoWidth || 960)))
          c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
          c.toBlob((b) => { clearTimeout(timeout); done({ duration, thumb: b }) }, 'image/jpeg', 0.82)
        } catch {
          clearTimeout(timeout)
          done({ duration, thumb: null })
        }
      }
    }
    v.onerror = () => { clearTimeout(timeout); done({ duration: null, thumb: null }) }
  })
}

export function FileUploader({ kind = 'file', onUploaded, withMeta = true, compact }: {
  kind?: string; onUploaded: (m: MediaBrief) => void; withMeta?: boolean; compact?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState<number | null>(null)
  const [thumb, setThumb] = useState<Blob | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)

  const pick = async (f?: File | null) => {
    if (!f) return
    const isVideo = f.type.startsWith('video/') || /\.(mp4|m4v|webm|mov)$/i.test(f.name)
    const limitMb = isVideo ? MAX_MB.video : MAX_MB[kind] ?? 100
    if (f.size > limitMb * 1024 * 1024) return toast.error(`Файл больше ${limitMb} МБ`)
    setFile(f)
    setTitle(f.name.replace(/\.[^.]+$/, ''))
    setDuration(null)
    setThumb(null)
    if (f.type.startsWith('video/') || /\.(mp4|m4v|webm|mov)$/i.test(f.name)) {
      const p = await probeVideo(f)
      setDuration(p.duration)
      setThumb(p.thumb)
    }
    if (!withMeta) void start(f, f.name.replace(/\.[^.]+$/, ''))
  }

  const start = async (f = file, t = title) => {
    if (!f) return
    setProgress(0)
    const up = uploadFile(f, { title: t, description, duration_sec: duration ? Math.round(duration) : undefined }, setProgress)
    abortRef.current = up.abort
    try {
      let media = await up.promise
      if (thumb) {
        const tf = new File([thumb], 'thumbnail.jpg', { type: 'image/jpeg' })
        media = await uploadFile(tf, {}, undefined, `/api/materials/${media.id}/thumbnail`).promise.catch(() => media)
      }
      toast.success('Файл загружен')
      onUploaded(media)
      setFile(null)
      setProgress(null)
    } catch (e: any) {
      toast.error(e.message || 'Ошибка загрузки')
      setProgress(null)
    }
  }

  return (
    <div>
      {!file ? (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
             onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files?.[0]) }}
             onClick={() => input.current?.click()} role="button" tabIndex={0}
             onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
             className={cn('flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition',
               compact ? 'p-4' : 'p-8', drag ? 'border-brand-500 bg-brand-50' : 'border-line bg-slate-50/50 hover:border-brand-300 hover:bg-brand-50/40')}>
          <UploadCloud className="h-8 w-8 text-brand-600" />
          <p className="mt-2 text-sm font-medium">Перетащите файл сюда или нажмите для выбора</p>
          <p className="mt-0.5 text-xs text-muted">{kind === 'video' ? 'MP4, WebM, MOV · до 1 ГБ' : kind === 'image' ? 'PNG, JPG, WebP' : 'PDF, Word, Excel, PowerPoint и др. · до 100 МБ'}</p>
          <input ref={input} type="file" className="hidden" accept={ACCEPT[kind] ?? ACCEPT.file} data-testid={`file-input-${kind}`}
                 onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-line p-4">
          <div className="flex items-center gap-3">
            {thumb ? <img src={URL.createObjectURL(thumb)} className="h-14 w-24 rounded-lg object-cover" alt="" /> : <CheckCircle2 className="h-6 w-6 text-brand-600" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted">{fmtBytes(file.size)}{duration ? ` · ${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, '0')}` : ''}</p>
            </div>
            {progress === null && <button onClick={() => setFile(null)} className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Убрать"><X className="h-4 w-4" /></button>}
          </div>
          {withMeta && progress === null && (
            <>
              <Field label="Название"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Описание"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            </>
          )}
          {progress !== null ? (
            <div>
              <div className="mb-1 flex justify-between text-xs"><span>Загрузка на сервер…</span><span className="font-semibold">{progress}%</span></div>
              <Progress value={progress} />
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => abortRef.current?.()}>Отменить</Button>
            </div>
          ) : withMeta && <Button onClick={() => start()} data-testid="upload-start"><UploadCloud />Загрузить</Button>}
        </div>
      )}
    </div>
  )
}
