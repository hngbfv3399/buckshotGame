import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval('cleanup stale game rooms', { minutes: 1 }, internal.rooms.cleanupStale)
crons.interval('cleanup expired guest sessions', { minutes: 5 }, internal.guests.cleanupExpired)

export default crons
