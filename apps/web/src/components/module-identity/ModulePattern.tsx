import { useId } from 'react'

import type { ModulePatternKind } from '@/theme/modules'

import { MODULE_PATTERNS } from './primitives'

interface ModulePatternProps {
  kind: ModulePatternKind
}

/**
 * Full-bleed SVG whose fill is a repeating <pattern> tile. Color and stroke
 * weight inherit from `.module-hero` so dark/light tuning stays in CSS.
 */
export function ModulePattern({ kind }: ModulePatternProps): React.JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const patternId = `mh-${kind}-${uid}`
  const entry = MODULE_PATTERNS[kind] ?? MODULE_PATTERNS.dots
  const { Def } = entry

  return (
    <svg
      className="module-hero-pattern-svg size-full"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      <defs>
        <Def id={patternId} />
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  )
}
