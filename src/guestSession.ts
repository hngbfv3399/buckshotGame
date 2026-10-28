export const GUEST_SESSION_MS = 60 * 60 * 1000

export type GuestSession = { key: string; name: string; expiresAt: number }

export function isGuestSessionActive(session: GuestSession, now = Date.now()) {
  return /^[a-f0-9]{64}$/.test(session.key)
    && session.name.trim().length > 0
    && Number.isFinite(session.expiresAt)
    && session.expiresAt > now
}

export function parseGuestSession(saved: string | null, now = Date.now()): GuestSession | null {
  if (!saved) return null
  try {
    const session = JSON.parse(saved) as GuestSession
    return session && isGuestSessionActive(session, now) ? session : null
  } catch {
    return null
  }
}
