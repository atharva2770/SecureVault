import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthResultDto, AuthUserDto } from '@securevault/domain'

import { api, SessionLockedError } from '@/api/vault'
import { canManageAcls, canManageUsers, isAdminUser } from '@/lib/roles'

interface AuthContextValue {
  user: AuthUserDto | null
  booting: boolean
  bootError: string | null
  isAdmin: boolean
  canManageUsers: boolean
  canManageAcls: boolean
  acceptAuth: (result: AuthResultDto) => void
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<AuthUserDto | null>(null)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const session = await api.auth.getSession()
    setUser(session.unlocked && session.user ? session.user : null)
  }, [])

  useEffect(() => {
    let active = true

    async function boot(): Promise<void> {
      try {
        const session = await api.auth.getSession()
        if (!active) return
        setUser(session.unlocked && session.user ? session.user : null)
        setBootError(null)
      } catch (error) {
        if (!active) return
        if (error instanceof SessionLockedError) {
          setUser(null)
          return
        }
        setBootError(error instanceof Error ? error.message : 'Failed to reach SecureVault API.')
      } finally {
        if (active) setBooting(false)
      }
    }

    void boot()

    const onLocked = (): void => {
      setUser(null)
    }
    window.addEventListener('sv:locked', onLocked)
    return () => {
      active = false
      window.removeEventListener('sv:locked', onLocked)
    }
  }, [])

  const acceptAuth = useCallback((result: AuthResultDto) => {
    setUser(result.user)
    setBootError(null)
  }, [])

  const signOut = useCallback(async () => {
    await api.auth.lockVault()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      booting,
      bootError,
      isAdmin: isAdminUser(user),
      canManageUsers: canManageUsers(user),
      canManageAcls: canManageAcls(user),
      acceptAuth,
      signOut,
      refresh
    }),
    [user, booting, bootError, acceptAuth, signOut, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
