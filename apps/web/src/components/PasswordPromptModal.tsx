import { useState } from 'react'
import { Loader2, Lock } from 'lucide-react'

import type { FileDto } from '@securevault/domain'
import { Button } from '@/components/ui/button'

interface PasswordPromptModalProps {
  file: FileDto
  submitting?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: (password: string) => void
}

export default function PasswordPromptModal({
  file,
  submitting = false,
  error,
  onCancel,
  onConfirm
}: PasswordPromptModalProps): React.JSX.Element {
  const [password, setPassword] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        className="w-full max-w-sm rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm(password)
        }}
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-sv-accent/15 text-sv-accent">
            <Lock className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-sv-text">Enter password to view</h2>
            <p className="truncate text-xs text-sv-text-muted" title={file.displayName}>
              {file.displayName}
            </p>
          </div>
        </div>

        <label className="mb-3 block space-y-1.5">
          <span className="text-xs font-medium text-sv-text-muted">File password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent focus:ring-1 focus:ring-sv-accent"
            placeholder="Same as the file name you set"
            autoFocus
          />
        </label>

        {error ? <p className="mb-3 text-sm text-sv-danger">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!password || submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Unlock & view
          </Button>
        </div>
      </form>
    </div>
  )
}
