import { memo, useCallback, useMemo, useState } from 'react'
import { Check, ChevronRight, Folder } from 'lucide-react'

import type { FolderDto, FolderGrantDto } from '@securevault/domain'
import { FULL_FOLDER_GRANT, normalizeFolderGrant, compareFoldersByOrder } from '@securevault/domain'
import { cn } from '@/lib/utils'

type RightKey = 'canView' | 'canEdit' | 'canCopy' | 'canDelete'

const COLUMNS: { key: RightKey | 'inherit'; label: string; title: string }[] = [
  { key: 'canView', label: 'View', title: 'Read — open the folder and see files (CanView)' },
  { key: 'canEdit', label: 'Edit', title: 'Create / upload / new folders (CanEdit)' },
  { key: 'canCopy', label: 'Copy', title: 'Copy within the vault (CanCopy)' },
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
    node.children.sort(compareFoldersByOrder)
  }
  return roots.sort(compareFoldersByOrder)
}

function flattenVisible(
  nodes: FolderNode[],
  collapsed: ReadonlySet<string>,
  depth = 0
): { node: FolderNode; depth: number }[] {
  const rows: { node: FolderNode; depth: number }[] = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (node.children.length > 0 && !collapsed.has(node.folderId)) {
      rows.push(...flattenVisible(node.children, collapsed, depth + 1))
    }
  }
  return rows
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
    <label
      className={cn(
        'relative mx-auto flex size-8 items-center justify-center',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer'
      )}
      title={label}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none flex size-5 items-center justify-center rounded-md border transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-sv-accent/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-sv-surface',
          disabled && 'opacity-40',
          checked
            ? 'border-sv-accent bg-sv-accent text-white'
            : 'border-sv-border bg-sv-bg text-transparent'
        )}
      >
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </label>
  )
}

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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  const rows = useMemo(() => flattenVisible(tree, collapsed), [tree, collapsed])
  const rootIds = useMemo(() => tree.map((n) => n.folderId), [tree])

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

  const toggleCollapsed = useCallback((folderId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }, [])

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
      <div className="rounded-xl border border-sv-border bg-sv-bg/40 [overflow-anchor:none]">
        <table className="w-full border-separate border-spacing-0">
          <caption className="sr-only">
            Folder access rights. View, Edit, Copy, Delete, and whether rights inherit to
            subfolders.
          </caption>
          <thead className="sticky top-0 z-10">
            <tr className="bg-sv-surface text-[10px] font-semibold uppercase tracking-wide text-sv-text-muted">
              <th scope="col" className="border-b border-sv-border px-3 py-2 text-left font-semibold">
                Folder
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  title={col.title}
                  className="border-b border-sv-border px-1 py-2 text-center font-semibold"
                  style={{ width: '4.25rem' }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-sv-text-muted">
                  No folders yet.
                </td>
              </tr>
            ) : (
              rows.map(({ node, depth }) => {
                const grant = byId.get(node.folderId)
                const view = lockedAll || Boolean(grant?.canView)
                const edit = lockedAll || Boolean(grant?.canEdit)
                const copy = lockedAll || Boolean(grant?.canCopy)
                const del = lockedAll || Boolean(grant?.canDelete)
                const inherit = lockedAll || (grant ? grant.inherit : false)
                const locked = disabled || lockedAll
                const hasChildren = node.children.length > 0
                const isOpen = !collapsed.has(node.folderId)

                return (
                  <tr
                    key={node.folderId}
                    className={cn(view && !lockedAll && 'bg-sv-accent/10')}
                  >
                    <th
                      scope="row"
                      className="border-b border-sv-border/60 py-1 pr-2 text-left font-normal"
                    >
                      <div
                        className="flex min-w-0 items-center gap-1.5"
                        style={{ paddingLeft: 8 + depth * 16 }}
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            className="inline-flex size-5 shrink-0 items-center justify-center text-sv-text-muted"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
                            onClick={() => toggleCollapsed(node.folderId)}
                          >
                            <ChevronRight
                              className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')}
                            />
                          </button>
                        ) : (
                          <span className="size-5 shrink-0" />
                        )}
                        <Folder
                          className={cn(
                            'size-4 shrink-0',
                            view ? 'text-sv-accent' : 'text-sv-text-muted'
                          )}
                          aria-hidden
                        />
                        <span className="truncate text-sm font-medium text-sv-text">{node.name}</span>
                      </div>
                    </th>
                    <td className="border-b border-sv-border/60">
                      <RightsCheck
                        checked={view}
                        disabled={locked}
                        label={`View — ${node.name}`}
                        onChange={(next) =>
                          patch(
                            node.folderId,
                            next
                              ? { canView: true, inherit: grant?.inherit ?? true }
                              : {
                                  canView: false,
                                  canEdit: false,
                                  canCopy: false,
                                  canDelete: false
                                }
                          )
                        }
                      />
                    </td>
                    <td className="border-b border-sv-border/60">
                      <RightsCheck
                        checked={edit}
                        disabled={locked}
                        label={`Edit — ${node.name}`}
                        onChange={(next) => patch(node.folderId, { canView: true, canEdit: next })}
                      />
                    </td>
                    <td className="border-b border-sv-border/60">
                      <RightsCheck
                        checked={copy}
                        disabled={locked}
                        label={`Copy — ${node.name}`}
                        onChange={(next) => patch(node.folderId, { canView: true, canCopy: next })}
                      />
                    </td>
                    <td className="border-b border-sv-border/60">
                      <RightsCheck
                        checked={del}
                        disabled={locked}
                        label={`Delete — ${node.name}`}
                        onChange={(next) => patch(node.folderId, { canView: true, canDelete: next })}
                      />
                    </td>
                    <td className="border-b border-sv-border/60">
                      <RightsCheck
                        checked={inherit}
                        disabled={locked || !view}
                        label={`Subfolders inherit — ${node.name}`}
                        onChange={(next) => patch(node.folderId, { canView: true, inherit: next })}
                      />
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default memo(FolderAccessPicker)
