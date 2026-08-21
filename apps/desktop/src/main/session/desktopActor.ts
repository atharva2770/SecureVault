import { VaultSession } from './VaultSession'

/**
 * Desktop adapter for Phase 1: services take an explicit actor, not VaultSession.
 * A future HTTP API will pass the request user instead of this helper.
 */
export interface DesktopActor {
  userId: string
  kek: Buffer
}

export function requireDesktopUserId(): string {
  const session = VaultSession.getInstance()
  session.touch()
  return session.requireUserId()
}

export function requireDesktopActor(): DesktopActor {
  const session = VaultSession.getInstance()
  session.touch()
  return {
    userId: session.requireUserId(),
    kek: session.requireKek()
  }
}
