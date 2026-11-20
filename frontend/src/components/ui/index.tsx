/* Набор базовых UI-компонентов в стиле shadcn/ui (Radix + Tailwind + cva). */
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand-900 text-white shadow-sm hover:bg-brand-800',
        accent: 'bg-brand-500 text-white shadow-sm hover:bg-brand-600',
        secondary: 'bg-brand-100 text-brand-900 hover:bg-brand-200',
        outline: 'border border-line bg-white text-ink hover:bg-slate-50',
        ghost: 'text-ink hover:bg-slate-100',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        link: 'text-brand-800 underline-offset-4 hover:underline px-0',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-12 px-6 text-base rounded-2xl',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
        {asChild ? children : (<>{loading && <Loader2 className="animate-spin" />}{children}</>)}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...p} />
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 p-5 pb-3', className)} {...p} />
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold text-ink', className)} {...p} />
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...p} />
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(
      'flex h-10 w-full rounded-xl border border-line bg-white px-3 text-sm placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-50 disabled:opacity-70',
      className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(
      'flex min-h-[90px] w-full rounded-xl border border-line bg-white px-3 py-2 text-sm placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100',
      className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(
      'h-10 w-full appearance-none rounded-xl border border-line bg-white bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%2364748b%27 stroke-width=%272%27%3E%3Cpath d=%27M4 6l4 4 4-4%27/%3E%3C/svg%3E")] bg-[position:right_10px_center] bg-no-repeat pl-3 pr-9 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100',
      className)} {...props}>{children}</select>
  ),
)
Select.displayName = 'Select'

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-ink', className)} {...p} />
}

export function Field({ label, error, hint, children, className }: {
  label?: React.ReactNode; error?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-slate-100 text-slate-700',
      green: 'bg-brand-100 text-brand-900',
      amber: 'bg-amber-100 text-amber-800',
      red: 'bg-red-100 text-red-700',
      blue: 'bg-sky-100 text-sky-800',
      dark: 'bg-brand-900 text-white',
      outline: 'border border-line text-muted',
    },
  },
  defaultVariants: { variant: 'default' },
})
export function Badge({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...p} />
}

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-brand-100', className)} role="progressbar"
         aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full bg-brand-500 transition-all duration-500', barClassName)} style={{ width: `${v}%` }} />
    </div>
  )
}

export function ProgressRing({ value, size = 56, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-brand-100" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" strokeLinecap="round"
                className="text-brand-500 transition-all duration-700" strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold">{children ?? `${Math.round(v)}%`}</div>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-200/70', className)} />
}

export function EmptyState({ icon: Icon, title, text, action }: {
  icon?: React.ComponentType<{ className?: string }>; title: string; text?: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      {Icon && <div className="mb-3 rounded-2xl bg-brand-50 p-3 text-brand-800"><Icon className="h-6 w-6" /></div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Switch({ checked, onCheckedChange, id, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; disabled?: boolean }) {
  return (
    <SwitchPrimitive.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-brand-500 disabled:opacity-50">
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  )
}

export function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId()
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-3 py-2.5">
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/* ---------- Dialog ---------- */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({ className, children, title, description, wide }: {
  className?: string; children: React.ReactNode; title: string; description?: string; wide?: boolean
}) {
  const t = useT()
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <DialogPrimitive.Content className={cn(
        'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-[var(--shadow-lift)] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl',
        wide ? 'sm:max-w-3xl' : 'sm:max-w-lg', className)}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
              : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="rounded-lg p-1.5 text-muted hover:bg-slate-100" aria-label={t('common.close')}><X className="h-5 w-5" /></DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/* ---------- Tabs ---------- */
export const Tabs = TabsPrimitive.Root
export function TabsList({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('scrollbar-none inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1', className)} {...p} />
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn('rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted transition data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm', className)} {...p} />
}
export const TabsContent = TabsPrimitive.Content

/* ---------- Table ---------- */
export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <div className="overflow-x-auto"><table className={cn('w-full text-sm', className)} {...p} /></div>
}
export function Th({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('border-b border-line bg-slate-50/80 px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-muted uppercase', className)} {...p} />
}
export function Td({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line/60 px-3 py-2.5 align-middle', className)} {...p} />
}

export function PageHeader({ title, subtitle, actions, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ icon: Icon, label, value, hint, tone = 'green' }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'blue' | 'slate'
}) {
  const tones = {
    green: 'bg-brand-50 text-brand-800', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-600',
    blue: 'bg-sky-50 text-sky-700', slate: 'bg-slate-100 text-slate-700',
  }
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
        </div>
        <div className={cn('rounded-xl p-2.5', tones[tone])}><Icon className="h-5 w-5" /></div>
      </div>
    </Card>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />
}

export function LoadingBlock({ text }: { text?: string }) {
  const t = useT()
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted"><Spinner />{text ?? t('common.loading')}</div>
}

export function ErrorBlock({ error, retry }: { error: unknown; retry?: () => void }) {
  const t = useT()
  const msg = error instanceof Error ? error.message : t('common.loadError')
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      <p className="font-medium">{t('common.error')}</p>
      <p className="mt-1">{msg}</p>
      {retry && <Button size="sm" variant="outline" className="mt-3" onClick={retry}>{t('common.retry')}</Button>}
    </div>
  )
}
