import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="64" height="64" rx="16" fill="#10B981" />
      <path d="M20 16h12c10 0 16 6.5 16 16s-6 16-16 16H20z" fill="#fff" />
      <path d="M27 23h5c5.5 0 9 3.5 9 9s-3.5 9-9 9h-5z" fill="#10B981" />
    </svg>
  )
}

export function Logo({ dark, className }: { dark?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-tight">
        <p className={cn('text-[15px] font-bold tracking-tight', dark ? 'text-white' : 'text-brand-900')}>Dolce Learn</p>
        <p className={cn('text-[10.5px] font-medium', dark ? 'text-brand-200/70' : 'text-muted')}>Dolce Pharm</p>
      </div>
    </div>
  )
}
