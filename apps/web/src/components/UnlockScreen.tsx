import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2, Lock, ShieldCheck } from 'lucide-react'

import { api } from '@/api/vault'
import { useAuth } from '@/auth/AuthProvider'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { MODULE_THEMES } from '@/theme/modules'

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
    <div className="relative h-dvh w-full overflow-hidden">
      {/* Screen-local theme toggle (no top bar on this route) */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle className="border border-sv-border/60 bg-sv-surface/70 backdrop-blur" />
      </div>

      <div className="grid h-full min-[860px]:grid-cols-[1.05fr_1fr]">
        <LoginHero />

        <main className="flex items-center justify-center px-5 py-10 sm:px-8">
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
              <div className="mb-6 space-y-3">
                <div className="flex size-11 items-center justify-center rounded-[calc(var(--sv-radius)-2px)] bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-2))] text-sv-accent-fg shadow-card">
                  <Lock className="size-5" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-sv-text">
                    {isLogin ? 'Unlock your vault' : 'Create your vault'}
                  </h1>
                  <p className="mt-1 text-sm text-sv-text-muted">
                    {isLogin
                      ? 'Sign in to access encrypted documents.'
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
                    placeholder="you@department"
                    required
                    minLength={3}
                    disabled={pending}
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
                      {isLogin ? 'Unlocking…' : 'Creating…'}
                    </>
                  ) : (
                    <>
                      {isLogin ? 'Unlock vault' : 'Register & unlock'}
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 border-t border-sv-border pt-4 text-center">
                <button
                  type="button"
                  className="text-xs text-sv-text-muted transition hover:text-sv-accent motion-reduce:transition-none"
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
        </main>
      </div>
    </div>
  )
}

/* Decorative brand hero — colored accent panel so it reads intentionally in both
   themes (no reliance on theme surface colors that wash out on white). */
function LoginHero(): React.JSX.Element {
  return (
    <aside className="relative hidden overflow-hidden bg-[linear-gradient(135deg,var(--accent-primary),var(--accent-2))] text-white min-[860px]:flex min-[860px]:flex-col">
      {/* Animated grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 animate-[sv-grid-drift_7s_linear_infinite] opacity-60 [mask-image:radial-gradient(120%_120%_at_30%_15%,#000,transparent_75%)] motion-reduce:animate-none"
        style={{
          backgroundImage:
            'linear-gradient(rgb(255 255 255 / 0.10) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.10) 1px, transparent 1px)',
          backgroundSize: '44px 44px'
        }}
      />

      {/* Concentric rings */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-[520px] opacity-70"
      >
        <div className="absolute inset-0 rounded-full border border-white/15" />
        <div className="absolute inset-10 rounded-full border border-white/12" />
        <div className="absolute inset-24 rounded-full border border-dashed border-white/20 animate-[spin_22s_linear_infinite] motion-reduce:animate-none" />
        <div className="absolute inset-36 rounded-full border border-white/10" />
      </div>

      {/* Soft glow blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -left-10 size-72 rounded-full bg-white/15 blur-3xl animate-[sv-float_9s_ease-in-out_infinite] motion-reduce:animate-none"
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-12">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-[calc(var(--sv-radius)-2px)] bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <ShieldCheck className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">DOCMAN</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
            Every document, encrypted and in its place.
          </h2>
          <p className="mt-4 max-w-sm text-sm/6 text-white/80">
            A secure vault for your teams — organized by module, locked down by role, audited end to
            end.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {MODULE_THEMES.map((module) => (
            <span
              key={module.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur"
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
    </aside>
  )
}
