import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/theme/ThemeProvider'
import { cn } from '@/lib/utils'

/*
  Icon toggle for the top bar. Sun and Moon are stacked; on toggle they rotate
  and crossfade. `motion-reduce:*` utilities disable the rotation/transition for
  users who prefer reduced motion (the icon still swaps, just instantly).
*/
export function ThemeToggle({ className }: { className?: string }): React.JSX.Element {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        'relative size-10 text-sv-text-muted hover:text-sv-text',
        className
      )}
    >
      <Sun
        aria-hidden="true"
        className={cn(
          'absolute size-5 transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0',
          isDark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
        )}
      />
      <Moon
        aria-hidden="true"
        className={cn(
          'absolute size-5 transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0',
          isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'
        )}
      />
      <span className="sr-only">{label}</span>
    </Button>
  )
}

export default ThemeToggle
