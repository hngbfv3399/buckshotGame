import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    hostKey: v.string(),
    guestKey: v.optional(v.string()),
    hostName: v.string(),
    guestName: v.optional(v.string()),
    hostReady: v.boolean(),
    guestReady: v.boolean(),
    game: v.optional(v.any()),
    revision: v.optional(v.number()),
    updatedAt: v.number(),
  }).index('by_code', ['code']),
})
