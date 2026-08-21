import { Outlet } from 'react-router-dom'

import AppHeader from '@/layout/AppHeader'

export default function AppLayout(): React.JSX.Element {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader />
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
