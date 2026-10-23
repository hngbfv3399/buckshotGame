export const HEARTBEAT_INTERVAL_MS = 15_000
export const ROOM_LEASE_MS = 60_000

export function isRoomSeatActive(lastSeenAt: number | undefined, now: number) {
  return lastSeenAt !== undefined && now - lastSeenAt < ROOM_LEASE_MS
}
