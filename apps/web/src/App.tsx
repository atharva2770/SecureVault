import { useEffect } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '@/auth/AuthProvider'
import { RequireAdmin, RequireAuth } from '@/auth/guards'
import UnlockScreen from '@/components/UnlockScreen'
import AppLayout from '@/layout/AppLayout'
import UsersPage from '@/pages/admin/UsersPage'
import ChangePasswordPage from '@/pages/ChangePasswordPage'
import HelpPage from '@/pages/HelpPage'
import MyAccessPage from '@/pages/MyAccessPage'
import ProfilePage from '@/pages/ProfilePage'
import SettingsPage from '@/pages/SettingsPage'
import VaultPage from '@/pages/VaultPage'
import { ToastProvider } from '@/components/ui/toast'
import { ThemeProvider } from '@/theme/ThemeProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
})

function QueryReset(): null {
  const client = useQueryClient()
  useEffect(() => {
    const onLocked = (): void => {
      client.clear()
    }
    window.addEventListener('sv:locked', onLocked)
    return () => window.removeEventListener('sv:locked', onLocked)
  }, [client])
  return null
}

export default function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <QueryReset />
      <ThemeProvider>
        <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <div className="h-full">
              <Routes>
                <Route path="/login" element={<UnlockScreen />} />
                <Route
                  element={
                    <RequireAuth>
                      <AppLayout />
                    </RequireAuth>
                  }
                >
                  <Route element={<VaultPage />}>
                    <Route index element={null} />
                    <Route path="m/:folderId" element={null} />
                  </Route>
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/account/password" element={<ChangePasswordPage />} />
                  <Route path="/account/access" element={<MyAccessPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/help" element={<HelpPage />} />
                  <Route
                    path="/admin/users"
                    element={
                      <RequireAdmin>
                        <UsersPage />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/rights"
                    element={
                      <RequireAdmin>
                        <UsersPage />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="/admin/folders"
                    element={<Navigate to="/admin/users" replace />}
                  />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </AuthProvider>
        </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
