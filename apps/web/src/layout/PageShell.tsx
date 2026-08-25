import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PageShellProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  wide?: boolean
}

export default function PageShell({
  title,
  subtitle,
  children,
  wide = false
}: PageShellProps): React.JSX.Element {
  return (
    <div className="h-full overflow-y-auto [overflow-anchor:none]">
      <div className={cn('mx-auto w-full px-4 py-6 sm:px-6', wide ? 'max-w-6xl' : 'max-w-5xl')}>
        <div className="mb-6">
          <Button asChild size="sm" variant="ghost" className="-ml-2 mb-3 h-8 gap-1.5">
            <Link to="/">
              <ArrowLeft className="size-3.5" />
              Back to vault
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-sv-text">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-sv-text-muted">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </div>
  )
}
