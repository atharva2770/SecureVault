import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
        if (!window.api?.auth?.getSession) {
          throw new Error('Preload bridge unavailable (window.api). Restart the app.')
        }

        const session = await window.api.auth.getSession()
        if (!active) return
        if (session.unlocked && session.user) {
          setUsername(session.user.username)
        }
      } catch (error) {
        if (!active) return
        setBootError(error instanceof Error ? error.message : 'Failed to start SecureVault.')
      } finally {
        if (active) setBooting(false)
      }
    }

    void boot()

    const unsubscribe = window.api?.auth?.onVaultLocked?.(() => {
      setUsername(null)
      queryClient.clear()
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-sv-text-muted">
        Loading SecureVault…
      </div>
    )
  }

  if (bootError && !window.api) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-sv-danger">Renderer bridge failed</p>
        <p className="max-w-md text-xs text-sv-text-muted">{bootError}</p>
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
