import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/AuthProvider'

export function RequireAuth({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { user, booting, bootError } = useAuth()
  const location = useLocation()

  if (booting) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-sv-text-muted">
        Loading SecureVault…
      </div>
    )
  }

  if (bootError && !user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-sv-danger">Cannot reach the API</p>
        <p className="max-w-md text-xs text-sv-text-muted">{bootError}</p>
        <p className="max-w-md text-xs text-sv-text-muted">
          Start the API with <code className="text-sv-text">npm run dev:api</code>, then refresh.
        </p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}

export function RequireAdmin({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { canManageUsers } = useAuth()
  if (!canManageUsers) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

export function RequireAclAdmin({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { canManageAcls } = useAuth()
  if (!canManageAcls) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
