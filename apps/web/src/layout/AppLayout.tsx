import { Outlet, useLocation } from 'react-router-dom'

import { AmbientSurface } from '@/components/AmbientSurface'
import { PageTransition } from '@/components/PageTransition'
import AppHeader from '@/layout/AppHeader'

export default function AppLayout(): React.JSX.Element {
  const location = useLocation()
  const isVault = location.pathname === '/' || location.pathname.startsWith('/m/')
  const viewKey = isVault ? 'vault' : location.pathname

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      {isVault ? null : <AmbientSurface />}
      <AppHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <PageTransition viewKey={viewKey} className="h-full">
          <Outlet />
        </PageTransition>
      </div>
    </div>
  )
}
