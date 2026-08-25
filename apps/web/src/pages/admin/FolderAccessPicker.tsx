import { memo, useCallback, useMemo, useState } from 'react'
import { Check, ChevronRight, Folder } from 'lucide-react'

import type { FolderDto, FolderGrantDto } from '@securevault/domain'
import { FULL_FOLDER_GRANT, normalizeFolderGrant } from '@securevault/domain'
import { cn } from '@/lib/utils'

type RightKey = 'canView' | 'canEdit' | 'canCopy' | 'canDelete'

const COLUMNS: { key: RightKey | 'inherit'; label: string; title: string }[] = [
  { key: 'canView', label: 'View', title: 'Read — open the folder and see files (CanView)' },
  { key: 'canEdit', label: 'Edit', title: 'Create / upload / new folders (CanEdit)' },
  { key: 'canCopy', label: 'Copy', title: 'Copy and download (CanCopy)' },
  { key: 'canDelete', label: 'Delete', title: 'Delete and cut (CanDelete)' },
  { key: 'inherit', label: 'Subfolders', title: 'Same rights apply inside this folder (Inherit)' }
]

interface FolderNode extends FolderDto {
  children: FolderNode[]
}

function buildTree(folders: FolderDto[]): FolderNode[] {
  const map = new Map<string, FolderNode>()
  for (const folder of folders) {
    map.set(folder.folderId, { ...folder, children: [] })
  }
  const roots: FolderNode[] = []
  for (const node of map.values()) {
    if (node.parentFolderId && map.has(node.parentFolderId)) {
      map.get(node.parentFolderId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  for (const node of map.values()) {
    node.children.sort((a, b) => a.name.localeCompare(b.name))
  }
  return roots.sort((a, b) => a.name.localeCompare(b.name))
}

function grantsById(grants: FolderGrantDto[]): Map<string, FolderGrantDto> {
  return new Map(grants.map((g) => [g.folderId, g]))
}

function writeGrant(grants: FolderGrantDto[], next: FolderGrantDto): FolderGrantDto[] {
  const map = grantsById(grants)
  const normalized = normalizeFolderGrant(next)
  if (!normalized) map.delete(next.folderId)
  else map.set(normalized.folderId, normalized)
  return [...map.values()]
}

function RightsCheck({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean
  disabled: boolean
  label: string
  onChange: (next: boolean) => void
}): React.JSX.Element {
  return (
    <label className="inline-flex cursor-pointer items-center justify-center" title={label}>
      <span
        className={cn(
          'flex size-5 items-center justify-center rounded-md border transition-colors',
          disabled && 'opacity-40',
          checked ? 'border-sv-accent bg-sv-accent text-white' : 'border-sv-border bg-sv-bg text-transparent'
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

const FolderRow = memo(function FolderRow({
  node,
  depth,
  byId,
  disabled,
  lockedAll,
  onPatch
}: {
  node: FolderNode
  depth: number
  byId: Map<string, FolderGrantDto>
  disabled: boolean
  lockedAll: boolean
  onPatch: (folderId: string, patch: Partial<FolderGrantDto>) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const grant = byId.get(node.folderId)
  const view = lockedAll || Boolean(grant?.canView)
  const edit = lockedAll || Boolean(grant?.canEdit)
  const copy = lockedAll || Boolean(grant?.canCopy)
  const del = lockedAll || Boolean(grant?.canDelete)
  const inherit = lockedAll || (grant ? grant.inherit : false)
  const locked = disabled || lockedAll

  return (
    <div>
      <div
        className={cn(
          'grid min-h-10 items-center gap-2 rounded-lg py-1.5 pr-2 transition-colors',
          'grid-cols-[minmax(0,1fr)_repeat(5,minmax(3.25rem,auto))]',
          view && !lockedAll && 'bg-sv-accent/10'
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: 8 + depth * 16 }}>
          {node.children.length > 0 ? (
            <button
              type="button"
              className="inline-flex size-5 shrink-0 items-center justify-center text-sv-text-muted"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Collapse' : 'Expand'}
            >
              <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
            </button>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <Folder className={cn('size-4 shrink-0', view ? 'text-sv-accent' : 'text-sv-text-muted')} />
          <span className="truncate text-sm text-sv-text">{node.name}</span>
        </div>
        <RightsCheck
          checked={view}
          disabled={locked}
          label="View"
          onChange={(next) =>
            onPatch(
              node.folderId,
              next
                ? { canView: true, inherit: grant?.inherit ?? true }
                : { canView: false, canEdit: false, canCopy: false, canDelete: false }
            )
          }
        />
        <RightsCheck
          checked={edit}
          disabled={locked}
          label="Edit"
          onChange={(next) => onPatch(node.folderId, { canView: true, canEdit: next })}
        />
        <RightsCheck
          checked={copy}
          disabled={locked}
          label="Copy"
          onChange={(next) => onPatch(node.folderId, { canView: true, canCopy: next })}
        />
        <RightsCheck
          checked={del}
          disabled={locked}
          label="Delete"
          onChange={(next) => onPatch(node.folderId, { canView: true, canDelete: next })}
        />
        <RightsCheck
          checked={inherit}
          disabled={locked || !view}
          label="Subfolders"
          onChange={(next) => onPatch(node.folderId, { canView: true, inherit: next })}
        />
      </div>
      {open
        ? node.children.map((child) => (
            <FolderRow
              key={child.folderId}
              node={child}
              depth={depth + 1}
              byId={byId}
              disabled={disabled}
              lockedAll={lockedAll}
              onPatch={onPatch}
            />
          ))
        : null}
    </div>
  )
})

interface FolderAccessPickerProps {
  folders: FolderDto[]
  grants: FolderGrantDto[]
  onChange: (grants: FolderGrantDto[]) => void
  disabled?: boolean
  lockedAll?: boolean
}

function FolderAccessPicker({
  folders,
  grants,
  onChange,
  disabled = false,
  lockedAll = false
}: FolderAccessPickerProps): React.JSX.Element {
  const tree = useMemo(() => buildTree(folders), [folders])
  const byId = useMemo(() => grantsById(grants), [grants])

  const patch = useCallback(
    (folderId: string, next: Partial<FolderGrantDto>) => {
      const current = byId.get(folderId)
      const merged: FolderGrantDto = {
        folderId,
        canView: next.canView ?? current?.canView ?? false,
        canEdit: next.canEdit ?? current?.canEdit ?? false,
        canCopy: next.canCopy ?? current?.canCopy ?? false,
        canDelete: next.canDelete ?? current?.canDelete ?? false,
        inherit: next.inherit ?? current?.inherit ?? true
      }
      onChange(writeGrant(grants, merged))
    },
    [byId, grants, onChange]
  )

  const rootIds = useMemo(() => tree.map((n) => n.folderId), [tree])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || lockedAll}
          className="rounded-md px-2 py-1 text-xs font-medium text-sv-accent transition-colors hover:bg-sv-accent/10 disabled:opacity-40"
          onClick={() => onChange(rootIds.map((folderId) => ({ folderId, ...FULL_FOLDER_GRANT })))}
        >
          Full access on every category
        </button>
        <button
          type="button"
          disabled={disabled || lockedAll || grants.length === 0}
          className="rounded-md px-2 py-1 text-xs font-medium text-sv-text-muted transition-colors hover:bg-sv-surface-raised disabled:opacity-40"
          onClick={() => onChange([])}
        >
          Clear all
        </button>
      </div>
      <div className="max-h-[min(480px,55vh)] overflow-auto rounded-xl border border-sv-border bg-sv-bg/40">
        <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_repeat(5,minmax(3.25rem,auto))] items-center gap-2 border-b border-sv-border bg-sv-surface px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-sv-text-muted">
          <span className="pl-2">Folder</span>
          {COLUMNS.map((col) => (
            <span key={col.key} className="text-center" title={col.title}>
              {col.label}
            </span>
          ))}
        </div>
        <div className="p-1.5">
          {tree.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-sv-text-muted">No folders yet.</p>
          ) : (
            tree.map((node) => (
              <FolderRow
                key={node.folderId}
                node={node}
                depth={0}
                byId={byId}
                disabled={disabled}
                lockedAll={lockedAll}
                onPatch={patch}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(FolderAccessPicker)
