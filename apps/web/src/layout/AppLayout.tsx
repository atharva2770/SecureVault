import { Outlet, useLocation } from 'react-router-dom'

import { PageTransition } from '@/components/PageTransition'
import AppHeader from '@/layout/AppHeader'

export default function AppLayout(): React.JSX.Element {
  const location = useLocation()
  const isVault = location.pathname === '/' || location.pathname.startsWith('/m/')
  const viewKey = isVault ? 'vault' : location.pathname

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <PageTransition viewKey={viewKey} className="h-full">
          <Outlet />
        </PageTransition>
      </div>
    </div>
  )
}
