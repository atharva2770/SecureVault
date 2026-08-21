import { cn } from '@/lib/utils'
import { avatarColorClass, userInitials } from '@/lib/roles'

interface UserAvatarProps {
  username: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-lg'
}

export function UserAvatar({
  username,
  size = 'sm',
  className
}: UserAvatarProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        avatarColorClass(username),
        SIZE[size],
        className
      )}
      aria-hidden
    >
      {userInitials(username)}
    </span>
  )
}
