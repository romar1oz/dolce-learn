import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Archive, ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Eye, FileSpreadsheet, FileText, Film, Image as ImageIcon,
  Info, Link2, ListChecks, MessagesSquare, Paperclip, Pencil, Plus, Presentation, Rocket, Save, Trash2, Type,
} from 'lucide-react'
import { api } from '@/lib/api'
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, ErrorBlock, Field, Input, LoadingBlock,
  PageHeader, Select, SwitchRow, Textarea,
} from '@/components/ui'
import { CoverImage } from '@/features/learning'
import { FileUploader } from '@/features/upload'
import { COURSE_STATUS, cn, fmtBytes } from '@/lib/utils'
import type { Category, CourseDetail, Department, Lesson, Material, MediaBrief } from '@/types'

const schema = z.object({
  title: z.string().trim().min(3, 'Минимум 3 символа').max(255),
  description: z.string().max(20000).optional(),
  category_id: z.string().optional(),
  department_id: z.string().optional(),
  author_name: z.string().max(255).optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  duration_minutes: z.coerce.number().int().min(0).max(100000),
  is_mandatory: z.boolean(),
  publish_date: z.string().optional(),
  due_days: z.string().optional(),
  pass_score: z.coerce.number().int().min(0, '0–100').max(100, '0–100'),
  status: z.enum(['draft', 'published', 'archived']),
})
type FormV = z.infer<typeof schema>

export const BLOCKS: { kind: string; label: string; icon: any; hint: string }[] = [
  { kind: 'text', label: 'Текстовый блок', icon: Type, hint: 'Теоретический материал' },
  { kind: 'video', label: 'Видео', icon: Film, hint: 'MP4, WebM, MOV' },
  { kind: 'pdf', label: 'PDF', icon: FileText, hint: 'Инструкции, СОП' },
  { kind: 'word', label: 'Word', icon: FileText, hint: '.doc, .docx' },
  { kind: 'excel', label: 'Excel', icon: FileSpreadsheet, hint: '.xls, .xlsx' },
  { kind: 'powerpoint', label: 'PowerPoint', icon: Presentation, hint: '.ppt, .pptx' },
  { kind: 'image', label: 'Изображение', icon: ImageIcon, hint: 'Схемы, фото' },
  { kind: 'link', label: 'Внешняя ссылка', icon: Link2, hint: 'Нужен интернет' },
  { kind: 'test', label: 'Тест', icon: ListChecks, hint: 'Из конструктора тестов' },
  { kind: 'instruction', label: 'Инструкция', icon: Info, hint: 'Выделенный блок с шагами' },
  { kind: 'file', label: 'Доп. файл', icon: Paperclip, hint: 'Любой разрешённый файл' },
  { kind: 'dialogue', label: 'Тренажёр', icon: MessagesSquare, hint: 'Диалоговый сценарий' },
]
const FILE_KINDS = ['video', 'pdf', 'word', 'excel', 'powerpoint', 'image', 'file']

function MaterialDialog({ open, onOpenChange, lessonId, material, courseId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; lessonId: number; material?: Material | null; courseId: number; onSaved: () => void
}) {
  const [kind, setKind] = useState<string | null>(material?.kind ?? null)
  const [title, setTitle] = useState(material?.title ?? '')
  const [body, setBody] = useState(material?.body ?? '')
  const [url, setUrl] = useState(material?.url ?? '')
  const [media, setMedia] = useState<MediaBrief | null>(material?.media ?? null)
  const [testId, setTestId] = useState(material?.test_id ? String(material.test_id) : '')
  const [dialogueId, setDialogueId] = useState(material?.dialogue_id ? String(material.dialogue_id) : '')
  const [busy, setBusy] = useState(false)
  const tests = useQuery({ queryKey: ['staff-tests'], queryFn: () => api.get<any[]>('/api/tests'), enabled: open && kind === 'test' })
  const dialogues = useQuery({ queryKey: ['dialogues'], queryFn: () => api.get<any[]>('/api/dialogues'), enabled: open && kind === 'dialogue' })
  useEffect(() => {
    if (open) {
      setKind(material?.kind ?? null); setTitle(material?.title ?? ''); setBody(material?.body ?? ''); setUrl(material?.url ?? '')
      setMedia(material?.media ?? null); setTestId(material?.test_id ? String(material.test_id) : ''); setDialogueId(material?.dialogue_id ? String(material.dialogue_id) : '')
    }
  }, [open, material])

  const save = async () => {
    if (!kind) return
    setBusy(true)
    try {
      const payload = { kind, title: title || null, body: body || null, url: url || null, media_id: media?.id ?? null,
                        test_id: testId ? Number(testId) : null, dialogue_id: dialogueId ? Number(dialogueId) : null }
      if (material) await api.patch(`/api/lessons/materials/${material.id}`, payload)
      else await api.post(`/api/lessons/${lessonId}/materials`, payload)
      toast.success('Элемент сохранён')
      onSaved()
      onOpenChange(false)
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={material ? 'Редактирование элемента' : 'Новый элемент урока'} description={kind ? BLOCKS.find((b) => b.kind === kind)?.label : 'Выберите тип элемента'}>
        {!kind ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BLOCKS.map((b) => (
              <button key={b.kind} onClick={() => setKind(b.kind)} data-testid={`block-${b.kind}`}
                      className="flex items-start gap-2.5 rounded-2xl border border-line p-3 text-left transition hover:border-brand-300 hover:bg-brand-50">
                <b.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
                <span><span className="block text-sm font-semibold">{b.label}</span><span className="text-xs text-muted">{b.hint}</span></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Заголовок блока"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Необязательно" /></Field>
            {(kind === 'text' || kind === 'instruction') && (
              <Field label="Текст" hint="Поддерживается: **жирный**, списки «- пункт» и «1. шаг», заголовки «### …». HTML не допускается.">
                <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} data-testid="block-body" />
              </Field>
            )}
            {kind === 'link' && <Field label="Ссылка"><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></Field>}
            {FILE_KINDS.includes(kind) && (
              media ? (
                <div className="flex items-center gap-3 rounded-2xl border border-line p-3">
                  <Badge variant="green">{media.kind}</Badge>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{media.title || media.original_name}</p>
                    <p className="text-xs text-muted">{media.original_name} · {fmtBytes(media.size_bytes)}{media.duration_sec ? ` · ${Math.round(media.duration_sec)} с` : ''}</p></div>
                  <Button size="sm" variant="ghost" onClick={() => setMedia(null)}>Заменить</Button>
                </div>
              ) : <FileUploader kind={kind} onUploaded={(m) => { setMedia(m); if (!title) setTitle(m.title || '') }} />
            )}
            {kind === 'test' && (
              <Field label="Тест" hint={<>Нет нужного теста? <Link className="underline" to="/admin/tests">Создайте его в конструкторе</Link> и привяжите к курсу.</>}>
                <Select value={testId} onChange={(e) => setTestId(e.target.value)}>
                  <option value="">— выберите тест —</option>
                  {tests.data?.map((t) => <option key={t.id} value={t.id}>{t.title}{t.course_id && t.course_id !== courseId ? ` (курс: ${t.course_title})` : ''} · {t.status === 'published' ? 'опубликован' : 'черновик'}</option>)}
                </Select>
              </Field>
            )}
            {kind === 'dialogue' && (
              <Field label="Сценарий тренажёра">
                <Select value={dialogueId} onChange={(e) => setDialogueId(e.target.value)}>
                  <option value="">— выберите сценарий —</option>
                  {dialogues.data?.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </Select>
              </Field>
            )}
            <div className="flex justify-between gap-2">
              {!material ? <Button variant="ghost" onClick={() => setKind(null)}>← Другой тип</Button> : <span />}
              <Button onClick={save} loading={busy} data-testid="save-block"><Save />Сохранить</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function LessonRow({ lesson, idx, total, courseId, modules, refresh, defaultOpen, onMove }: {
  onMove: (moduleId: number, from: number, to: number) => void
  lesson: Lesson; idx: number; total: number; courseId: number; modules: { id: number; title: string }[]; refresh: () => void; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [edit, setEdit] = useState<Material | null | undefined>(undefined)
  const [rename, setRename] = useState(false)
  const [title, setTitle] = useState(lesson.title)
  const [dur, setDur] = useState(String(lesson.duration_minutes || ''))
  const ids = lesson.materials.map((m) => m.id)
  const move = async (from: number, to: number) => {
    const arr = [...ids]
    ;[arr[from], arr[to]] = [arr[to], arr[from]]
    await api.post(`/api/lessons/${lesson.id}/materials/reorder`, { ids: arr })
    refresh()
  }
  return (
    <div className="rounded-2xl border border-line bg-white">
      <div className="flex items-center gap-2 p-2.5">
        <button onClick={() => setOpen(!open)} className="rounded-lg p-1 hover:bg-slate-100" aria-label="Развернуть">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
        {rename ? (
          <form className="flex flex-1 flex-wrap gap-2" onSubmit={async (e) => {
            e.preventDefault()
            try { await api.patch(`/api/lessons/${lesson.id}`, { title, duration_minutes: Number(dur) || 0 }); setRename(false); refresh() } catch (er: any) { toast.error(er.message) }
          }}>
            <Input className="h-8 min-w-40 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <Input className="h-8 w-24" type="number" min={0} value={dur} onChange={(e) => setDur(e.target.value)} placeholder="мин" />
            <Button size="sm" type="submit">OK</Button>
          </form>
        ) : (
          <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
            <span className="text-sm font-medium">{idx + 1}. {lesson.title}</span>
            <span className="ml-2 text-xs text-muted">{lesson.materials.length} элем.{lesson.duration_minutes ? ` · ${lesson.duration_minutes} мин` : ''}</span>
          </button>
        )}
        <div className="flex shrink-0">
          <Button size="icon-sm" variant="ghost" onClick={() => setRename(!rename)} aria-label="Переименовать"><Pencil /></Button>
          <Button size="icon-sm" variant="ghost" disabled={idx === 0} onClick={() => onMove(lesson.module_id, idx, idx - 1)} aria-label="Выше"><ArrowUp /></Button>
          <Button size="icon-sm" variant="ghost" disabled={idx === total - 1} onClick={() => onMove(lesson.module_id, idx, idx + 1)} aria-label="Ниже"><ArrowDown /></Button>
          {modules.length > 1 && (
            <select className="h-8 w-8 cursor-pointer appearance-none rounded-lg bg-transparent text-center text-xs text-transparent hover:bg-slate-100" title="Перенести в модуль"
                    value="" onChange={async (e) => { await api.patch(`/api/lessons/${lesson.id}`, { title: lesson.title, module_id: Number(e.target.value) }); refresh() }}>
              <option value="">⇄</option>
              {modules.filter((m) => m.id !== lesson.module_id).map((m) => <option key={m.id} value={m.id}>→ {m.title}</option>)}
            </select>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Удалить урок" onClick={async () => {
            if (!confirm(`Удалить урок «${lesson.title}» со всеми элементами?`)) return
            await api.del(`/api/lessons/${lesson.id}`); refresh()
          }}><Trash2 className="text-red-500" /></Button>
        </div>
      </div>
      {open && (
        <div className="space-y-2 border-t border-line p-3">
          {lesson.materials.map((m, i) => {
            const B = BLOCKS.find((b) => b.kind === m.kind)
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                {B && <B.icon className="h-4 w-4 shrink-0 text-brand-700" />}
                <span className="min-w-0 flex-1 truncate text-sm"><b className="font-medium">{B?.label}</b>{m.title ? ` — ${m.title}` : ''}
                  {m.media && <span className="text-xs text-muted"> · {m.media.original_name} ({fmtBytes(m.media.size_bytes)})</span>}
                  {m.kind === 'text' && !m.title && <span className="text-xs text-muted"> · {m.body?.slice(0, 60)}</span>}</span>
                <Button size="icon-sm" variant="ghost" onClick={() => setEdit(m)} aria-label="Редактировать"><Pencil /></Button>
                <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Выше"><ArrowUp /></Button>
                <Button size="icon-sm" variant="ghost" disabled={i === ids.length - 1} onClick={() => move(i, i + 1)} aria-label="Ниже"><ArrowDown /></Button>
                <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={async () => {
                  if (!confirm('Удалить элемент?')) return
                  await api.del(`/api/lessons/materials/${m.id}`); refresh()
                }}><Trash2 className="text-red-500" /></Button>
              </div>
            )
          })}
          <Button size="sm" variant="secondary" onClick={() => setEdit(null)} data-testid="add-block"><Plus />Добавить элемент</Button>
        </div>
      )}
      <MaterialDialog open={edit !== undefined} onOpenChange={(v) => !v && setEdit(undefined)} lessonId={lesson.id}
                      material={edit ?? null} courseId={courseId} onSaved={refresh} />
    </div>
  )
}

export default function CourseEditor() {
  const { id } = useParams()
  const isNew = !id
  const courseId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const course = useQuery({ queryKey: ['course-edit', courseId], enabled: !isNew, queryFn: () => api.get<CourseDetail>(`/api/courses/${courseId}`) })
  const cats = useQuery({ queryKey: ['categories', 'course'], queryFn: () => api.get<Category[]>('/api/categories', { kind: 'course' }) })
  const deps = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/api/departments') })
  const [cover, setCover] = useState<string | null>(null)
  const [coverUpload, setCoverUpload] = useState(false)
  const [newModule, setNewModule] = useState('')
  const [newLesson, setNewLesson] = useState<Record<number, string>>({})
  const [lastLesson, setLastLesson] = useState<number | null>(null)

  const f = useForm<FormV>({
    resolver: zodResolver(schema) as any,
    defaultValues: { title: '', description: '', level: 'beginner', duration_minutes: 30, is_mandatory: false, pass_score: 80, status: 'draft', due_days: '14' },
  })
  useEffect(() => {
    const c = course.data
    if (!c) return
    f.reset({
      title: c.title, description: c.description ?? '', category_id: c.category_id ? String(c.category_id) : '',
      department_id: c.department_id ? String(c.department_id) : '', author_name: c.author_name ?? '', level: c.level as any,
      duration_minutes: c.duration_minutes, is_mandatory: c.is_mandatory, publish_date: c.publish_date ?? '',
      due_days: c.due_days ? String(c.due_days) : '', pass_score: c.pass_score, status: c.status,
    })
    setCover(c.cover_media_id ?? null)
  }, [course.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => qc.invalidateQueries({ queryKey: ['course-edit', courseId] })
  const moveLesson = async (moduleId: number, from: number, to: number) => {
    const m = course.data?.modules.find((x) => x.id === moduleId)
    if (!m) return
    const ids = m.lessons.map((l) => l.id)
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    await api.post(`/api/modules/${moduleId}/lessons/reorder`, { ids })
    refresh()
  }

  const onSubmit = async (v: FormV, statusOverride?: string) => {
    const payload = {
      ...v, description: v.description || null, author_name: v.author_name || null,
      category_id: v.category_id ? Number(v.category_id) : null, department_id: v.department_id ? Number(v.department_id) : null,
      publish_date: v.publish_date || null, due_days: v.due_days ? Number(v.due_days) : null, cover_media_id: cover,
      status: statusOverride ?? v.status,
    }
    try {
      if (isNew) {
        const c = await api.post<CourseDetail>('/api/courses', payload)
        toast.success('Курс создан. Теперь добавьте модули и уроки.')
        navigate(`/admin/courses/${c.id}`, { replace: true })
      } else {
        await api.patch(`/api/courses/${courseId}`, payload)
        toast.success(statusOverride === 'published' ? 'Курс опубликован' : statusOverride === 'archived' ? 'Курс перенесён в архив' : 'Изменения сохранены')
        if (statusOverride) f.setValue('status', statusOverride as any)
        refresh()
        qc.invalidateQueries({ queryKey: ['staff-courses'] })
      }
    } catch (e: any) { toast.error(e.message) }
  }

  if (!isNew && course.isLoading) return <LoadingBlock />
  if (!isNew && course.error) return <ErrorBlock error={course.error} />
  const c = course.data
  const err = f.formState.errors
  const status = f.watch('status')

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={<Link to="/admin/courses" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Все курсы</Link>}
        title={isNew ? 'Создание курса' : c?.title}
        subtitle={!isNew && c ? <span className="flex flex-wrap items-center gap-2"><Badge variant={status === 'published' ? 'green' : status === 'draft' ? 'amber' : 'default'}>{COURSE_STATUS[status]}</Badge>версия {c.version} · {c.module_count} мод. · {c.lesson_count} ур.</span> : 'Заполните основную информацию — модули и уроки добавляются после сохранения'}
        actions={!isNew && (<>
          <Button variant="outline" asChild><Link to={`/courses/${courseId}`}><Eye />Как видит сотрудник</Link></Button>
          {status !== 'published'
            ? <Button variant="accent" onClick={f.handleSubmit((v) => onSubmit(v, 'published'))} data-testid="publish-course"><Rocket />Опубликовать</Button>
            : <Button variant="outline" onClick={f.handleSubmit((v) => onSubmit(v, 'archived'))}><Archive />В архив</Button>}
        </>)} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <Card>
          <CardHeader><CardTitle>Основная информация</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={f.handleSubmit((v) => onSubmit(v))}>
              <Field label="Название *" error={err.title?.message}><Input {...f.register('title')} data-testid="course-title" /></Field>
              <Field label="Описание"><Textarea rows={4} {...f.register('description')} /></Field>
              <Field label="Обложка">
                {cover && !coverUpload ? (
                  <div className="flex items-center gap-3">
                    <CoverImage mediaId={cover} className="aspect-video w-40 rounded-xl" />
                    <div className="flex flex-col gap-1"><Button type="button" size="sm" variant="outline" onClick={() => setCoverUpload(true)}>Заменить</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCover(null)}>Убрать</Button></div>
                  </div>
                ) : <FileUploader kind="image" compact withMeta={false} onUploaded={(m) => { setCover(m.id); setCoverUpload(false) }} />}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Категория"><Select {...f.register('category_id')}><option value="">—</option>{cats.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <Field label="Подразделение" hint="Пусто — курс виден всем"><Select {...f.register('department_id')}><option value="">Все подразделения</option>{deps.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                <Field label="Автор"><Input {...f.register('author_name')} placeholder="По умолчанию — вы" /></Field>
                <Field label="Уровень сложности"><Select {...f.register('level')}><option value="beginner">Начальный</option><option value="intermediate">Средний</option><option value="advanced">Продвинутый</option></Select></Field>
                <Field label="Продолжительность, мин" error={err.duration_minutes?.message}><Input type="number" min={0} {...f.register('duration_minutes')} /></Field>
                <Field label="Проходной балл, %" error={err.pass_score?.message}><Input type="number" min={0} max={100} {...f.register('pass_score')} /></Field>
                <Field label="Дата публикации"><Input type="date" {...f.register('publish_date')} /></Field>
                <Field label="Срок прохождения, дней" hint="Срок отсчитывается от назначения"><Input type="number" min={1} {...f.register('due_days')} /></Field>
                <Field label="Статус"><Select {...f.register('status')}><option value="draft">Черновик</option><option value="published">Опубликован</option><option value="archived">Архив</option></Select></Field>
              </div>
              <SwitchRow label="Обязательный курс" hint="Отображается с отметкой «Обязательный», учитывается в аттестации"
                         checked={f.watch('is_mandatory')} onChange={(v) => f.setValue('is_mandatory', v)} />
              <Button type="submit" loading={f.formState.isSubmitting} className="w-full" data-testid="save-course"><Save />{isNew ? 'Создать курс' : 'Сохранить'}</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><div><CardTitle>Структура курса</CardTitle><p className="text-xs text-muted">Модули → уроки → элементы (текст, видео, документы, тесты…)</p></div></CardHeader>
            <CardContent className="space-y-4">
              {isNew ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-muted">Сохраните курс, чтобы добавить модули и уроки.</p> : (
                <>
                  {c!.modules.map((m, mi) => (
                    <div key={m.id} className="rounded-2xl bg-slate-50 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-lg bg-brand-900 px-2 py-0.5 text-xs font-semibold text-white">М{mi + 1}</span>
                        <p className="flex-1 font-semibold">{m.title}</p>
                        <Button size="icon-sm" variant="ghost" aria-label="Переименовать" onClick={async () => {
                          const t = prompt('Название модуля', m.title)
                          if (t) { await api.patch(`/api/modules/${m.id}`, { title: t }); refresh() }
                        }}><Pencil /></Button>
                        <Button size="icon-sm" variant="ghost" disabled={mi === 0} aria-label="Выше" onClick={async () => {
                          const ids = c!.modules.map((x) => x.id); [ids[mi], ids[mi - 1]] = [ids[mi - 1], ids[mi]]
                          await api.post(`/api/courses/${courseId}/modules/reorder`, { ids }); refresh()
                        }}><ArrowUp /></Button>
                        <Button size="icon-sm" variant="ghost" disabled={mi === c!.modules.length - 1} aria-label="Ниже" onClick={async () => {
                          const ids = c!.modules.map((x) => x.id); [ids[mi], ids[mi + 1]] = [ids[mi + 1], ids[mi]]
                          await api.post(`/api/courses/${courseId}/modules/reorder`, { ids }); refresh()
                        }}><ArrowDown /></Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Удалить модуль" onClick={async () => {
                          if (!confirm(`Удалить модуль «${m.title}» со всеми уроками?`)) return
                          await api.del(`/api/modules/${m.id}`); refresh()
                        }}><Trash2 className="text-red-500" /></Button>
                      </div>
                      <div className="space-y-2">
                        {m.lessons.map((l, li) => (
                          <LessonRow key={l.id} lesson={l} idx={li} total={m.lessons.length} courseId={courseId} refresh={refresh}
                                     modules={c!.modules.map((x) => ({ id: x.id, title: x.title }))} defaultOpen={l.id === lastLesson} onMove={moveLesson} />
                        ))}
                        <form className="flex gap-2" onSubmit={async (e) => {
                          e.preventDefault()
                          const t = (newLesson[m.id] || '').trim()
                          if (!t) return
                          try {
                            const l = await api.post<Lesson>(`/api/modules/${m.id}/lessons`, { title: t })
                            setNewLesson({ ...newLesson, [m.id]: '' }); setLastLesson(l.id); refresh()
                          } catch (er: any) { toast.error(er.message) }
                        }}>
                          <Input className="h-9 bg-white" placeholder="Название нового урока" value={newLesson[m.id] || ''}
                                 onChange={(e) => setNewLesson({ ...newLesson, [m.id]: e.target.value })} data-testid="new-lesson-input" />
                          <Button size="sm" className="h-9" type="submit" variant="secondary"><Plus />Урок</Button>
                        </form>
                      </div>
                    </div>
                  ))}
                  <form className="flex gap-2" onSubmit={async (e) => {
                    e.preventDefault()
                    if (!newModule.trim()) return
                    try { await api.post(`/api/courses/${courseId}/modules`, { title: newModule.trim() }); setNewModule(''); refresh() }
                    catch (er: any) { toast.error(er.message) }
                  }}>
                    <Input placeholder="Название нового модуля" value={newModule} onChange={(e) => setNewModule(e.target.value)} data-testid="new-module-input" />
                    <Button type="submit"><Plus />Модуль</Button>
                  </form>
                </>
              )}
            </CardContent>
          </Card>
          {!isNew && (
            <Card className={cn('p-4 text-sm', status === 'published' ? 'bg-brand-50/60' : '')}>
              <p className="font-semibold">Публикация и назначение</p>
              <p className="mt-1 text-muted">Опубликованный курс появляется в каталоге. Назначьте его сотрудникам или подразделениям в разделе «Назначения».</p>
              <Button asChild size="sm" variant="secondary" className="mt-3"><Link to={`/admin/assignments?course=${courseId}`}>Назначить сотрудникам</Link></Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
