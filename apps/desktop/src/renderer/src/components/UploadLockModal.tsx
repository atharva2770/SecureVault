import { useEffect, useMemo, useState } from 'react'
import { Loader2, Lock } from 'lucide-react'

import type { FileCategoryDto } from '../../../preload/index.d'
import { Button } from '@/components/ui/button'

export interface PendingUpload {
  sourcePath: string
  originalName: string
}

interface UploadLockModalProps {
  pending: PendingUpload
  categories: FileCategoryDto[]
  defaultCategoryId?: string | null
  submitting?: boolean
  onCancel: () => void
  onConfirm: (input: { displayName: string; categoryId: string }) => void
}

function defaultDisplayName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '')
  return base.trim() || originalName
}

/**
 * Shown after file pick / drop — user sets vault name + file type before encryption.
 * Password policy (v1): password === display name.
 */
export default function UploadLockModal({
  pending,
  categories,
  defaultCategoryId,
  submitting = false,
  onCancel,
  onConfirm
}: UploadLockModalProps): React.JSX.Element {
  const [displayName, setDisplayName] = useState(defaultDisplayName(pending.originalName))
  const [categoryId, setCategoryId] = useState(
    defaultCategoryId || categories[0]?.categoryId || ''
  )

  useEffect(() => {
    setDisplayName(defaultDisplayName(pending.originalName))
    setCategoryId(defaultCategoryId || categories[0]?.categoryId || '')
  }, [pending, categories, defaultCategoryId])

  const canSubmit = displayName.trim().length > 0 && categoryId.length > 0 && !submitting

  const passwordHint = useMemo(() => displayName.trim() || '—', [displayName])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-sv-accent/15 text-sv-accent">
            <Lock className="size-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-sv-text">Lock file into vault</h2>
            <p className="text-xs text-sv-text-muted">Encrypt with AES-256-GCM + file password</p>
          </div>
        </div>

        <p className="mb-3 truncate text-xs text-sv-text-muted" title={pending.sourcePath}>
          Source: {pending.originalName}
        </p>

        <label className="mb-3 block space-y-1.5">
          <span className="text-xs font-medium text-sv-text-muted">File name (also the password)</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent focus:ring-1 focus:ring-sv-accent"
            placeholder="e.g. WFH_July"
            autoFocus
          />
        </label>

        <label className="mb-3 block space-y-1.5">
          <span className="text-xs font-medium text-sv-text-muted">File type</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent focus:ring-1 focus:ring-sv-accent"
          >
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-4 rounded-lg border border-sv-border bg-sv-bg/70 px-3 py-2 text-xs text-sv-text-muted">
          Access password will be:{' '}
          <span className="font-semibold text-sv-text">{passwordHint}</span>
          <br />
          Use this password to open or download the locked file.
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({ displayName: displayName.trim(), categoryId })
            }
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Encrypt & lock
          </Button>
        </div>
      </div>
    </div>
  )
}
