import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  FileSearch,
  FolderTree,
  KeyRound,
  Loader2,
  Lock,
  Sparkles
} from 'lucide-react'

import { api } from '@/api/vault'
import { useAuth } from '@/auth/AuthProvider'
import { BrandMark } from '@/components/BrandMark'
import { ThemeToggle } from '@/components/ThemeToggle'
import { moduleIcon } from '@/components/module-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MODULE_THEME_BY_ID, type ModuleTheme } from '@/theme/modules'

const FEATURES = [
  {
    icon: FolderTree,
    title: 'Module-first structure',
    body: 'Every department is a module tile; child folders open exactly as they are stored.'
  },
  {
    icon: KeyRound,
    title: 'Rights-driven access',
    body: 'Users only ever see the modules and folders their role grants them.'
  },
  {
    icon: FileSearch,
    title: 'Name-verified retrieval',
    body: 'Files unlock only when the entered file name matches the vault record.'
  }
]

/** Visual chip order matching the Docman landing — ids stay ours. */
const LOGIN_MODULE_ORDER = [
  'engineering',
  'hr',
  'accounts',
  'qa',
  'npd',
  'railway',
  'defence',
  'other'
] as const

export default function UnlockScreen(): React.JSX.Element {
  const { user, acceptAuth } = useAuth()
  const navigate = useNavigate()
  const usernameRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (user) {
    return <Navigate to="/" replace />
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const result =
        mode === 'login'
          ? await api.auth.login({ username, password })
          : await api.auth.register({ username, password })
      acceptAuth(result)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.')
    } finally {
      setPending(false)
      setPassword('')
    }
  }

  function focusLogin(): void {
    document.getElementById('login')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    usernameRef.current?.focus()
  }

  const isLogin = mode === 'login'
  const loginModules = LOGIN_MODULE_ORDER.map((id) => MODULE_THEME_BY_ID[id]).filter(
    (m): m is ModuleTheme => Boolean(m)
  )

  return (
    <main className="aurora relative min-h-dvh overflow-x-hidden">
      <div aria-hidden className="grid-mesh pointer-events-none absolute inset-0 -z-10" />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <BrandMark />
          <div className="flex items-center gap-2">
            <span className="mod-chip hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline-flex">
              v2 · Document Vault
            </span>
            <ThemeToggle className="size-9 sm:size-9" />
          </div>
        </div>

        <div className="mt-10 grid items-start gap-10 lg:mt-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
          <section>
            <p className="inline-flex items-center gap-2 rounded-full border border-sv-border bg-surface/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sv-text-muted">
              <Sparkles className="h-3.5 w-3.5" /> Formerly SecureVault
            </p>
            <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.05] sm:text-6xl">
              Every document,
              <br />
              <span className="text-gradient-brand">exactly where it belongs.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-sv-text-muted sm:text-lg">
              DOCMAN turns your plant&apos;s paperwork into a clean, colour-coded vault. Departments
              become modules, modules open into their real folder tree, and files release only to the
              people with the right to see them.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" type="button" className="rounded-xl" onClick={focusLogin}>
                Open the vault <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <Button size="lg" variant="secondary" type="button" className="rounded-xl" onClick={focusLogin}>
                Sign in
              </Button>
            </div>

            <dl className="mt-12 grid gap-4 sm:grid-cols-3">
              {FEATURES.map((feat) => (
                <div key={feat.title} className="glass-panel rounded-2xl p-4">
                  <feat.icon className="h-5 w-5 text-mod" />
                  <dt className="mt-3 font-display text-sm font-bold">{feat.title}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-sv-text-muted">{feat.body}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-10">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sv-text-muted">
                Modules in your vault
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {loginModules.map((m) => {
                  const Icon = moduleIcon(m.id)
                  return (
                    <li
                      key={m.id}
                      style={{ '--mod': m.colorVar } as React.CSSProperties}
                      className="mod-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {m.label}
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>

          <section id="login" className="scroll-mt-8 lg:sticky lg:top-8">
            <div className="glass-panel rounded-3xl p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-brand text-sv-bg">
                  <Lock className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-xl font-bold">
                    {isLogin ? 'Sign in to DOCMAN' : 'Create your vault'}
                  </h2>
                  <p className="text-xs text-sv-text-muted">
                    {isLogin
                      ? 'Access is scoped to your department rights.'
                      : 'Set up the master credential for this vault.'}
                  </p>
                </div>
              </div>

              <form
                className="mt-7 space-y-4"
                aria-busy={pending}
                onSubmit={(e) => {
                  void submit(e)
                }}
              >
                <div className="space-y-2">
                  <label htmlFor="username" className="block text-sm font-medium">
                    Username
                  </label>
                  <Input
                    ref={usernameRef}
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="your.username"
                    required
                    minLength={3}
                    disabled={pending}
                    autoFocus
                    className="bg-transparent"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    disabled={pending}
                    error={Boolean(error)}
                    className="bg-transparent"
                  />
                </div>

                {error ? (
                  <p role="alert" className="text-sm text-sv-danger">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" size="lg" className="w-full rounded-xl" disabled={pending}>
                  {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {pending
                    ? isLogin
                      ? 'Entering…'
                      : 'Creating…'
                    : isLogin
                      ? 'Enter vault'
                      : 'Register & enter'}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-sv-text-muted">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 outline-none transition-colors hover:bg-secondary hover:text-sv-text focus-visible:ring-2 focus-visible:ring-sv-accent"
                  onClick={() => {
                    setMode((m) => (m === 'login' ? 'register' : 'login'))
                    setError(null)
                  }}
                >
                  {isLogin ? 'Need an account? Register' : 'Already registered? Sign in'}
                </button>
              </p>
            </div>
          </section>
        </div>

        <footer className="mt-20 border-t border-sv-border py-8 text-xs text-sv-text-muted">
          DOCMAN · Document management for manufacturing teams
        </footer>
      </div>
    </main>
  )
}
