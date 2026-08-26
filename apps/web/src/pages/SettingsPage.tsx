import { useQuery } from '@tanstack/react-query'
import { HardDrive, Monitor, Moon, Sun } from 'lucide-react'

import { api } from '@/api/vault'
import { useAuth } from '@/auth/AuthProvider'
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
  const { isAdmin } = useAuth()
  const storageQuery = useQuery({
    queryKey: ['admin-storage'],
    queryFn: () => api.admin.getStorage(),
    enabled: isAdmin
  })

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

      {isAdmin ? (
        <section className="mt-4 rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface p-5">
          <div className="mb-3 flex items-center gap-2">
            <HardDrive className="size-4 text-sv-accent" />
            <h2 className="text-sm font-semibold text-sv-text">File store</h2>
          </div>
          {storageQuery.isLoading ? (
            <p className="text-sm text-sv-text-muted">Loading path…</p>
          ) : storageQuery.data ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-sv-text-muted">Location: </span>
                <code className="rounded bg-sv-bg px-1.5 py-0.5 font-mono text-xs text-sv-text">
                  {storageQuery.data.blobRoot}
                </code>
              </p>
              <p>
                <span className="text-sv-text-muted">On disk: </span>
                <code className="rounded bg-sv-bg px-1.5 py-0.5 font-mono text-xs text-sv-text">
                  {storageQuery.data.blobRoot}\{storageQuery.data.layout}
                </code>
              </p>
              <p className="text-xs text-sv-text-muted">{storageQuery.data.note}</p>
            </div>
          ) : (
            <p className="text-sm text-sv-danger">Could not load the file store path.</p>
          )}
        </section>
      ) : null}
    </PageShell>
  )
}
