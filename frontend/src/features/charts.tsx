/* Общие настройки графиков (Recharts). Категориальная палитра проверена валидатором
   (светлость, хрома, различимость при дальтонизме, контраст): порядок фиксирован, не циклится. */
import type { ReactNode } from 'react'

export const SERIES = ['#047857', '#0284C7', '#D97706', '#7C3AED'] as const
export const STATUS_COLORS: Record<string, string> = {
  completed: '#059669', in_progress: '#0284C7', assigned: '#94A3B8', overdue: '#DC2626',
}
export const axisProps = {
  tick: { fill: '#64748B', fontSize: 12 },
  axisLine: false,
  tickLine: false,
} as const
export const gridProps = { stroke: '#E2E8F0', strokeDasharray: '0', vertical: false } as const

export function ChartTooltip({ active, payload, label, unit = '', labelFormatter }: {
  active?: boolean; payload?: any[]; label?: ReactNode; unit?: string; labelFormatter?: (l: any) => ReactNode
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-[var(--shadow-lift)]">
      <p className="mb-1 font-semibold text-ink">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-semibold text-ink">{p.value}{unit}</span>
        </p>
      ))}
    </div>
  )
}
