import * as React from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastOptions {
  variant?: ToastVariant
  title: string
  description?: string
  /** Auto-dismiss delay in ms. 0 disables auto-dismiss. */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: string
}

const VARIANT_ICON: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info
}

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  success: 'text-sv-success',
  error: 'text-sv-danger',
  info: 'text-sv-accent'
}

/* ----------------------------- Presentational ----------------------------- */

interface ToastProps {
  variant?: ToastVariant
  title: string
  description?: string
  onClose?: () => void
  className?: string
}

function Toast({
  variant = 'info',
  title,
  description,
  onClose,
  className
}: ToastProps): React.JSX.Element {
  const Icon = VARIANT_ICON[variant]
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex w-full items-start gap-3 rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface-2 p-3 text-sv-text shadow-modal animate-in fade-in-0 slide-in-from-right-5 duration-200 motion-reduce:animate-none',
        className
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', VARIANT_ACCENT[variant])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-sv-text">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-sv-text-muted">{description}</p> : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="-mt-0.5 -mr-0.5 flex size-11 shrink-0 items-center justify-center rounded-md text-sv-text-muted outline-none transition hover:bg-sv-surface-raised hover:text-sv-text focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface-2 motion-reduce:transition-none sm:size-6"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------- Provider -------------------------------- */

interface ToastContextValue {
  toast: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

function ToastProvider({
  children,
  duration = 4000
}: {
  children: React.ReactNode
  duration?: number
}): React.JSX.Element {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const timers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2)
      const item: ToastItem = { id, variant: 'info', duration, ...options }
      setToasts((current) => [...current, item])
      if (item.duration && item.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), item.duration)
        )
      }
      return id
    },
    [dismiss, duration]
  )

  React.useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach(clearTimeout)
      map.clear()
    }
  }, [])

  const value = React.useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}): React.JSX.Element | null {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          variant={t.variant}
          title={t.title}
          description={t.description}
          onClose={() => onDismiss(t.id)}
        />
      ))}
    </div>,
    document.body
  )
}

function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

export { Toast, ToastProvider, useToast }
export type { ToastOptions, ToastProps, ToastVariant }
