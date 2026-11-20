import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, MessagesSquare, RotateCcw, XCircle } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { cn, uuid } from '@/lib/utils'
import { enqueue, onSynced } from '@/offline/sync'
import type { DialoguePackage } from '@/types'

type Step = { nodeId: number; choiceId?: number }

export function DialogueRunner({ scenario }: { scenario: DialoguePackage }) {
  const nodes = useMemo(() => new Map(scenario.nodes.map((n) => [n.id, n])), [scenario])
  const chars = useMemo(() => new Map(scenario.characters.map((c) => [c.id, c])), [scenario])
  const start = scenario.nodes.find((n) => n.is_start) ?? scenario.nodes[0]
  const [steps, setSteps] = useState<Step[]>([{ nodeId: start.id }])
  const [runId, setRunId] = useState(uuid())
  const [server, setServer] = useState<{ percent: number; passed: boolean } | null>(null)
  const [sent, setSent] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  const current = nodes.get(steps[steps.length - 1].nodeId)!
  const finished = current.is_end || current.choices.length === 0 || steps[steps.length - 1].choiceId !== undefined
  const chosen = steps.filter((s) => s.choiceId).map((s) => {
    const n = nodes.get(s.nodeId)!
    return { node: n, choice: n.choices.find((c) => c.id === s.choiceId)! }
  })
  const score = chosen.reduce((s, x) => s + x.choice.score, 0)
  const max = chosen.reduce((s, x) => s + Math.max(...x.node.choices.map((c) => c.score)), 0)
  const pct = max ? Math.round((100 * score) / max) : 0

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), [steps.length])
  useEffect(() => onSynced((item) => {
    if (item.type === 'dialogue_run' && item.payload.run_id === runId && item.status === 'synced') setServer(item.result as any)
  }), [runId])

  useEffect(() => {
    if (finished && !sent && chosen.length) {
      setSent(true)
      void enqueue('dialogue_run', { run_id: runId, scenario_id: scenario.id, choice_ids: chosen.map((c) => c.choice.id) }, { flush: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished])

  const choose = (choiceId: number) => {
    const ch = current.choices.find((c) => c.id === choiceId)!
    const next: Step[] = [...steps.slice(0, -1), { nodeId: current.id, choiceId }]
    if (ch.next_node_id && nodes.has(ch.next_node_id)) next.push({ nodeId: ch.next_node_id })
    setSteps(next)
  }

  const restart = () => {
    setSteps([{ nodeId: start.id }])
    setRunId(uuid())
    setServer(null)
    setSent(false)
  }

  const isOver = finished

  return (
    <div className="rounded-2xl border border-line bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessagesSquare className="h-5 w-5 text-brand-700" />
        <p className="font-semibold">{scenario.title}</p>
      </div>
      {scenario.description && <p className="mb-4 text-sm text-muted">{scenario.description}</p>}
      <div className="space-y-3">
        {steps.map((s, i) => {
          const n = nodes.get(s.nodeId)!
          const ch = n.character_id ? chars.get(n.character_id) : null
          const choice = s.choiceId ? n.choices.find((c) => c.id === s.choiceId) : null
          return (
            <div key={i} className="space-y-2">
              <div className="flex gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: ch?.color || '#065F46' }}>
                  {(ch?.name || 'С')[0]}
                </div>
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-sm shadow-sm">
                  {ch && <p className="mb-0.5 text-xs font-semibold" style={{ color: ch.color || undefined }}>{ch.name}{ch.role ? ` · ${ch.role}` : ''}</p>}
                  {n.text}
                </div>
              </div>
              {choice && (
                <div className="flex flex-col items-end gap-1">
                  <div className={cn('max-w-[85%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm text-white', choice.is_correct ? 'bg-brand-600' : 'bg-slate-600')}>{choice.text}</div>
                  {choice.feedback && (
                    <p className={cn('flex max-w-[85%] items-start gap-1 text-xs', choice.is_correct ? 'text-brand-800' : 'text-red-600')}>
                      {choice.is_correct ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}{choice.feedback}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottom} />
      </div>
      {!isOver ? (
        <div className="mt-4 grid gap-2">
          {current.choices.map((c) => (
            <button key={c.id} onClick={() => choose(c.id)}
                    className="rounded-xl border border-line bg-white px-4 py-3 text-left text-sm font-medium transition hover:border-brand-500 hover:bg-brand-50">
              {c.text}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-white p-4 text-center shadow-sm">
          <p className="text-sm text-muted">Результат тренажёра</p>
          <p className="text-3xl font-bold">{server ? Math.round(server.percent) : pct}%</p>
          <div className="mt-1 flex justify-center gap-2">
            {(server ? server.passed : pct >= scenario.pass_score)
              ? <Badge variant="green">Сценарий пройден</Badge> : <Badge variant="red">Нужно повторить</Badge>}
            {!server && <Badge variant="amber">Ожидает подтверждения сервером</Badge>}
          </div>
          <Button variant="outline" className="mt-4" onClick={restart}><RotateCcw />Пройти заново</Button>
        </div>
      )}
    </div>
  )
}
