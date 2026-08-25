import type { ModulePatternKind } from '@/theme/modules'

/*
  One geometric primitive per module, drawn as an SVG <pattern> tile.
  Shared grammar: hairline stroke, var(--card-accent) ink, generous negative
  space. Theme opacity / stroke-width live on .module-hero so the same paths
  read on navy and on white.
*/

interface PatternDefProps {
  id: string
}

interface PatternEntry {
  tile: { w: number; h: number }
  Def: (props: PatternDefProps) => React.JSX.Element
}

function Tile({
  id,
  width,
  height,
  children
}: PatternDefProps & { width: number; height: number; children: React.ReactNode }): React.JSX.Element {
  return (
    <pattern
      id={id}
      width={width}
      height={height}
      patternUnits="userSpaceOnUse"
      patternContentUnits="userSpaceOnUse"
      fill="none"
      stroke="var(--card-accent)"
      strokeWidth="var(--module-pattern-stroke)"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </pattern>
  )
}

/** Accounts — ledger ruling with a margin scale and faint numeric ticks. */
function LedgerDef({ id }: PatternDefProps): React.JSX.Element {
  const w = 80
  const h = 48
  const rows = [8, 16, 24, 32, 40, 48]
  return (
    <Tile id={id} width={w} height={h}>
      {rows.map((y) => (
        <line key={y} x1="14" y1={y} x2={w} y2={y} strokeOpacity={y % 16 === 0 ? 0.95 : 0.38} />
      ))}
      <line x1="13" y1="0" x2="13" y2={h} strokeOpacity="0.95" />
      <line x1="14.75" y1="0" x2="14.75" y2={h} strokeOpacity="0.4" />
      <line x1="36" y1="0" x2="36" y2={h} strokeOpacity="0.22" />
      <line x1="56" y1="0" x2="56" y2={h} strokeOpacity="0.22" />
      <line x1="72" y1="0" x2="72" y2={h} strokeOpacity="0.18" />
      {rows.map((y) => (
        <line key={`t-${y}`} x1="10.5" y1={y} x2="13" y2={y} strokeOpacity="0.75" />
      ))}
      <text
        x="2.5"
        y="15.5"
        fill="var(--card-accent)"
        stroke="none"
        fontFamily="var(--font-mono)"
        fontSize="5.5"
        fontWeight="500"
        opacity="0.5"
      >
        10
      </text>
      <text
        x="2.5"
        y="31.5"
        fill="var(--card-accent)"
        stroke="none"
        fontFamily="var(--font-mono)"
        fontSize="5.5"
        fontWeight="500"
        opacity="0.5"
      >
        20
      </text>
      <text
        x="2.5"
        y="47"
        fill="var(--card-accent)"
        stroke="none"
        fontFamily="var(--font-mono)"
        fontSize="5.5"
        fontWeight="500"
        opacity="0.5"
      >
        30
      </text>
    </Tile>
  )
}

/** Engineering — isometric construction grid with occasional dimension ticks. */
function BlueprintDef({ id }: PatternDefProps): React.JSX.Element {
  const s = 36
  const w = s * 2
  const h = s * Math.sqrt(3)
  const mid = h / 2
  return (
    <Tile id={id} width={w} height={h}>
      <line x1="0" y1="0" x2={w} y2="0" strokeOpacity="0.35" />
      <line x1="0" y1={mid} x2={w} y2={mid} strokeOpacity="0.85" />
      <line x1="0" y1="0" x2="0" y2={h} strokeOpacity="0.32" />
      <line x1={s} y1="0" x2={s} y2={h} strokeOpacity="0.32" />
      <line x1="0" y1="0" x2={s} y2={h} strokeOpacity="0.55" />
      <line x1={s} y1="0" x2={w} y2={h} strokeOpacity="0.55" />
      <line x1={s} y1="0" x2="0" y2={h} strokeOpacity="0.55" />
      <line x1={w} y1="0" x2={s} y2={h} strokeOpacity="0.55" />
      <g strokeOpacity="0.9">
        <line x1="14" y1={h - 10} x2="46" y2={h - 10} />
        <line x1="14" y1={h - 12.4} x2="14" y2={h - 7.6} />
        <line x1="46" y1={h - 12.4} x2="46" y2={h - 7.6} />
      </g>
    </Tile>
  )
}

/** HR — abstract node network (people as vertices, no literal figures). */
function NetworkDef({ id }: PatternDefProps): React.JSX.Element {
  const w = 96
  const h = 80
  return (
    <Tile id={id} width={w} height={h}>
      <g strokeOpacity="0.55">
        <line x1="0" y1="36" x2="16" y2="20" />
        <line x1="16" y1="20" x2="48" y2="16" />
        <line x1="48" y1="16" x2="80" y2="28" />
        <line x1="80" y1="28" x2="96" y2="36" />
        <line x1="16" y1="20" x2="48" y2="40" />
        <line x1="48" y1="16" x2="48" y2="40" />
        <line x1="80" y1="28" x2="48" y2="40" />
        <line x1="48" y1="40" x2="64" y2="56" />
        <line x1="48" y1="40" x2="24" y2="58" />
        <line x1="64" y1="56" x2="80" y2="28" />
        <line x1="24" y1="58" x2="16" y2="20" />
        <line x1="24" y1="58" x2="0" y2="36" />
        <line x1="48" y1="16" x2="48" y2="0" />
        <line x1="64" y1="56" x2="48" y2="80" />
        <line x1="24" y1="58" x2="48" y2="80" />
      </g>
      <circle cx="0" cy="36" r="1.7" fill="var(--card-accent)" stroke="none" />
      <circle cx="96" cy="36" r="1.7" fill="var(--card-accent)" stroke="none" />
      <circle cx="16" cy="20" r="2.25" fill="var(--card-accent)" stroke="none" />
      <circle cx="48" cy="16" r="1.55" fill="var(--card-accent)" stroke="none" />
      <circle cx="80" cy="28" r="2.05" fill="var(--card-accent)" stroke="none" />
      <circle cx="48" cy="40" r="1.25" fill="var(--card-accent)" stroke="none" />
      <circle cx="64" cy="56" r="2.45" fill="var(--card-accent)" stroke="none" />
      <circle cx="24" cy="58" r="1.8" fill="var(--card-accent)" stroke="none" />
      <circle cx="48" cy="0" r="1.45" fill="var(--card-accent)" stroke="none" />
      <circle cx="48" cy="80" r="1.45" fill="var(--card-accent)" stroke="none" />
      <circle cx="20" cy="14" r="0.7" fill="var(--card-accent)" stroke="none" opacity="0.55" />
      <circle cx="70" cy="52" r="0.7" fill="var(--card-accent)" stroke="none" opacity="0.55" />
    </Tile>
  )
}

function hexVerts(cx: number, cy: number, r: number): string {
  return [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const a = ((60 * i - 30) * Math.PI) / 180
      return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`
    })
    .join(' ')
}

/** QA — honeycomb lattice (true hex, not 60° stripes). */
function HexDef({ id }: PatternDefProps): React.JSX.Element {
  const r = 18
  const w = r * Math.sqrt(3)
  const h = r * 3
  return (
    <Tile id={id} width={w} height={h}>
      <polygon points={hexVerts(w / 2, r, r)} strokeOpacity="0.85" />
      <polygon points={hexVerts(0, r * 2.5, r)} strokeOpacity="0.85" />
      <polygon points={hexVerts(w, r * 2.5, r)} strokeOpacity="0.85" />
    </Tile>
  )
}

/** Defence Tender — concentric radar rings. No insignia, no chevrons. */
function RadarDef({ id }: PatternDefProps): React.JSX.Element {
  const w = 88
  const c = w / 2
  return (
    <Tile id={id} width={w} height={w}>
      <circle cx={c} cy={c} r="14" strokeOpacity="0.4" />
      <circle cx={c} cy={c} r="26" strokeOpacity="0.7" />
      <circle cx={c} cy={c} r="38" strokeOpacity="0.95" />
      <line x1={c} y1={c} x2={c + 33} y2={c - 19} strokeOpacity="0.35" />
      <line x1={c} y1="6" x2={c} y2="11" strokeOpacity="0.55" />
      <line x1={c} y1={w - 11} x2={c} y2={w - 6} strokeOpacity="0.55" />
      <line x1="6" y1={c} x2="11" y2={c} strokeOpacity="0.55" />
      <line x1={w - 11} y1={c} x2={w - 6} y2={c} strokeOpacity="0.55" />
      <circle cx={c} cy={c} r="1.35" fill="var(--card-accent)" stroke="none" />
    </Tile>
  )
}

/** Railway Tender — dashed rail pairs with a slight perspective taper. */
function RailsDef({ id }: PatternDefProps): React.JSX.Element {
  const w = 96
  const h = 40
  return (
    <Tile id={id} width={w} height={h}>
      <g strokeOpacity="0.4" strokeDasharray="5 9">
        <line x1="0" y1="7" x2={w} y2="5.5" />
        <line x1="0" y1="11.5" x2={w} y2="9.5" />
      </g>
      <g strokeOpacity="0.95" strokeDasharray="11 7">
        <line x1="0" y1="24" x2={w} y2="22" />
        <line x1="0" y1="33" x2={w} y2="30" />
      </g>
      {[8, 32, 56, 80].map((x) => (
        <line
          key={x}
          x1={x}
          y1="24.2"
          x2={x + 2.2}
          y2="32.6"
          strokeOpacity="0.55"
        />
      ))}
    </Tile>
  )
}

function Spark({
  x,
  y,
  s,
  kind
}: {
  x: number
  y: number
  s: number
  kind: 'six' | 'four'
}): React.JSX.Element {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} strokeOpacity="0.9">
      {kind === 'six' ? (
        <>
          <line x1="0" y1="-4.2" x2="0" y2="4.2" />
          <line x1="-3.64" y1="-2.1" x2="3.64" y2="2.1" />
          <line x1="-3.64" y1="2.1" x2="3.64" y2="-2.1" />
        </>
      ) : (
        <>
          <line x1="0" y1="-3.1" x2="0" y2="3.1" />
          <line x1="-3.1" y1="0" x2="3.1" y2="0" />
        </>
      )}
    </g>
  )
}

/** NPD — scattered spark / asterisk motifs (ideation, not a star field). */
function SparkDef({ id }: PatternDefProps): React.JSX.Element {
  const w = 88
  const h = 72
  return (
    <Tile id={id} width={w} height={h}>
      <Spark x={14} y={18} s={1} kind="six" />
      <Spark x={46} y={10} s={0.55} kind="four" />
      <Spark x={72} y={24} s={0.82} kind="six" />
      <Spark x={28} y={48} s={0.7} kind="four" />
      <Spark x={58} y={52} s={1.05} kind="six" />
      <Spark x={80} y={62} s={0.48} kind="four" />
      <Spark x={8} y={64} s={0.6} kind="six" />
      <Spark x={40} y={34} s={0.42} kind="four" />
    </Tile>
  )
}

/** Other — calm, neutral dot grid. */
function DotsDef({ id }: PatternDefProps): React.JSX.Element {
  const s = 22
  return (
    <Tile id={id} width={s} height={s}>
      <circle cx="1.15" cy="1.15" r="1.05" fill="var(--card-accent)" stroke="none" />
    </Tile>
  )
}

export const MODULE_PATTERNS: Record<ModulePatternKind, PatternEntry> = {
  ledger: { tile: { w: 80, h: 48 }, Def: LedgerDef },
  blueprint: { tile: { w: 72, h: 36 * Math.sqrt(3) }, Def: BlueprintDef },
  network: { tile: { w: 96, h: 80 }, Def: NetworkDef },
  hex: { tile: { w: 18 * Math.sqrt(3), h: 54 }, Def: HexDef },
  radar: { tile: { w: 88, h: 88 }, Def: RadarDef },
  rails: { tile: { w: 96, h: 40 }, Def: RailsDef },
  spark: { tile: { w: 88, h: 72 }, Def: SparkDef },
  dots: { tile: { w: 22, h: 22 }, Def: DotsDef }
}

export function patternTile(kind: ModulePatternKind): { w: number; h: number } {
  return MODULE_PATTERNS[kind]?.tile ?? MODULE_PATTERNS.dots.tile
}
