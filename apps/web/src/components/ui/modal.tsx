import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl'
} as const

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  size?: keyof typeof SIZES
  /** Close when the backdrop is clicked. Defaults to true. */
  closeOnBackdrop?: boolean
  /** Hide the visual title (still used as aria-labelledby). */
  titleSrOnly?: boolean
  className?: string
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  )
}

/*
  Modal / Dialog — presentational, controlled via `open` / `onClose`.
  Backdrop blur + token scrim, centered panel, close button, Escape-to-close,
  a self-contained focus trap, body scroll lock, and focus restore on close.
*/
function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  titleSrOnly = false,
  className
}: ModalProps): React.JSX.Element | null {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const restoreFocusRef = React.useRef<HTMLElement | null>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()

  React.useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const initial = getFocusable(panel)[0] ?? panel
    initial?.focus()

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const nodes = getFocusable(panelRef.current)
      if (nodes.length === 0) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
        className="absolute inset-0 bg-[var(--sv-overlay)] backdrop-blur-sm animate-in fade-in-0 duration-200 motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 w-full max-h-[min(100dvh-2rem,40rem)] overflow-y-auto rounded-[calc(var(--sv-radius)+4px)] border border-sv-border bg-sv-surface text-sv-text shadow-modal outline-none animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none',
          SIZES[size],
          className
        )}
      >
        <div className={cn('flex items-start justify-between gap-4 p-5 pb-0', titleSrOnly && 'justify-end')}>
          <div className={cn('min-w-0', titleSrOnly && 'sr-only')}>
            {title ? (
              <h2 id={titleId} className="text-base font-semibold tracking-tight text-sv-text">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-sv-text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mt-1 -mr-1 flex size-11 shrink-0 items-center justify-center rounded-md text-sv-text-muted outline-none transition hover:bg-sv-surface-2 hover:text-sv-text focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface motion-reduce:transition-none sm:size-8"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-sv-border p-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}

export { Modal }
export type { ModalProps }
