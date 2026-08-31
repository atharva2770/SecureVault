import { ArrowUpRight, FolderClosed, Lock } from 'lucide-react'
import { formatContentCounts } from '@securevault/domain'

import { moduleIcon } from '@/components/module-icons'
import { cn } from '@/lib/utils'

export interface ModuleCardProps {
  moduleId: string
  label: string
  tagline?: string
  /** CSS var reference for this module's accent, e.g. 'var(--mod-hr)'. */
  colorVar: string
  folderCount: number
  fileCount: number
  /** Blurred, non-clickable overlay (admin awareness of a restricted module). */
  locked?: boolean
  /** Show the "Restricted" pill (admins only). */
  restricted?: boolean
  onOpen?: () => void
}

export function ModuleCard({
  moduleId,
  label,
  tagline,
  colorVar,
  folderCount,
  fileCount,
  locked = false,
  restricted = false,
  onOpen
}: ModuleCardProps): React.JSX.Element {
  const Icon = moduleIcon(moduleId)
  const interactive = !locked && Boolean(onOpen)

  return (
    <div
      className={cn(
        'mod-tile group relative flex h-full flex-col rounded-3xl p-6 outline-none',
        interactive &&
          'cursor-pointer focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-bg',
        locked && 'select-none'
      )}
      style={{ '--mod': colorVar } as React.CSSProperties}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Open ${label}` : undefined}
      onClick={interactive ? onOpen : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen?.()
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-4">
        <span className="mod-icon grid h-14 w-14 shrink-0 place-items-center rounded-2xl">
          <Icon className="h-7 w-7" />
        </span>
        {restricted ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-sv-danger/40 bg-sv-danger/10 px-2 py-0.5 text-2xs font-semibold text-sv-danger">
            <Lock className="h-3 w-3" />
            Restricted
          </span>
        ) : (
          <ArrowUpRight className="h-5 w-5 text-sv-text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-mod" />
        )}
      </div>
      <h2 className="mt-5 font-display text-2xl font-bold leading-snug break-words sm:text-3xl">{label}</h2>
      {tagline ? <p className="mt-1 text-sm text-sv-text-muted">{tagline}</p> : null}
      <p className="mt-2 text-xs font-medium text-sv-text">
        Enter the exact file name to view the file.
      </p>
      <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-mod">
        <FolderClosed className="h-4 w-4" />
        {formatContentCounts(fileCount, folderCount, 'sub-folder')}
      </div>

      {locked ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-3xl bg-sv-surface/60 p-4 text-center backdrop-blur-sm">
          <div className="flex size-9 items-center justify-center rounded-full bg-sv-surface-2 text-sv-text-muted ring-1 ring-sv-border">
            <Lock className="size-4" />
          </div>
          <p className="text-sm font-medium text-sv-text">Restricted module</p>
          <p className="max-w-[14rem] text-xs text-sv-text-muted">
            Shown for admin awareness. Other roles don&apos;t have access to this module.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export default ModuleCard
