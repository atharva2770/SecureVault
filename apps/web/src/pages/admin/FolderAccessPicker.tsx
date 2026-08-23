import { memo, useCallback, useMemo, useState } from 'react'
import { Check, ChevronRight, Folder } from 'lucide-react'

import type { FolderDto } from '@securevault/domain'
import { cn } from '@/lib/utils'

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

function descendantIds(node: FolderNode): string[] {
  return node.children.flatMap((child) => [child.folderId, ...descendantIds(child)])
}

const FolderRow = memo(function FolderRow({
  node,
  depth,
  selected,
  inherited,
  disabled,
  onToggle
}: {
  node: FolderNode
  depth: number
  selected: Set<string>
  inherited: boolean
  disabled: boolean
  onToggle: (folderId: string, next: boolean) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const checked = inherited || selected.has(node.folderId)
  const locked = disabled || inherited

  return (
    <div>
      <label
        className={cn(
          'flex min-h-10 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
          locked ? 'cursor-default' : 'cursor-pointer hover:bg-sv-surface-raised',
          checked && !inherited && 'bg-sv-accent/10'
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
            checked
              ? 'border-sv-accent bg-sv-accent text-white'
              : 'border-sv-border bg-sv-bg text-transparent'
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={locked}
          onChange={(e) => onToggle(node.folderId, e.target.checked)}
        />
        {node.children.length > 0 ? (
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center text-sv-text-muted"
            onClick={(e) => {
              e.preventDefault()
              setOpen((v) => !v)
            }}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-5" />
        )}
        <Folder
          className={cn('size-4 shrink-0', checked ? 'text-sv-accent' : 'text-sv-text-muted')}
        />
        <span className="min-w-0 flex-1 truncate text-sm text-sv-text">{node.name}</span>
        {inherited ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-sv-text-muted">
            Included
          </span>
        ) : null}
      </label>
      {open
        ? node.children.map((child) => (
            <FolderRow
              key={child.folderId}
              node={child}
              depth={depth + 1}
              selected={selected}
              inherited={checked}
              disabled={disabled}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  )
})

interface FolderAccessPickerProps {
  folders: FolderDto[]
  selectedIds: string[]
  onChange: (folderIds: string[]) => void
  disabled?: boolean
  lockedAll?: boolean
}

function FolderAccessPicker({
  folders,
  selectedIds,
  onChange,
  disabled = false,
  lockedAll = false
}: FolderAccessPickerProps): React.JSX.Element {
  const tree = useMemo(() => buildTree(folders), [folders])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const lockedSelected = useMemo(
    () => (lockedAll ? new Set(folders.map((f) => f.folderId)) : selected),
    [folders, lockedAll, selected]
  )
  const nodesById = useMemo(() => {
    const map = new Map<string, FolderNode>()
    const walk = (node: FolderNode): void => {
      map.set(node.folderId, node)
      node.children.forEach(walk)
    }
    tree.forEach(walk)
    return map
  }, [tree])

  const toggle = useCallback(
    (folderId: string, next: boolean) => {
      const node = nodesById.get(folderId)
      if (!node) return
      const nextIds = new Set(selectedIds)
      if (next) {
        nextIds.add(folderId)
        for (const id of descendantIds(node)) nextIds.delete(id)
      } else {
        nextIds.delete(folderId)
      }
      onChange([...nextIds])
    },
    [nodesById, onChange, selectedIds]
  )

  const rootIds = useMemo(() => tree.map((n) => n.folderId), [tree])
  const allRootsSelected = rootIds.length > 0 && rootIds.every((id) => selected.has(id))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || lockedAll}
          className="rounded-md px-2 py-1 text-xs font-medium text-sv-accent transition-colors hover:bg-sv-accent/10 disabled:opacity-40"
          onClick={() => onChange(rootIds)}
        >
          {allRootsSelected ? 'All folders ticked' : 'Tick every folder'}
        </button>
        <button
          type="button"
          disabled={disabled || lockedAll || selectedIds.length === 0}
          className="rounded-md px-2 py-1 text-xs font-medium text-sv-text-muted transition-colors hover:bg-sv-surface-raised disabled:opacity-40"
          onClick={() => onChange([])}
        >
          Clear all
        </button>
      </div>
      <div className="max-h-[min(420px,50vh)] overflow-y-auto rounded-xl border border-sv-border bg-sv-bg/40 p-1.5">
        {tree.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-sv-text-muted">No folders yet.</p>
        ) : (
          tree.map((node) => (
            <FolderRow
              key={node.folderId}
              node={node}
              depth={0}
              selected={lockedSelected}
              inherited={false}
              disabled={disabled || lockedAll}
              onToggle={toggle}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default memo(FolderAccessPicker)
