import { useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Shortest password the API will accept for a per-file access password. */
const MIN_LENGTH = 8

interface BatchPasswordModalProps {
  folderName: string
  fileCount: number
  onCancel: () => void
  onConfirm: (password: string) => void
}

/**
 * Collects one access password for a whole drop batch.
 *
 * Files land in this category by the thousand, so prompting per file is not
 * workable. Every file in this drop gets the same password; a later drop can use
 * a different one.
 */
export default function BatchPasswordModal({
  folderName,
  fileCount,
  onCancel,
  onConfirm
}: BatchPasswordModalProps): React.JSX.Element {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(): void {
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    onConfirm(password)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        className="w-full max-w-sm rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-sv-accent/15 text-sv-accent">
            <KeyRound className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-sv-text">Set a password for this upload</h2>
            <p className="truncate text-xs text-sv-text-muted" title={folderName}>
              {fileCount === 1 ? '1 file' : `${fileCount} files`} into {folderName}
            </p>
          </div>
        </div>

        <p className="mb-3 rounded-lg border border-sv-border bg-sv-bg/70 px-3 py-2 text-xs text-sv-text-muted">
          This module requires a password to open its documents. The same password applies to
          every file in this upload. It is not the file name, and it cannot be recovered — store
          it in your password manager.
        </p>

        <label className="mb-3 block space-y-1.5">
          <span className="text-xs font-medium text-sv-text-muted">File password</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError(null)
            }}
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            error={Boolean(error)}
            autoFocus
          />
        </label>

        <label className="mb-3 block space-y-1.5">
          <span className="text-xs font-medium text-sv-text-muted">Confirm password</span>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setError(null)
            }}
            autoComplete="new-password"
            error={Boolean(error)}
          />
        </label>

        {error ? <p className="mb-3 text-sm text-sv-danger">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!password || !confirm}>
            <Loader2 className="hidden size-4 animate-spin" />
            Encrypt and upload
          </Button>
        </div>
      </form>
    </div>
  )
}
