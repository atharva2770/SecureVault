import type { ModuleTheme } from '@/theme/modules'

import { cn } from '@/lib/utils'

import { ModulePattern } from './ModulePattern'
import { patternTile } from './primitives'

export interface ModuleHeroProps {
  theme: ModuleTheme
  children: React.ReactNode
  className?: string
}

/**
 * Shared module-page identity frame: top-left accent glow, one repeating SVG
 * primitive from the theme config, and a content scrim so type stays readable.
 */
export function ModuleHero({ theme, children, className }: ModuleHeroProps): React.JSX.Element {
  const kind = theme.pattern
  const tile = patternTile(kind)

  return (
    <section
      className={cn(
        'module-hero relative overflow-hidden rounded-[calc(var(--sv-radius)+4px)] border border-sv-border bg-sv-surface shadow-card',
        className
      )}
      style={{ '--card-accent': theme.colorVar } as React.CSSProperties}
    >
      <div aria-hidden="true" className="module-hero-glow pointer-events-none absolute inset-0" />

      <div
        aria-hidden="true"
        className="module-hero-pattern pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="module-hero-pattern-shift absolute top-0 left-0 motion-reduce:animate-none"
          style={
            {
              width: `calc(100% + ${tile.w}px)`,
              height: `calc(100% + ${tile.h}px)`,
              '--module-pattern-dx': `${tile.w}px`,
              '--module-pattern-dy': `${tile.h}px`
            } as React.CSSProperties
          }
        >
          <ModulePattern kind={kind} />
        </div>
      </div>

      <div aria-hidden="true" className="module-hero-edge pointer-events-none absolute inset-x-0 top-0 h-px" />

      <div className="relative">
        <div aria-hidden="true" className="module-hero-scrim pointer-events-none absolute inset-0" />
        <div className="relative p-5 sm:p-7">{children}</div>
      </div>
    </section>
  )
}
