import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { cn } from '@/lib/utils'

type InputProps = React.ComponentProps<'input'> & {
  /** Renders the error styling (danger border + ring) and sets aria-invalid. */
  error?: boolean
}

/*
  Input — text/password field. Focus ring uses the accent token; error state
  swaps to the danger token. Password inputs get an inline show/hide toggle.
  Purely presentational: no validation or form logic.
*/
function Input({ className, type = 'text', error, ...props }: InputProps): React.JSX.Element {
  const [reveal, setReveal] = React.useState(false)
  const isPassword = type === 'password'
  const resolvedType = isPassword && reveal ? 'text' : type

  const inputClass = cn(
    'flex h-11 w-full rounded-md border bg-sv-bg px-3 py-1 text-sm text-sv-text shadow-sm outline-none transition placeholder:text-sv-text-faint disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none sm:h-9',
    error
      ? 'border-sv-danger focus-visible:border-sv-danger focus-visible:ring-2 focus-visible:ring-sv-danger focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface'
      : 'border-sv-border focus-visible:border-sv-accent focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface',
    isPassword && 'pr-11',
    className
  )

  const field = (
    <input
      data-slot="input"
      type={resolvedType}
      aria-invalid={error || undefined}
      className={inputClass}
      {...props}
    />
  )

  if (!isPassword) return field

  return (
    <div className="relative">
      {field}
      <button
        type="button"
        tabIndex={0}
        onClick={() => setReveal((v) => !v)}
        aria-label={reveal ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-sv-text-muted outline-none transition hover:text-sv-text focus-visible:text-sv-text focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface motion-reduce:transition-none"
      >
        {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export { Input }
export type { InputProps }
