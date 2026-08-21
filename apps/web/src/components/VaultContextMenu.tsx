import { ClipboardPaste, Copy, Scissors, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'

export type ContextMenuTarget =
  | { kind: 'file'; fileId: string }
  | { kind: 'folder'; folderId: string; deletable: boolean }
  | { kind: 'background' }

export interface VaultContextMenuState {
  x: number
  y: number
  target: ContextMenuTarget
}

interface VaultContextMenuProps {
  state: VaultContextMenuState
  canPaste: boolean
  onClose: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
}

function MenuItem({
  label,
  icon,
  disabled,
  danger,
  onClick
}: {
  label: string
  icon: React.ReactNode
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm transition md:py-2',
        disabled
          ? 'cursor-not-allowed text-sv-text-muted/50'
          : danger
            ? 'text-sv-danger hover:bg-sv-danger/10'
            : 'text-sv-text hover:bg-sv-surface-raised'
      )}
      onClick={() => {
        if (!disabled) onClick()
      }}
    >
      <span className="inline-flex size-4 shrink-0 items-center justify-center opacity-80">
        {icon}
      </span>
      {label}
    </button>
  )
}

export default function VaultContextMenu({
  state,
  canPaste,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onDelete
}: VaultContextMenuProps): React.JSX.Element {
  const isFile = state.target.kind === 'file'
  const canDelete =
    state.target.kind === 'file' ||
    (state.target.kind === 'folder' && state.target.deletable)

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] cursor-default bg-transparent"
        aria-label="Close menu"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-[61] min-w-[180px] rounded-lg border border-sv-border bg-sv-surface p-1.5 shadow-2xl"
        style={{
          left: Math.min(state.x, window.innerWidth - 200),
          top: Math.min(state.y, window.innerHeight - 220)
        }}
        role="menu"
      >
        {isFile ? (
          <>
            <MenuItem label="Cut" icon={<Scissors className="size-3.5" />} onClick={onCut} />
            <MenuItem label="Copy" icon={<Copy className="size-3.5" />} onClick={onCopy} />
          </>
        ) : null}
        <MenuItem
          label="Paste"
          icon={<ClipboardPaste className="size-3.5" />}
          disabled={!canPaste}
          onClick={onPaste}
        />
        <div className="my-1 border-t border-sv-border" />
        <MenuItem
          label="Delete"
          icon={<Trash2 className="size-3.5" />}
          disabled={!canDelete}
          danger
          onClick={onDelete}
        />
      </div>
    </>
  )
}
