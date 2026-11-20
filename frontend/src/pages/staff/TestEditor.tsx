import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Circle, Pencil, Plus, Rocket, Save, Square, SquareCheck, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, ErrorBlock, Field, Input, LoadingBlock,
  PageHeader, Select, SwitchRow, Textarea,
} from '@/components/ui'
import { COURSE_STATUS, cn } from '@/lib/utils'
import type { CourseSummary, Page } from '@/types'

const QTYPES: Record<string, string> = { single: 'Одиночный выбор', multiple: 'Множественный выбор', text: 'Открытый ответ', ordering: 'Последовательность' }
type Opt = { text: string; is_correct: boolean }
interface QForm { id?: number; type: string; text: string; points: number; explanation: string; reference_answer: string; options: Opt[] }
const emptyQ = (): QForm => ({ type: 'single', text: '', points: 1, explanation: '', reference_answer: '', options: [{ text: '', is_correct: true }, { text: '', is_correct: false }] })

function toLocalInput(v?: string | null) {
  if (!v) return ''
  const d = new Date(v)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function QuestionDialog({ open, onOpenChange, testId, initial, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; testId: number; initial: QForm; onSaved: () => void }) {
  const [q, setQ] = useState<QForm>(initial)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setQ(initial) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const setOpt = (i: number, patch: Partial<Opt>) => setQ({ ...q, options: q.options.map((o, k) => (k === i ? { ...o, ...patch } : q.type === 'single' && patch.is_correct ? { ...o, is_correct: false } : o)) })
  const save = async () => {
    setBusy(true)
    try {
      const payload = { type: q.type, text: q.text, points: Number(q.points) || 1, explanation: q.explanation || null,
                        reference_answer: q.reference_answer || null, options: q.type === 'text' ? [] : q.options.filter((o) => o.text.trim()) }
      if (q.id) await api.patch(`/api/tests/questions/${q.id}`, payload)
      else await api.post(`/api/tests/${testId}/questions`, payload)
      toast.success('Вопрос сохранён')
      onSaved()
      onOpenChange(false)
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={q.id ? 'Редактирование вопроса' : 'Новый вопрос'}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Field label="Тип вопроса">
              <Select value={q.type} onChange={(e) => setQ({ ...q, type: e.target.value, options: e.target.value === 'single' ? q.options.map((o, i) => ({ ...o, is_correct: i === 0 })) : q.options })} data-testid="q-type">
                {Object.entries(QTYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Баллы"><Input type="number" min={0.5} step={0.5} value={q.points} onChange={(e) => setQ({ ...q, points: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Текст вопроса"><Textarea rows={3} value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} data-testid="q-text" /></Field>
          {q.type !== 'text' ? (
            <div>
              <p className="mb-1.5 text-sm font-medium">{q.type === 'ordering' ? 'Элементы в ПРАВИЛЬНОМ порядке (сотруднику покажутся перемешанными)' : 'Варианты ответа — отметьте правильные'}</p>
              <div className="space-y-2">
                {q.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {q.type === 'ordering' ? <span className="w-6 text-center text-sm font-semibold text-muted">{i + 1}</span> : (
                      <button type="button" onClick={() => setOpt(i, { is_correct: q.type === 'single' ? true : !o.is_correct })} aria-label="Правильный"
                              className={cn('rounded-lg p-1', o.is_correct ? 'text-brand-600' : 'text-slate-300 hover:text-slate-500')}>
                        {q.type === 'single' ? (o.is_correct ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />) : (o.is_correct ? <SquareCheck className="h-5 w-5" /> : <Square className="h-5 w-5" />)}
                      </button>
                    )}
                    <Input value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} placeholder={`Вариант ${i + 1}`} data-testid="q-option" />
                    {q.type === 'ordering' && (<>
                      <Button type="button" size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => { const a = [...q.options]; [a[i], a[i - 1]] = [a[i - 1], a[i]]; setQ({ ...q, options: a }) }}><ArrowUp /></Button>
                      <Button type="button" size="icon-sm" variant="ghost" disabled={i === q.options.length - 1} onClick={() => { const a = [...q.options]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; setQ({ ...q, options: a }) }}><ArrowDown /></Button>
                    </>)}
                    <Button type="button" size="icon-sm" variant="ghost" disabled={q.options.length <= 2} onClick={() => setQ({ ...q, options: q.options.filter((_, k) => k !== i) })} aria-label="Удалить вариант"><X /></Button>
                  </div>
                ))}
              </div>
              <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => setQ({ ...q, options: [...q.options, { text: '', is_correct: false }] })} data-testid="add-option"><Plus />Добавить вариант</Button>
            </div>
          ) : (
            <Field label="Эталонный ответ (виден только проверяющему)"><Textarea rows={2} value={q.reference_answer} onChange={(e) => setQ({ ...q, reference_answer: e.target.value })} /></Field>
          )}
          <Field label="Объяснение правильного ответа" hint="Показывается сотруднику после завершения попытки (если разрешено настройками)"><Textarea rows={2} value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} /></Field>
          <Button onClick={save} loading={busy} className="w-full" data-testid="save-question"><Save />Сохранить вопрос</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function TestEditor() {
  const { id } = useParams()
  const testId = Number(id)
  const qc = useQueryClient()
  const t = useQuery({ queryKey: ['test', testId], queryFn: () => api.get<any>(`/api/tests/${testId}`) })
  const courses = useQuery({ queryKey: ['staff-courses-all'], queryFn: () => api.get<Page<CourseSummary>>('/api/courses', { page_size: 200 }) })
  const [s, setS] = useState<any>(null)
  const [dlg, setDlg] = useState<QForm | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (t.data) setS({ ...t.data, available_from: toLocalInput(t.data.available_from), available_until: toLocalInput(t.data.available_until) })
  }, [t.data])
  const refresh = () => qc.invalidateQueries({ queryKey: ['test', testId] })
  if (t.isLoading || !s) return t.error ? <ErrorBlock error={t.error} /> : <LoadingBlock />

  const save = async (status?: string) => {
    setSaving(true)
    try {
      await api.patch(`/api/tests/${testId}`, {
        title: s.title, description: s.description || null, course_id: s.course_id ? Number(s.course_id) : null,
        question_count: s.question_count ? Number(s.question_count) : null, pass_score: Number(s.pass_score),
        time_limit_minutes: s.time_limit_minutes ? Number(s.time_limit_minutes) : null, max_attempts: s.max_attempts ? Number(s.max_attempts) : null,
        shuffle_questions: s.shuffle_questions, shuffle_options: s.shuffle_options, show_correct_answers: s.show_correct_answers,
        available_from: s.available_from ? new Date(s.available_from).toISOString() : null,
        available_until: s.available_until ? new Date(s.available_until).toISOString() : null,
        status: status ?? s.status,
      })
      toast.success(status === 'published' ? 'Тест опубликован' : 'Настройки сохранены')
      refresh()
      qc.invalidateQueries({ queryKey: ['staff-tests'] })
    } catch (e: any) { toast.error(e.message) } finally { setSaving(false) }
  }
  const qs: any[] = t.data.questions

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader back={<Link to="/admin/tests" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Все тесты</Link>}
                  title={t.data.title}
                  subtitle={<span className="flex flex-wrap items-center gap-2"><Badge variant={t.data.status === 'published' ? 'green' : 'amber'}>{COURSE_STATUS[t.data.status]}</Badge>{qs.length} вопр. · {t.data.total_points} баллов · попыток: {t.data.attempts_count}</span>}
                  actions={t.data.status !== 'published' && <Button variant="accent" onClick={() => save('published')} loading={saving} data-testid="publish-test"><Rocket />Опубликовать</Button>} />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle>Настройки теста</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Название"><Input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></Field>
            <Field label="Описание"><Textarea rows={2} value={s.description || ''} onChange={(e) => setS({ ...s, description: e.target.value })} /></Field>
            <Field label="Связанный курс">
              <Select value={s.course_id || ''} onChange={(e) => setS({ ...s, course_id: e.target.value })}>
                <option value="">— без курса —</option>{courses.data?.items.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Проходной балл, %"><Input type="number" min={0} max={100} value={s.pass_score} onChange={(e) => setS({ ...s, pass_score: e.target.value })} /></Field>
              <Field label="Вопросов в попытке" hint="Пусто — все"><Input type="number" min={1} value={s.question_count || ''} onChange={(e) => setS({ ...s, question_count: e.target.value })} /></Field>
              <Field label="Лимит времени, мин"><Input type="number" min={1} value={s.time_limit_minutes || ''} onChange={(e) => setS({ ...s, time_limit_minutes: e.target.value })} placeholder="нет" /></Field>
              <Field label="Попыток"><Input type="number" min={1} value={s.max_attempts || ''} onChange={(e) => setS({ ...s, max_attempts: e.target.value })} placeholder="без лимита" /></Field>
              <Field label="Доступен с"><Input type="datetime-local" value={s.available_from} onChange={(e) => setS({ ...s, available_from: e.target.value })} /></Field>
              <Field label="Доступен до"><Input type="datetime-local" value={s.available_until} onChange={(e) => setS({ ...s, available_until: e.target.value })} /></Field>
            </div>
            <SwitchRow label="Перемешивать вопросы" checked={s.shuffle_questions} onChange={(v) => setS({ ...s, shuffle_questions: v })} />
            <SwitchRow label="Перемешивать варианты" checked={s.shuffle_options} onChange={(v) => setS({ ...s, shuffle_options: v })} />
            <SwitchRow label="Показывать разбор после попытки" hint="Правильные ответы видны только после завершения" checked={s.show_correct_answers} onChange={(v) => setS({ ...s, show_correct_answers: v })} />
            <Field label="Статус"><Select value={s.status} onChange={(e) => setS({ ...s, status: e.target.value })}><option value="draft">Черновик</option><option value="published">Опубликован</option><option value="archived">Архив</option></Select></Field>
            <Button className="w-full" onClick={() => save()} loading={saving}><Save />Сохранить настройки</Button>
          </CardContent>
        </Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Вопросы</h2>
            <Button onClick={() => setDlg(emptyQ())} data-testid="add-question"><Plus />Добавить вопрос</Button>
          </div>
          {qs.length === 0 && <Card className="p-8 text-center text-sm text-muted">Добавьте первый вопрос</Card>}
          {qs.map((q, i) => (
            <Card key={q.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-sm font-bold text-brand-900">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5"><Badge variant="outline">{QTYPES[q.type]}</Badge><Badge variant="outline">{q.points} балл.</Badge></div>
                  <p className="mt-1.5 font-medium">{q.text}</p>
                  {q.type !== 'text' && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {q.options.map((o: any, k: number) => (
                        <li key={o.id} className={cn('flex items-center gap-2', o.is_correct && 'font-medium text-brand-800')}>
                          {q.type === 'ordering' ? <span className="w-4 text-xs text-muted">{k + 1}.</span> : o.is_correct ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4 text-slate-300" />}{o.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.explanation && <p className="mt-2 text-xs text-muted">Объяснение: {q.explanation}</p>}
                </div>
                <div className="flex shrink-0 flex-col sm:flex-row">
                  <Button size="icon-sm" variant="ghost" aria-label="Редактировать" onClick={() => setDlg({ id: q.id, type: q.type, text: q.text, points: q.points, explanation: q.explanation || '', reference_answer: q.reference_answer || '', options: q.options.map((o: any) => ({ text: o.text, is_correct: o.is_correct })) })}><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" disabled={i === 0} aria-label="Выше" onClick={async () => { const ids = qs.map((x) => x.id); [ids[i], ids[i - 1]] = [ids[i - 1], ids[i]]; await api.post(`/api/tests/${testId}/questions/reorder`, { ids }); refresh() }}><ArrowUp /></Button>
                  <Button size="icon-sm" variant="ghost" disabled={i === qs.length - 1} aria-label="Ниже" onClick={async () => { const ids = qs.map((x) => x.id); [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]]; await api.post(`/api/tests/${testId}/questions/reorder`, { ids }); refresh() }}><ArrowDown /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={async () => {
                    if (!confirm('Удалить вопрос?')) return
                    try { await api.del(`/api/tests/questions/${q.id}`); refresh() } catch (e: any) { toast.error(e.message) }
                  }}><Trash2 className="text-red-500" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <QuestionDialog open={!!dlg} onOpenChange={(v) => !v && setDlg(null)} testId={testId} initial={dlg ?? emptyQ()} onSaved={refresh} />
    </div>
  )
}
