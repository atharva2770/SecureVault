import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type ThemePreference = 'dark' | 'light'

interface ThemeContextValue {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
  toggleTheme: () => void
}

const STORAGE_KEY = 'sv-theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemTheme(): ThemePreference {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function readStoredTheme(): ThemePreference | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  return null
}

/** Persisted choice wins; otherwise fall back to the OS preference. */
function resolveInitialTheme(): ThemePreference {
  return readStoredTheme() ?? systemTheme()
}

function applyTheme(theme: ThemePreference): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/*
  Pre-paint safeguard. The primary anti-FOUC guard is the inline script in
  index.html; this keeps things correct in dev/HMR and if that script is ever
  removed. Both use the same STORAGE_KEY and resolution order.
*/
if (typeof document !== 'undefined') {
  applyTheme(resolveInitialTheme())
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    typeof document === 'undefined' ? 'dark' : resolveInitialTheme()
  )

  // True once the user makes an explicit choice; until then we follow the OS.
  const userChoseRef = useRef<boolean>(readStoredTheme() !== null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Follow the OS preference live, but only while the user hasn't chosen yet.
  useEffect(() => {
    if (userChoseRef.current || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = (event: MediaQueryListEvent): void => {
      if (!userChoseRef.current) setThemeState(event.matches ? 'light' : 'dark')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const value = useMemo<ThemeContextValue>(() => {
    const persist = (next: ThemePreference): void => {
      userChoseRef.current = true
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
    }

    return {
      theme,
      setTheme: (next) => {
        persist(next)
        setThemeState(next)
      },
      toggleTheme: () => {
        setThemeState((prev) => {
          const next: ThemePreference = prev === 'dark' ? 'light' : 'dark'
          persist(next)
          return next
        })
      }
    }
  }, [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
