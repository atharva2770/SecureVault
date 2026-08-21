import type { AuthUserDto } from '@securevault/domain'

export function isAdminUser(user: AuthUserDto | null | undefined): boolean {
  if (!user) return false
  return (
    user.roles.some((role) => role.toUpperCase() === 'ADMIN') ||
    user.role.toLowerCase() === 'admin'
  )
}

export function isManagerUser(user: AuthUserDto | null | undefined): boolean {
  if (!user) return false
  return user.roles.some((role) => role.toUpperCase() === 'MANAGER')
}

export function canManageUsers(user: AuthUserDto | null | undefined): boolean {
  return isAdminUser(user)
}

export function canManageAcls(user: AuthUserDto | null | undefined): boolean {
  return isAdminUser(user) || isManagerUser(user)
}

export function primaryRoleLabel(user: AuthUserDto): string {
  const code = user.roles[0] || user.role
  return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase()
}

export function userInitials(username: string): string {
  const parts = username.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase()
  }
  return username.slice(0, 2).toUpperCase() || 'SV'
}

const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-fuchsia-500'
]

export function avatarColorClass(username: string): string {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? 'bg-indigo-500'
}
