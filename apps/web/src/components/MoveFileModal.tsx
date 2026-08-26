import { useMemo, useState } from 'react'
import { ChevronRight, Folder, Loader2 } from 'lucide-react'

import type { FileDto, FolderDto } from '@securevault/domain'
import { Button } from '@/components/ui/button'
import { folderPathLabel } from '@/lib/folderPath'
import { cn } from '@/lib/utils'

interface MoveFileModalProps {
  file: FileDto
  folders: FolderDto[]
  currentFolderId: string | null
  allowAnyFolder?: boolean
  submitting?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: (targetFolderId: string) => void
}

export default function MoveFileModal({
  file,
  folders,
  currentFolderId,
  allowAnyFolder = false,
  submitting = false,
  error,
  onCancel,
  onConfirm
}: MoveFileModalProps): React.JSX.Element {
  const destinations = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.folderId, f]))
    return folders
        .filter(
          (f) =>
            (allowAnyFolder || f.categoryId === file.categoryId) &&
            f.folderId !== currentFolderId &&
            f.rights.edit &&
            !f.traverseOnly
        )
      .map((f) => ({
        folder: f,
        label: folderPathLabel(f, byId)
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [folders, file.categoryId, currentFolderId, allowAnyFolder])

  const [selectedId, setSelectedId] = useState(destinations[0]?.folder.folderId ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface shadow-2xl">
        <div className="border-b border-sv-border px-5 py-4">
          <h2 className="text-base font-semibold text-sv-text">Move to folder</h2>
          <p className="mt-0.5 truncate text-xs text-sv-text-muted" title={file.displayName}>
            {file.displayName}
          </p>
        </div>

        <div className="max-h-72 overflow-y-auto p-2">
          {destinations.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-sv-text-muted">
              {allowAnyFolder
                ? 'No other folders available.'
                : 'No other folders in this category. Create a subfolder first.'}
            </p>
          ) : (
            destinations.map(({ folder, label }) => {
              const selected = selectedId === folder.folderId
              return (
                <button
                  key={folder.folderId}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition',
                    selected
                      ? 'bg-sv-accent/15 text-sv-accent'
                      : 'text-sv-text hover:bg-sv-surface-raised'
                  )}
                  onClick={() => setSelectedId(folder.folderId)}
                  onDoubleClick={() => onConfirm(folder.folderId)}
                >
                  <Folder className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {folder.isCategoryRoot ? (
                    <span className="text-[10px] uppercase tracking-wide text-sv-text-muted">
                      Root
                    </span>
                  ) : (
                    <ChevronRight className="size-3.5 text-sv-text-muted" />
                  )}
                </button>
              )
            })
          )}
        </div>

        {error ? <p className="px-5 pb-2 text-sm text-sv-danger">{error}</p> : null}

        <div className="flex justify-end gap-2 border-t border-sv-border px-5 py-3">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedId || submitting || destinations.length === 0}
            onClick={() => onConfirm(selectedId)}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Move here
          </Button>
        </div>
      </div>
    </div>
  )
}
