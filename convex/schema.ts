import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  guests: defineTable({
    key: v.string(),
    name: v.string(),
    expiresAt: v.number(),
  }).index('by_key', ['key'])
    .index('by_expires_at', ['expiresAt']),
  rooms: defineTable({
    code: v.string(),
    hostKey: v.string(),
    guestKey: v.optional(v.string()),
    hostClientId: v.optional(v.string()),
    guestClientId: v.optional(v.string()),
    hostSeenAt: v.optional(v.number()),
    guestSeenAt: v.optional(v.number()),
    hostName: v.string(),
    guestName: v.optional(v.string()),
    hostReady: v.boolean(),
    guestReady: v.boolean(),
    game: v.optional(v.any()),
    revision: v.optional(v.number()),
    updatedAt: v.number(),
  }).index('by_code', ['code'])
    .index('by_updated_at', ['updatedAt'])
    .index('by_host_key', ['hostKey'])
    .index('by_guest_key', ['guestKey']),
})
