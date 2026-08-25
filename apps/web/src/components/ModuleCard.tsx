import {
  CheckCircle2,
  Folder,
  Layers,
  Lightbulb,
  Lock,
  ShieldHalf,
  Train,
  Users,
  Wallet,
  Wrench,
  type LucideIcon
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const MODULE_ICON: Record<string, LucideIcon> = {
  accounts: Wallet,
  defence: ShieldHalf,
  engineering: Wrench,
  hr: Users,
  npd: Lightbulb,
  other: Layers,
  qa: CheckCircle2,
  railway: Train
}

export interface ModuleCardProps {
  moduleId: string
  label: string
  /** CSS var reference for this module's accent, e.g. 'var(--mod-hr)'. */
  colorVar: string
  folderCount: number
  /** Blurred, non-clickable overlay (admin awareness of a restricted module). */
  locked?: boolean
  /** Show the "Restricted" pill (admins only). */
  restricted?: boolean
  onOpen?: () => void
}

export function ModuleCard({
  moduleId,
  label,
  colorVar,
  folderCount,
  locked = false,
  restricted = false,
  onOpen
}: ModuleCardProps): React.JSX.Element {
  const Icon = MODULE_ICON[moduleId] ?? Folder
  const interactive = !locked && Boolean(onOpen)

  return (
    <Card
      className={cn(
        'group relative overflow-hidden shadow-card outline-none transition-all duration-fast ease-sv motion-reduce:transition-none',
        interactive &&
          'cursor-pointer hover:-translate-y-1 hover:shadow-modal focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-bg motion-reduce:hover:translate-y-0',
        locked && 'select-none'
      )}
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
      {/* Animated corner accent — reveals on hover, consistent across themes */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-0 blur-2xl transition-all duration-med ease-sv group-hover:scale-125 group-hover:opacity-70 motion-reduce:transition-none"
        style={{ backgroundColor: `color-mix(in srgb, ${colorVar} 45%, transparent)` }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 h-16 w-16 origin-top-right scale-0 opacity-0 transition-all duration-med ease-sv group-hover:scale-100 group-hover:opacity-100 motion-reduce:transition-none"
        style={{
          background: `linear-gradient(225deg, color-mix(in srgb, ${colorVar} 55%, transparent), transparent 60%)`
        }}
      />

      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex size-11 items-center justify-center rounded-[calc(var(--sv-radius)-2px)]"
            style={{
              backgroundColor: `color-mix(in srgb, ${colorVar} 16%, transparent)`,
              color: colorVar
            }}
          >
            <Icon className="size-5" />
          </div>
          {restricted ? (
            <Badge variant="danger" size="sm" className="gap-1">
              <Lock className="size-3" />
              Restricted
            </Badge>
          ) : null}
        </div>

        <h3 className="mt-4 truncate text-base font-semibold tracking-tight text-sv-text">
          {label}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-sv-text-muted">
          <Folder className="size-3.5 shrink-0" />
          <span>
            {folderCount} {folderCount === 1 ? 'folder' : 'folders'}
          </span>
        </p>
      </div>

      {/* Locked overlay — blurred, non-clickable, admin-awareness only */}
      {locked ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[var(--sv-radius)] bg-sv-surface/60 p-4 text-center backdrop-blur-sm">
          <div className="flex size-9 items-center justify-center rounded-full bg-sv-surface-2 text-sv-text-muted ring-1 ring-sv-border">
            <Lock className="size-4" />
          </div>
          <p className="text-sm font-medium text-sv-text">Restricted module</p>
          <p className="max-w-[14rem] text-xs text-sv-text-muted">
            Shown for admin awareness. Other roles don&apos;t have access to this module.
          </p>
        </div>
      ) : null}
    </Card>
  )
}

export default ModuleCard
