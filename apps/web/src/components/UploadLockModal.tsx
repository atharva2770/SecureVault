import { useEffect, useMemo, useState } from 'react'
import { Folder, Loader2, Lock } from 'lucide-react'

import type { FolderDto } from '@securevault/domain'
import { Button } from '@/components/ui/button'
import { folderPathLabel } from '@/lib/folderPath'
import { cn } from '@/lib/utils'

export interface PendingUpload {
  file: File
  originalName: string
}

interface UploadLockModalProps {
  pending: PendingUpload
  folders: FolderDto[]
  defaultFolderId?: string | null
  submitting?: boolean
  onCancel: () => void
  onConfirm: (input: { displayName: string; folderId: string }) => void
}

function defaultDisplayName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '')
  return base.trim() || originalName
}

/**
 * Admin upload: lock the file, then choose any vault folder (all categories / subfolders).
 */
export default function UploadLockModal({
  pending,
  folders,
  defaultFolderId,
  submitting = false,
  onCancel,
  onConfirm
}: UploadLockModalProps): React.JSX.Element {
  const destinations = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.folderId, f]))
    return folders
      .filter((f) => Boolean(f.categoryId) && !f.traverseOnly && f.rights.edit)
      .map((f) => ({ folder: f, label: folderPathLabel(f, byId) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [folders])

  const [displayName, setDisplayName] = useState(defaultDisplayName(pending.originalName))
  const [folderId, setFolderId] = useState(defaultFolderId || destinations[0]?.folder.folderId || '')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    setDisplayName(defaultDisplayName(pending.originalName))
    const fallback = destinations[0]?.folder.folderId || ''
    setFolderId(defaultFolderId && destinations.some((d) => d.folder.folderId === defaultFolderId)
      ? defaultFolderId
      : fallback)
    setFilter('')
  }, [pending, defaultFolderId, destinations])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return destinations
    return destinations.filter((d) => d.label.toLowerCase().includes(q))
  }, [destinations, filter])

  const selected = destinations.find((d) => d.folder.folderId === folderId)
  const canSubmit = displayName.trim().length > 0 && Boolean(folderId) && !submitting

  const passwordHint = useMemo(() => displayName.trim() || '—', [displayName])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface shadow-2xl">
        <div className="border-b border-sv-border px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-sv-accent/15 text-sv-accent">
              <Lock className="size-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-sv-text">Lock file into vault</h2>
              <p className="text-xs text-sv-text-muted">
                Admin: pick any folder, then encrypt with AES-256-GCM
              </p>
            </div>
          </div>
          <p className="mt-3 truncate text-xs text-sv-text-muted" title={pending.originalName}>
            Source: {pending.originalName}
          </p>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-sv-text-muted">File name (also the password)</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent focus:ring-1 focus:ring-sv-accent"
              placeholder="e.g. WFH_July"
              autoFocus
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-sv-text-muted">Destination folder</span>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter folders…"
              className="h-9 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent"
            />
            <div className="max-h-48 overflow-y-auto rounded-lg border border-sv-border">
              {visible.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-sv-text-muted">No folders match.</p>
              ) : (
                visible.map(({ folder, label }) => {
                  const active = folder.folderId === folderId
                  return (
                    <button
                      key={folder.folderId}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition',
                        active
                          ? 'bg-sv-accent/15 text-sv-accent'
                          : 'text-sv-text hover:bg-sv-surface-raised'
                      )}
                      onClick={() => setFolderId(folder.folderId)}
                    >
                      <Folder className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </button>
                  )
                })
              )}
            </div>
            {selected ? (
              <p className="text-[11px] text-sv-text-muted">
                File type: {selected.folder.name}
                {selected.folder.isCategoryRoot ? ' (category root)' : ''}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-sv-border bg-sv-bg/70 px-3 py-2 text-xs text-sv-text-muted">
            Access password will be:{' '}
            <span className="font-semibold text-sv-text">{passwordHint}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-sv-border px-5 py-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => onConfirm({ displayName: displayName.trim(), folderId })}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Encrypt & lock
          </Button>
        </div>
      </div>
    </div>
  )
}
