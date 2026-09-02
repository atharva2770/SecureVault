import { useEffect, useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'

import type { FileDto } from '@securevault/domain'
import { Button } from '@/components/ui/button'

interface RenameFileModalProps {
  file: FileDto
  submitting?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: (displayName: string) => void
}

export default function RenameFileModal({
  file,
  submitting = false,
  error,
  onCancel,
  onConfirm
}: RenameFileModalProps): React.JSX.Element {
  const [displayName, setDisplayName] = useState(file.displayName)

  useEffect(() => {
    setDisplayName(file.displayName)
  }, [file.fileId, file.displayName])

  const trimmed = displayName.trim()
  const canSubmit = trimmed.length > 0 && trimmed !== file.displayName && !submitting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-sv-accent/15 text-sv-accent">
            <Pencil className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-sv-text">Rename file</h2>
            <p className="truncate text-xs text-sv-text-muted" title={file.originalFileName}>
              {file.originalFileName}
            </p>
          </div>
        </div>

        <label className="mb-3 block space-y-1.5">
          <span className="text-xs font-medium text-sv-text-muted">New name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) onConfirm(trimmed)
              if (e.key === 'Escape') onCancel()
            }}
            className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent focus:ring-1 focus:ring-sv-accent"
            autoFocus
          />
        </label>

        <div className="mb-3 rounded-lg border border-sv-border bg-sv-bg/70 px-3 py-2 text-xs text-sv-text-muted">
          Renaming does not change the file password.
        </div>

        {error ? <p className="mb-3 text-xs text-sv-danger">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => onConfirm(trimmed)}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Rename
          </Button>
        </div>
      </div>
    </div>
  )
}
