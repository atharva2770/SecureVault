import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-16 text-center',
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full border border-sv-border bg-sv-surface-2 text-sv-text-muted shadow-card">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-sv-text">{title}</p>
        <p className="mt-1 text-sm text-sv-text-muted">{description}</p>
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
