import { useId } from 'react'

import type { ModulePatternKind } from '@/theme/modules'

/** Module-flavoured decorative backdrop. Purely presentational. */
export function ModuleBackdrop({ pattern }: { pattern: ModulePatternKind }): React.JSX.Element {
  const uid = useId().replace(/:/g, '')
  const patternId = `mod-bg-${pattern}-${uid}`

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <svg className="h-full w-full opacity-[0.16]" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id={patternId} width="120" height="120" patternUnits="userSpaceOnUse">
            {pattern === 'blueprint' ? (
              <g stroke="currentColor" fill="none" strokeWidth="1" className="text-mod">
                <path d="M0 30h120M0 90h120M30 0v120M90 0v120" />
                <circle cx="60" cy="60" r="18" />
                <path d="M42 60h36M60 42v36" strokeDasharray="4 4" />
              </g>
            ) : null}
            {pattern === 'ledger' ? (
              <g stroke="currentColor" strokeWidth="1" className="text-mod">
                <path d="M0 24h120M0 48h120M0 72h120M0 96h120" />
                <path d="M20 0v120" strokeDasharray="6 6" />
              </g>
            ) : null}
            {pattern === 'network' ? (
              <g fill="currentColor" className="text-mod">
                <circle cx="30" cy="34" r="9" />
                <path d="M14 62a16 16 0 0 1 32 0z" />
                <circle cx="90" cy="86" r="9" />
                <path d="M74 114a16 16 0 0 1 32 0z" />
              </g>
            ) : null}
            {pattern === 'hex' ? (
              <g stroke="currentColor" fill="none" strokeWidth="1.2" className="text-mod">
                <rect x="12" y="12" width="40" height="40" rx="6" />
                <rect x="68" y="68" width="40" height="40" rx="6" />
                <path d="M18 32l8 8 14-16" />
              </g>
            ) : null}
            {pattern === 'spark' ? (
              <g stroke="currentColor" fill="none" strokeWidth="1.2" className="text-mod">
                <path d="M60 20v18M60 82v18M20 60h18M82 60h18M32 32l13 13M88 88l-13-13M88 32L75 45M32 88l13-13" />
                <circle cx="60" cy="60" r="12" />
              </g>
            ) : null}
            {pattern === 'rails' ? (
              <g stroke="currentColor" strokeWidth="1.4" className="text-mod" fill="none">
                <path d="M36 0v120M84 0v120" />
                <path d="M36 20h48M36 50h48M36 80h48M36 110h48" />
              </g>
            ) : null}
            {pattern === 'radar' ? (
              <g stroke="currentColor" strokeWidth="1.2" fill="none" className="text-mod">
                <path d="M60 18l30 12v26c0 22-14 34-30 44-16-10-30-22-30-44V30z" />
              </g>
            ) : null}
            {pattern === 'dots' ? (
              <g fill="currentColor" className="text-mod">
                <circle cx="20" cy="20" r="3" />
                <circle cx="80" cy="50" r="3" />
                <circle cx="45" cy="95" r="3" />
              </g>
            ) : null}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </div>
  )
}
