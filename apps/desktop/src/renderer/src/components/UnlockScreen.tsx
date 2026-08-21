import { useState } from 'react'
import { Loader2, Shield } from 'lucide-react'

import TitleBar from '@/components/TitleBar'
import { Button } from '@/components/ui/button'

interface UnlockScreenProps {
  onUnlocked: (username: string) => void
}

export default function UnlockScreen({ onUnlocked }: UnlockScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const result =
        mode === 'login'
          ? await window.api.auth.login({ username, password })
          : await window.api.auth.register({ username, password })
      onUnlocked(result.user.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.')
    } finally {
      setPending(false)
      setPassword('')
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar title="SecureVault" />
      <main className="flex flex-1 items-center justify-center p-6">
        <form
          onSubmit={(e) => {
            void submit(e)
          }}
          className="w-full max-w-sm space-y-5 rounded-[var(--sv-radius)] border border-sv-border bg-sv-surface/90 p-6 shadow-[0_24px_80px_rgb(0_0_0_/0.35)]"
        >
          <div className="space-y-2 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-sv-accent/15 text-sv-accent">
              <Shield className="size-6" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-sv-text">
              {mode === 'login' ? 'Unlock vault' : 'Create vault account'}
            </h1>
            <p className="text-sm text-sv-text-muted">
              Your master key never leaves this device’s memory.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-sv-text-muted">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                minLength={3}
                className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent focus:ring-1 focus:ring-sv-accent"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-sv-text-muted">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                className="h-10 w-full rounded-lg border border-sv-border bg-sv-bg px-3 text-sm text-sv-text outline-none focus:border-sv-accent focus:ring-1 focus:ring-sv-accent"
              />
            </label>
          </div>

          {error ? <p className="text-sm text-sv-danger">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === 'login' ? 'Unlock' : 'Register & unlock'}
          </Button>

          <button
            type="button"
            className="w-full text-center text-xs text-sv-text-muted hover:text-sv-accent"
            onClick={() => {
              setMode((m) => (m === 'login' ? 'register' : 'login'))
              setError(null)
            }}
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}
          </button>
        </form>
      </main>
    </div>
  )
}
