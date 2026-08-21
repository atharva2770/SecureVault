import { Monitor, Moon, Sun } from 'lucide-react'

import PageShell from '@/layout/PageShell'
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider'
import { cn } from '@/lib/utils'

const OPTIONS: { id: ThemePreference; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    id: 'dark',
    label: 'Dark',
    hint: 'Default vault theme. High contrast for long sessions.',
    icon: <Moon className="size-5" />
  },
  {
    id: 'light',
    label: 'Light',
    hint: 'Brighter surfaces for well-lit offices.',
    icon: <Sun className="size-5" />
  }
]

export default function SettingsPage(): React.JSX.Element {
  const { theme, setTheme } = useTheme()

  return (
    <PageShell title="Settings" subtitle="Appearance is saved in this browser only.">
      <section className="rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5">
        <div className="mb-4 flex items-center gap-2">
          <Monitor className="size-4 text-sv-accent" />
          <h2 className="text-sm font-semibold text-sv-text">Appearance</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((option) => {
            const selected = theme === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  'rounded-xl border p-4 text-left transition',
                  selected
                    ? 'border-sv-accent bg-sv-accent/10'
                    : 'border-sv-border bg-sv-bg hover:border-sv-accent/40'
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-sv-text">
                  {option.icon}
                  {option.label}
                </span>
                <span className="mt-2 block text-xs text-sv-text-muted">{option.hint}</span>
              </button>
            )
          })}
        </div>
      </section>
    </PageShell>
  )
}
