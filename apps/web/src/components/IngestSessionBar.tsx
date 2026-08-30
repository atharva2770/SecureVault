import { Check, Loader2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface IngestSessionBarProps {
  encryptingCount: number
  errorCount: number
  onAdd: () => void
  onDone: () => void
}

/**
 * Admin ingest session: files encrypt as they are added. Done returns to modules.
 */
export function IngestSessionBar({
  encryptingCount,
  errorCount,
  onAdd,
  onDone
}: IngestSessionBarProps): React.JSX.Element {
  const busy = encryptingCount > 0
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-sv-accent/30 bg-sv-accent/10 px-3 py-2 sm:px-4">
      {busy ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-sv-accent" />
      ) : (
        <Check className="size-4 shrink-0 text-sv-accent" />
      )}
      <p className="min-w-0 flex-1 text-xs text-sv-text sm:text-sm">
        <span className="font-semibold">Manage files</span>
        <span className="text-sv-text-muted">
          {busy
            ? ` · encrypting ${encryptingCount} file${encryptingCount === 1 ? '' : 's'} now. They lock as they land.`
            : errorCount
              ? ` · ${errorCount} failed. Retry or remove them, then Done.`
              : ' · add, cut, and paste freely. Each new file is encrypted immediately.'}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" size="sm" variant="secondary" className="h-8 gap-1" onClick={onAdd}>
          <Upload className="size-3.5" />
          Add files
        </Button>
        <Button type="button" size="sm" className="h-8 gap-1" onClick={onDone} disabled={busy}>
          Done
        </Button>
      </div>
    </div>
  )
}

export default IngestSessionBar
