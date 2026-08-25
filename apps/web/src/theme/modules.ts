/*
  Shared module theme list — the single source of truth pairing each document
  module with its accent token (defined in globals.css as --mod-*). Reuse this
  anywhere modules are displayed (module cards, chips, badges) instead of
  hardcoding names/colors per page.
*/

export interface ModuleTheme {
  id: string
  label: string
  /** CSS custom property reference, e.g. for inline `style` or arbitrary values. */
  colorVar: string
}

export const MODULE_THEMES: ModuleTheme[] = [
  { id: 'railway', label: 'Railway Tender', colorVar: 'var(--mod-railway)' },
  { id: 'defence', label: 'Defence Tender', colorVar: 'var(--mod-defence)' },
  { id: 'engineering', label: 'Engineering', colorVar: 'var(--mod-engineering)' },
  { id: 'accounts', label: 'Accounts', colorVar: 'var(--mod-accounts)' },
  { id: 'hr', label: 'HR', colorVar: 'var(--mod-hr)' },
  { id: 'qa', label: 'QA', colorVar: 'var(--mod-qa)' },
  { id: 'npd', label: 'NPD', colorVar: 'var(--mod-npd)' },
  { id: 'other', label: 'Other', colorVar: 'var(--mod-other)' }
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
