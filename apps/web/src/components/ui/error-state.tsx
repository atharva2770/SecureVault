import { CircleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Couldn’t load this',
  description = 'Something went wrong on the way. Your data is safe — try again in a moment.',
  onRetry,
  className
}: ErrorStateProps): React.JSX.Element {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-4 py-16 text-center',
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full border border-sv-border bg-sv-surface-2 text-sv-text-muted shadow-card">
        <CircleAlert className="size-6" aria-hidden="true" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-sv-text">{title}</p>
        <p className="mt-1 text-sm text-sv-text-muted">{description}</p>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}
