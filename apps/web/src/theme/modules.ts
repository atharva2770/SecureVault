/*
  Shared module theme list — the single source of truth pairing each document
  module with its accent token (defined in globals.css as --mod-*) and its
  geometric identity primitive (consumed by ModuleHero). Reuse this anywhere
  modules are displayed instead of hardcoding names/colors/backgrounds per page.
*/

export type ModulePatternKind =
  | 'ledger'
  | 'blueprint'
  | 'network'
  | 'hex'
  | 'radar'
  | 'rails'
  | 'spark'
  | 'dots'

export interface ModuleTheme {
  id: string
  label: string
  /** One-line description shown on dashboard tiles. */
  tagline: string
  /** CSS custom property reference, e.g. for inline `style` or arbitrary values. */
  colorVar: string
  /** Repeating SVG identity primitive for the module hero. */
  pattern: ModulePatternKind
}

/** Dashboard tile order — visual only; ids and DB folders stay ours. */
export const MODULE_DISPLAY_ORDER = [
  'engineering',
  'hr',
  'accounts',
  'qa',
  'npd',
  'railway',
  'defence',
  'other'
] as const

export const MODULE_THEMES: ModuleTheme[] = [
  {
    id: 'engineering',
    label: 'Engineering',
    tagline: 'Drawings, control plans & process sheets',
    colorVar: 'var(--mod-engineering)',
    pattern: 'blueprint'
  },
  {
    id: 'hr',
    label: 'Human Resources',
    tagline: 'Personnel files, bonus data & actions',
    colorVar: 'var(--mod-hr)',
    pattern: 'network'
  },
  {
    id: 'accounts',
    label: 'Accounts',
    tagline: 'Balance sheets, GST & statutory bills',
    colorVar: 'var(--mod-accounts)',
    pattern: 'ledger'
  },
  {
    id: 'qa',
    label: 'Quality Assurance',
    tagline: 'Action plans, gauge lists & due tracking',
    colorVar: 'var(--mod-qa)',
    pattern: 'hex'
  },
  {
    id: 'npd',
    label: 'NPD',
    tagline: 'New product development dossiers',
    colorVar: 'var(--mod-npd)',
    pattern: 'spark'
  },
  {
    id: 'railway',
    label: 'Railway Tender',
    tagline: 'Tender documents & submissions',
    colorVar: 'var(--mod-railway)',
    pattern: 'rails'
  },
  {
    id: 'defence',
    label: 'Defence Tender',
    tagline: 'Restricted defence tender records',
    colorVar: 'var(--mod-defence)',
    pattern: 'radar'
  },
  {
    id: 'other',
    label: 'Other',
    tagline: 'Miscellaneous company documents',
    colorVar: 'var(--mod-other)',
    pattern: 'dots'
  }
]

export const MODULE_THEME_BY_ID: Record<string, ModuleTheme> = Object.fromEntries(
  MODULE_THEMES.map((m) => [m.id, m])
)

/**
 * Resolve a module theme from a category name or code (from the DB), tolerating
 * naming variants. Falls back to the neutral "Other" theme.
 */
export function moduleThemeForCategory(nameOrCode: string | null | undefined): ModuleTheme {
  const key = (nameOrCode ?? '').trim().toLowerCase()
  const id =
    key.includes('railway') ? 'railway'
    : key.includes('defence') || key.includes('defense') ? 'defence'
    : key.includes('engineer') || key === 'engg' ? 'engineering'
    : key.includes('account') ? 'accounts'
    : key === 'hr' || key.includes('human') ? 'hr'
    : key === 'qa' || key.includes('quality') ? 'qa'
    : key.includes('npd') || key.includes('product') ? 'npd'
    : 'other'
  return MODULE_THEME_BY_ID[id] ?? MODULE_THEME_BY_ID.other
}
