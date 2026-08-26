import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

interface BrandMarkProps {
  className?: string
  /** When set, the mark navigates. Omit on the login page so it stays a logo. */
  to?: string
}

export function BrandMark({ className, to }: BrandMarkProps): React.JSX.Element {
  const inner = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-brand text-sv-bg">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight">
        DOC<span className="text-gradient-brand">MAN</span>
      </span>
    </>
  )

  const classes = cn('flex items-center gap-2.5', className)

  if (to) {
    return (
      <Link to={to} className={classes}>
        {inner}
      </Link>
    )
  }

  return <div className={classes}>{inner}</div>
}
