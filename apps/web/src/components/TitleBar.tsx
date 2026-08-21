import { Lock, Shield } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TitleBarProps {
  title?: string
  className?: string
  unlocked?: boolean
  username?: string | null
  onMasterLock?: () => void
}

/**
 * Desktop Electron chrome + mobile-friendly header.
 * Window controls stay desktop-only so the same UI works as a future web app.
 */
export default function TitleBar({
  title = 'SecureVault',
  className,
  unlocked = false,
  username,
  onMasterLock
}: TitleBarProps): React.JSX.Element {
  return (
    <header
      className={cn(
        'titlebar-drag flex h-[var(--sv-titlebar-height)] shrink-0 items-center justify-between gap-2 border-b border-sv-border bg-sv-surface px-2 sm:px-3',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Shield className="size-4 shrink-0 text-sv-accent" aria-hidden />
        <span className="truncate text-sm font-semibold tracking-wide text-sv-text">{title}</span>
        {username ? (
          <span className="hidden truncate text-xs text-sv-text-muted sm:inline">
            · {username}
          </span>
        ) : null}
      </div>

      <div className="titlebar-no-drag flex items-center gap-0.5 sm:gap-1">
        {unlocked && onMasterLock ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-sv-text hover:bg-sv-danger/15 hover:text-sv-danger"
            onClick={onMasterLock}
            aria-label="Master Lock — lock vault"
            title="Master Lock"
          >
            <Lock className="size-3.5" />
            <span className="hidden text-xs font-medium sm:inline">Lock</span>
          </Button>
        ) : null}
      </div>
    </header>
  )
}
