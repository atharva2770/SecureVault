import { Link, useLocation } from 'react-router-dom'
import { Grid3x3, ScrollText, Users } from 'lucide-react'

import { cn } from '@/lib/utils'

const TABS = [
  { to: '/admin/users', label: 'People', icon: Users },
  { to: '/admin/rights', label: 'Rights matrix', icon: Grid3x3 },
  { to: '/admin/audit', label: 'Access log', icon: ScrollText }
] as const

export function AdminTabs(): React.JSX.Element {
  const { pathname } = useLocation()

  return (
    <div
      role="tablist"
      aria-label="Admin sections"
      className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-sv-border"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.to
        return (
          <Link
            key={tab.to}
            to={tab.to}
            role="tab"
            aria-selected={active}
            className={cn(
              '-mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium outline-none transition duration-fast ease-sv focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-bg motion-reduce:transition-none',
              active
                ? 'border-sv-accent text-sv-text'
                : 'border-transparent text-sv-text-muted hover:text-sv-text'
            )}
          >
            <tab.icon className="size-4" aria-hidden />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
