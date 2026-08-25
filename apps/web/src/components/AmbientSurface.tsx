import { cn } from '@/lib/utils'

interface AmbientSurfaceProps {
  /** Render fixed to the viewport (app-shell default) or absolute to a positioned parent. */
  anchor?: 'fixed' | 'absolute'
  className?: string
}

/**
 * Shared, purely-CSS ambient background for the app shell — a restrained
 * multi-stop accent mesh plus a fine, masked dot-grid. Anchored to the top of
 * the surface so it adds depth without competing with foreground cards. All
 * intensity is theme-tuned in globals.css (light leans far lower + neutral).
 *
 * No raster imagery: gradients and a CSS dot-grid only, so it stays crisp,
 * themeable and cheap. Reused behind the dashboard grid and admin pages.
 */
export function AmbientSurface({ anchor = 'fixed', className }: AmbientSurfaceProps): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'app-ambient pointer-events-none inset-0 -z-10 overflow-hidden',
        anchor === 'fixed' ? 'fixed' : 'absolute',
        className
      )}
    >
      <div className="app-ambient-mesh absolute inset-0" />
      <div className="app-ambient-dots absolute inset-0" />
    </div>
  )
}

export default AmbientSurface
