import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, Layers, Loader2, Lock, ShieldCheck } from 'lucide-react'

import { api } from '@/api/vault'
import { useAuth } from '@/auth/AuthProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MODULE_THEMES } from '@/theme/modules'

const FEATURES = [
  {
    icon: Layers,
    title: 'Module-first structure',
    description: 'Every department is a module; child folders open exactly as they are stored.'
  },
  {
    icon: ShieldCheck,
    title: 'Rights-driven access',
    description: 'People only ever see the modules and folders their role grants them.'
  },
  {
    icon: KeyRound,
    title: 'Name-verified retrieval',
    description: 'Files unlock only when the entered name matches the vault record.'
  }
]

export default function UnlockScreen(): React.JSX.Element {
  const { user, acceptAuth } = useAuth()
  const navigate = useNavigate()
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

  const isLogin = mode === 'login'

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden">
      {/* Screen-local theme toggle (no top bar on this route) */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle className="border border-sv-border/60 bg-sv-surface/70 backdrop-blur" />
      </div>

      {/* Ambient decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-32 size-[36rem] rounded-full bg-sv-accent/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 -right-40 size-[32rem] rounded-full bg-[color-mix(in_srgb,var(--accent-2)_18%,transparent)] blur-3xl"
      />

      <div className="relative mx-auto grid min-h-dvh max-w-7xl items-center gap-8 px-4 py-16 sm:px-8 sm:py-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-10">
        {/* Left — brand / marketing (desktop). Tablet gets a compact strip above the card. */}
        <section className="hidden flex-col justify-center lg:flex">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-[calc(var(--sv-radius)-2px)] bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-2))] text-sv-accent-fg shadow-card">
              <ShieldCheck className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-sv-text">DOCMAN</span>
            <Badge variant="outline" size="sm" className="ml-1 uppercase tracking-wide">
              Formerly SecureVault
            </Badge>
          </div>

          <h1 className="mt-8 max-w-xl text-4xl font-semibold leading-[1.1] tracking-tight text-sv-text xl:text-5xl">
            Every document,{' '}
            <span className="bg-[linear-gradient(90deg,var(--accent-primary),var(--accent-2))] bg-clip-text text-transparent">
              exactly where it belongs.
            </span>
          </h1>
          <p className="mt-4 max-w-lg text-sm/6 text-sv-text-muted">
            DOCMAN turns your team&apos;s paperwork into a clean, colour-coded vault. Departments
            become modules, modules open into their real folder tree, and files release only to the
            people with the right to see them.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="p-4">
                <div className="flex size-9 items-center justify-center rounded-[calc(var(--sv-radius)-4px)] bg-sv-accent/12 text-sv-accent">
                  <feature.icon className="size-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-sv-text">{feature.title}</p>
                <p className="mt-1 text-xs/5 text-sv-text-muted">{feature.description}</p>
              </Card>
            ))}
          </div>

          <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sv-text-faint">
              Modules in your vault
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {MODULE_THEMES.map((module) => (
                <span
                  key={module.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sv-border bg-sv-surface px-3 py-1 text-xs font-medium text-sv-text-muted"
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: module.colorVar }}
                  />
                  {module.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Right — sign-in card */}
        <section className="flex w-full items-center justify-center">
          <Card className="relative w-full max-w-md overflow-hidden">
            {/* Scanning progress bar on submit */}
            <div
              aria-hidden="true"
              className={`absolute inset-x-0 top-0 h-0.5 overflow-hidden transition-opacity duration-200 ${
                pending ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="h-full w-1/3 animate-[sv-scan_1.1s_linear_infinite] bg-[linear-gradient(90deg,transparent,var(--accent-primary),var(--accent-2),transparent)] motion-reduce:animate-none" />
            </div>

            <div className="p-6 sm:p-8">
              {/* Mobile / tablet brand (left panel hidden below lg) */}
              <div className="mb-6 flex items-center gap-2.5 lg:hidden">
                <div className="flex size-9 items-center justify-center rounded-[calc(var(--sv-radius)-2px)] bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-2))] text-sv-accent-fg">
                  <ShieldCheck className="size-5" />
                </div>
                <span className="text-lg font-semibold tracking-tight text-sv-text">DOCMAN</span>
              </div>

              <div className="mb-6 flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-[calc(var(--sv-radius)-2px)] bg-sv-accent/12 text-sv-accent">
                  <Lock className="size-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-sv-text">
                    {isLogin ? 'Sign in to DOCMAN' : 'Create your vault'}
                  </h2>
                  <p className="mt-1 text-sm text-sv-text-muted">
                    {isLogin
                      ? 'Access is scoped to your department rights.'
                      : 'Set up the master credential for this browser.'}
                  </p>
                </div>
              </div>

              <form
                aria-busy={pending}
                onSubmit={(e) => {
                  void submit(e)
                }}
                className="space-y-4"
              >
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-sv-text-muted">Username</span>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="your.username"
                    required
                    minLength={3}
                    disabled={pending}
                    autoFocus
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-sv-text-muted">Password</span>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    placeholder="Enter master password"
                    required
                    minLength={8}
                    disabled={pending}
                    error={Boolean(error)}
                  />
                </label>

                {error ? (
                  <p role="alert" className="text-sm text-sv-danger">
                    {error}
                  </p>
                ) : null}

                <Button type="submit" size="lg" className="w-full" disabled={pending}>
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {isLogin ? 'Entering…' : 'Creating…'}
                    </>
                  ) : (
                    <>
                      {isLogin ? 'Enter vault' : 'Register & enter'}
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>

              {/* Tablet: a few department chips so the collapsed hero still feels branded */}
              <div className="mt-5 flex flex-wrap justify-center gap-1.5 lg:hidden">
                {MODULE_THEMES.slice(0, 5).map((module) => (
                  <span
                    key={module.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sv-border bg-sv-surface-2 px-2.5 py-1 text-2xs font-medium text-sv-text-muted"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: module.colorVar }}
                    />
                    {module.label}
                  </span>
                ))}
              </div>

              <div className="mt-6 border-t border-sv-border pt-4 text-center">
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm text-sv-text-muted outline-none transition hover:text-sv-accent focus-visible:ring-2 focus-visible:ring-sv-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sv-surface motion-reduce:transition-none"
                  onClick={() => {
                    setMode((m) => (m === 'login' ? 'register' : 'login'))
                    setError(null)
                  }}
                >
                  {isLogin ? 'Need an account? Register' : 'Already registered? Sign in'}
                </button>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}
