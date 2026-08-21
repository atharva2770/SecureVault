import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { api, SessionLockedError } from '@/api/vault'
import UnlockScreen from '@/components/UnlockScreen'
import VaultBrowser from '@/components/VaultBrowser'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
})

function AppShell(): React.JSX.Element {
  const [username, setUsername] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function boot(): Promise<void> {
      try {
        const session = await api.auth.getSession()
        if (!active) return
        if (session.unlocked && session.user) {
          setUsername(session.user.username)
        }
      } catch (error) {
        if (!active) return
        if (error instanceof SessionLockedError) {
          setUsername(null)
          return
        }
        setBootError(error instanceof Error ? error.message : 'Failed to reach SecureVault API.')
      } finally {
        if (active) setBooting(false)
      }
    }

    void boot()

    const onLocked = (): void => {
      setUsername(null)
      queryClient.clear()
    }
    window.addEventListener('sv:locked', onLocked)

    return () => {
      active = false
      window.removeEventListener('sv:locked', onLocked)
    }
  }, [])

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-sv-text-muted">
        Loading SecureVault…
      </div>
    )
  }

  if (bootError && !username) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-sv-danger">Cannot reach the API</p>
        <p className="max-w-md text-xs text-sv-text-muted">{bootError}</p>
        <p className="max-w-md text-xs text-sv-text-muted">
          Start the API with <code className="text-sv-text">npm run dev:api</code>, then refresh.
        </p>
      </div>
    )
  }

  if (!username) {
    return (
      <UnlockScreen
        onUnlocked={(name) => {
          setUsername(name)
          setBootError(null)
        }}
      />
    )
  }

  return (
    <VaultBrowser
      username={username}
      onLocked={() => {
        setUsername(null)
        queryClient.clear()
      }}
    />
  )
}

export default function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="dark h-full">
        <AppShell />
      </div>
    </QueryClientProvider>
  )
}
