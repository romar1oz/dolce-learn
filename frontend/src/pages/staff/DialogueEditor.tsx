import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Flag, Play, Plus, Save, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorBlock, Field, Input, LoadingBlock, PageHeader, Select, Switch, Textarea } from '@/components/ui'
import { uuid } from '@/lib/utils'

interface Ch { text: string; next_key: string | null; is_correct: boolean; score: number; feedback: string | null }
interface Node { key: string; character_key: string | null; text: string; is_start: boolean; is_end: boolean; choices: Ch[] }
interface Scn { id?: number; title: string; description: string | null; status: string; pass_score: number; characters: { key: string; name: string; role: string | null; color: string | null }[]; nodes: Node[] }

const COLORS = ['#0EA5E9', '#F59E0B', '#8B5CF6', '#059669', '#E11D48']

export default function DialogueEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['dialogue-edit', id], enabled: !isNew, queryFn: () => api.get<Scn>(`/api/dialogues/${id}/edit`) })
  const [s, setS] = useState<Scn | null>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  useEffect(() => {
    if (isNew) {
      const k = uuid().slice(0, 8)
      setS({ title: '', description: '', status: 'draft', pass_score: 70, characters: [{ key: 'c1', name: 'Коллега', role: null, color: COLORS[0] }],
             nodes: [{ key: k, character_key: 'c1', text: '', is_start: true, is_end: false, choices: [] }] })
    } else if (q.data) setS(q.data)
  }, [isNew, q.data])
  if (!s) return q.error ? <ErrorBlock error={q.error} /> : <LoadingBlock />

  const upNode = (k: string, patch: Partial<Node>) => setS({ ...s, nodes: s.nodes.map((n) => (n.key === k ? { ...n, ...patch } : patch.is_start ? { ...n, is_start: false } : n)) })
  const upChoice = (k: string, i: number, patch: Partial<Ch>) => setS({ ...s, nodes: s.nodes.map((n) => (n.key === k ? { ...n, choices: n.choices.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : n)) })
  const label = (n: Node, i: number) => `#${i + 1} ${n.text.slice(0, 40) || '(пусто)'}`

  const save = async () => {
    setBusy(true)
    try {
      const r: any = isNew ? await api.post('/api/dialogues', s) : await api.put(`/api/dialogues/${id}`, s)
      if (r.warning) toast.warning(r.warning); else toast.success('Сценарий сохранён')
      qc.invalidateQueries({ queryKey: ['dialogues'] })
      if (isNew) navigate(`/admin/dialogues/${r.id}`, { replace: true })
      else setS(r)
    } catch (e: any) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader back={<Link to="/admin/dialogues" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Сценарии</Link>}
                  title={isNew ? 'Новый сценарий' : s.title}
                  actions={<>{!isNew && <Button variant="outline" asChild><Link to={`/dialogues/${id}`}><Play />Пройти</Link></Button>}<Button onClick={save} loading={busy}><Save />Сохранить</Button></>} />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card><CardHeader><CardTitle>Сценарий</CardTitle></CardHeader><CardContent className="space-y-3">
            <Field label="Название"><Input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></Field>
            <Field label="Описание"><Textarea rows={2} value={s.description || ''} onChange={(e) => setS({ ...s, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Проходной, %"><Input type="number" value={s.pass_score} onChange={(e) => setS({ ...s, pass_score: Number(e.target.value) })} /></Field>
              <Field label="Статус"><Select value={s.status} onChange={(e) => setS({ ...s, status: e.target.value })}><option value="draft">Черновик</option><option value="published">Опубликован</option></Select></Field>
            </div>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Персонажи</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setS({ ...s, characters: [...s.characters, { key: uuid().slice(0, 8), name: 'Персонаж', role: null, color: COLORS[s.characters.length % COLORS.length] }] })}><Plus />Добавить</Button></CardHeader>
            <CardContent className="space-y-2">{s.characters.map((c, i) => (
              <div key={c.key} className="flex items-center gap-2">
                <input type="color" value={c.color || '#065F46'} className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-line" onChange={(e) => setS({ ...s, characters: s.characters.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })} />
                <Input className="h-9" value={c.name} onChange={(e) => setS({ ...s, characters: s.characters.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Button size="icon-sm" variant="ghost" aria-label="Удалить" onClick={() => setS({ ...s, characters: s.characters.filter((_, j) => j !== i), nodes: s.nodes.map((n) => (n.character_key === c.key ? { ...n, character_key: null } : n)) })}><X /></Button>
              </div>
            ))}</CardContent>
          </Card>
        </div>
        <div className="space-y-3">
          {s.nodes.map((n, i) => (
            <Card key={n.key} className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="dark">#{i + 1}</Badge>
                {n.is_start && <Badge variant="green"><Play className="h-3 w-3" />Старт</Badge>}
                {n.is_end && <Badge variant="amber"><Flag className="h-3 w-3" />Финал</Badge>}
                <Select className="h-8 w-44" value={n.character_key || ''} onChange={(e) => upNode(n.key, { character_key: e.target.value || null })}>
                  <option value="">Рассказчик</option>{s.characters.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </Select>
                <label className="ml-auto flex items-center gap-1.5 text-xs">Старт <Switch checked={n.is_start} onCheckedChange={(v) => v && upNode(n.key, { is_start: true })} /></label>
                <label className="flex items-center gap-1.5 text-xs">Финал <Switch checked={n.is_end} onCheckedChange={(v) => upNode(n.key, { is_end: v, choices: v ? [] : n.choices })} /></label>
                <Button size="icon-sm" variant="ghost" aria-label="Удалить реплику" disabled={s.nodes.length === 1}
                        onClick={() => setS({ ...s, nodes: s.nodes.filter((x) => x.key !== n.key).map((x) => ({ ...x, choices: x.choices.map((c) => (c.next_key === n.key ? { ...c, next_key: null } : c)) })) })}><Trash2 className="text-red-500" /></Button>
              </div>
              <Textarea rows={2} placeholder="Текст реплики / описание ситуации" value={n.text} onChange={(e) => upNode(n.key, { text: e.target.value })} />
              {!n.is_end && (
                <div className="mt-3 space-y-2">
                  {n.choices.map((c, ci) => (
                    <div key={ci} className="rounded-xl bg-slate-50 p-2.5">
                      <div className="flex gap-2"><Input className="h-9 bg-white" placeholder="Вариант ответа сотрудника" value={c.text} onChange={(e) => upChoice(n.key, ci, { text: e.target.value })} />
                        <Button size="icon-sm" variant="ghost" className="h-9 w-9" aria-label="Удалить вариант" onClick={() => upNode(n.key, { choices: n.choices.filter((_, j) => j !== ci) })}><X /></Button></div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                        <Select className="h-9 bg-white" value={c.next_key || ''} onChange={(e) => upChoice(n.key, ci, { next_key: e.target.value || null })}>
                          <option value="">→ завершить диалог</option>{s.nodes.filter((x) => x.key !== n.key).map((x) => <option key={x.key} value={x.key}>→ {label(x, s.nodes.indexOf(x))}</option>)}
                        </Select>
                        <Input className="h-9 bg-white" type="number" min={0} title="Баллы" value={c.score} onChange={(e) => upChoice(n.key, ci, { score: Number(e.target.value) })} />
                        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">Верно <Switch checked={c.is_correct} onCheckedChange={(v) => upChoice(n.key, ci, { is_correct: v })} /></label>
                      </div>
                      <Input className="mt-2 h-9 bg-white" placeholder="Обратная связь после выбора" value={c.feedback || ''} onChange={(e) => upChoice(n.key, ci, { feedback: e.target.value })} />
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => upNode(n.key, { choices: [...n.choices, { text: '', next_key: null, is_correct: false, score: 0, feedback: null }] })}><Plus />Вариант ответа</Button>
                </div>
              )}
            </Card>
          ))}
          <Button variant="secondary" onClick={() => setS({ ...s, nodes: [...s.nodes, { key: uuid().slice(0, 8), character_key: s.characters[0]?.key ?? null, text: '', is_start: false, is_end: false, choices: [] }] })}><Plus />Добавить реплику</Button>
        </div>
      </div>
    </div>
  )
}
