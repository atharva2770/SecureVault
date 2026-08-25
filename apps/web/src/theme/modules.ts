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
  /** CSS custom property reference, e.g. for inline `style` or arbitrary values. */
  colorVar: string
  /** Repeating SVG identity primitive for the module hero. */
  pattern: ModulePatternKind
}

export const MODULE_THEMES: ModuleTheme[] = [
  { id: 'railway', label: 'Railway Tender', colorVar: 'var(--mod-railway)', pattern: 'rails' },
  { id: 'defence', label: 'Defence Tender', colorVar: 'var(--mod-defence)', pattern: 'radar' },
  { id: 'engineering', label: 'Engineering', colorVar: 'var(--mod-engineering)', pattern: 'blueprint' },
  { id: 'accounts', label: 'Accounts', colorVar: 'var(--mod-accounts)', pattern: 'ledger' },
  { id: 'hr', label: 'HR', colorVar: 'var(--mod-hr)', pattern: 'network' },
  { id: 'qa', label: 'QA', colorVar: 'var(--mod-qa)', pattern: 'hex' },
  { id: 'npd', label: 'NPD', colorVar: 'var(--mod-npd)', pattern: 'spark' },
  { id: 'other', label: 'Other', colorVar: 'var(--mod-other)', pattern: 'dots' }
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
