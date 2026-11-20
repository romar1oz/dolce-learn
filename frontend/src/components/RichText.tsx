/* Безопасный рендер упрощённой разметки (абзацы, **жирный**, списки, ### заголовки).
   HTML не интерпретируется — защита от XSS: весь текст выводится как текстовые узлы React. */
import { Fragment, type ReactNode } from 'react'

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4
    ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>))
}

export function RichText({ text, className }: { text?: string | null; className?: string }) {
  if (!text) return null
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (/^\s*[-•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-•]\s+/, ''))
      blocks.push(<ul key={blocks.length}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>)
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))
      blocks.push(<ol key={blocks.length}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ol>)
      continue
    }
    if (/^#{1,3}\s+/.test(line)) {
      blocks.push(<h3 key={blocks.length}>{inline(line.replace(/^#{1,3}\s+/, ''))}</h3>)
      i++
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*([-•]|\d+[.)]|#{1,3})\s+/.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>)
  }
  return <div className={`prose-lite text-[15px] text-slate-700 ${className || ''}`}>{blocks}</div>
}
