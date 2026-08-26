import { Lock, Loader2, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface IngestSessionBarProps {
  pendingCount: number
  locking: boolean
  lockCurrent: number
  lockTotal: number
  onAdd: () => void
  onLock: () => void
  onDiscard: () => void
}

/**
 * Admin ingest cycle: stage many files, sort them, then encrypt all at once.
 */
export function IngestSessionBar({
  pendingCount,
  locking,
  lockCurrent,
  lockTotal,
  onAdd,
  onLock,
  onDiscard
}: IngestSessionBarProps): React.JSX.Element {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-sv-accent/30 bg-sv-accent/10 px-3 py-2 sm:px-4">
        <Lock className="size-4 shrink-0 text-sv-accent" />
        <p className="min-w-0 flex-1 text-xs text-sv-text sm:text-sm">
          <span className="font-semibold">Ingest session</span>
          <span className="text-sv-text-muted">
            {' '}
            · {pendingCount} file{pendingCount === 1 ? '' : 's'} waiting to lock. Add, cut, and
            paste into the right folders, then lock the cycle.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button type="button" size="sm" variant="secondary" className="h-8 gap-1" onClick={onAdd} disabled={locking}>
            <Upload className="size-3.5" />
            Add files
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1"
            onClick={onLock}
            disabled={locking || pendingCount === 0}
          >
            {locking ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
            Lock & finish
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1"
            onClick={onDiscard}
            disabled={locking}
            title="Discard staged files and return to modules"
          >
            <X className="size-3.5" />
            Discard
          </Button>
        </div>
      </div>

      {locking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-sv-border bg-sv-surface p-5 shadow-2xl">
            <div className="flex items-center gap-2">
              <Loader2 className="size-5 animate-spin text-sv-accent" />
              <h2 className="text-sm font-semibold text-sv-text">Encrypting & locking files</h2>
            </div>
            <p className="mt-2 text-xs text-sv-text-muted">
              {lockCurrent} of {lockTotal} · AES-256-GCM. Keep this window open.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sv-surface-2">
              <div
                className="h-full bg-sv-accent transition-[width]"
                style={{
                  width: lockTotal ? `${Math.round((lockCurrent / lockTotal) * 100)}%` : '0%'
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default IngestSessionBar
