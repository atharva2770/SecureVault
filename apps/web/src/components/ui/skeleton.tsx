import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

/** Token-driven shimmer block. Shape is supplied by the caller. */
export function Skeleton({ className }: SkeletonProps): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn('sv-skeleton rounded-md motion-reduce:animate-none', className)}
    />
  )
}

export function CardSkeleton({ className }: SkeletonProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'rounded-3xl border border-sv-border bg-sv-surface p-6 shadow-card',
        className
      )}
    >
      <Skeleton className="size-14 rounded-2xl" />
      <Skeleton className="mt-5 h-5 w-2/3" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-6 h-3 w-1/3" />
    </div>
  )
}

export function SubfolderSkeleton({ className }: SkeletonProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-2xl border border-sv-border bg-sv-surface p-5 shadow-card',
        className
      )}
    >
      <Skeleton className="size-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="mt-2 h-3 w-2/5" />
      </div>
    </div>
  )
}

export function TableRowSkeleton({
  columns = 5,
  className
}: SkeletonProps & { columns?: number }): React.JSX.Element {
  return (
    <tr className={cn('border-t border-sv-border', className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="flex items-center gap-3">
            {i === 0 ? <Skeleton className="size-8 shrink-0 rounded-full" /> : null}
            <Skeleton className={i === 0 ? 'h-4 w-28' : i === columns - 1 ? 'ml-auto h-4 w-20' : 'h-4 w-16'} />
          </div>
        </td>
      ))}
    </tr>
  )
}

export function SearchRowSkeleton({ className }: SkeletonProps): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-3 px-3 py-2.5', className)}>
      <Skeleton className="size-4 shrink-0 rounded" />
      <Skeleton className="h-3.5 flex-1" />
      <Skeleton className="h-3 w-12" />
    </div>
  )
}

export function MatrixSkeleton({
  rows = 5,
  cols = 6
}: {
  rows?: number
  cols?: number
}): React.JSX.Element {
  return (
    <div className="overflow-hidden rounded-[var(--sv-radius)] border border-sv-border">
      <div className="grid gap-px bg-sv-border" style={{ gridTemplateColumns: `180px repeat(${cols}, minmax(0,1fr))` }}>
        {Array.from({ length: (rows + 1) * (cols + 1) }).map((_, i) => (
          <div key={i} className="bg-sv-surface px-3 py-3">
            <Skeleton className="mx-auto h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function FileRowSkeleton({ className }: SkeletonProps): React.JSX.Element {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border border-sv-border/70 bg-sv-surface/60 px-3 py-3 md:grid md:grid-cols-[minmax(180px,2fr)_150px_120px_80px_180px] md:rounded-none md:border-0 md:border-b md:border-sv-border/60 md:bg-transparent md:px-4 md:py-2',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Skeleton className="size-8 shrink-0 rounded-md" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="hidden h-3 w-24 md:block" />
      <Skeleton className="hidden h-3 w-16 md:block" />
      <Skeleton className="hidden h-3 w-12 justify-self-end md:block" />
      <Skeleton className="hidden h-7 w-28 justify-self-end md:block" />
    </li>
  )
}
