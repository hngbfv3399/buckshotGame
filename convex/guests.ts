import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import { GUEST_SESSION_MS } from '../src/guestSession'

export function validGuestKey(key: string) {
  return /^[a-f0-9]{64}$/.test(key)
}

export async function getGuest(ctx: QueryCtx | MutationCtx, key: string) {
  if (!validGuestKey(key)) return null
  const guest = await ctx.db.query('guests').withIndex('by_key', (q) => q.eq('key', key)).first()
  return guest && guest.expiresAt > Date.now() ? guest : null
}

export async function requireGuest(ctx: QueryCtx | MutationCtx, key: string) {
  const guest = await getGuest(ctx, key)
  if (!guest) throw new Error('게스트 로그인이 만료됐습니다. 다시 로그인하세요.')
  return guest
}

export const login = mutation({
  args: { key: v.string(), name: v.string() },
  handler: async (ctx, { key, name }) => {
    if (!validGuestKey(key)) throw new Error('유효하지 않은 게스트 로그인입니다.')
    const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 18)
    if (!cleanName) throw new Error('닉네임을 입력하세요.')
    const existing = await ctx.db.query('guests').withIndex('by_key', (q) => q.eq('key', key)).first()
    if (existing) throw new Error('이미 사용한 게스트 키입니다. 다시 시도하세요.')
    const expiresAt = Date.now() + GUEST_SESSION_MS
    await ctx.db.insert('guests', { key, name: cleanName, expiresAt })
    return { name: cleanName, expiresAt }
  },
})

export const current = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const guest = await getGuest(ctx, key)
    return guest ? { name: guest.name, expiresAt: guest.expiresAt } : null
  },
})

export const logout = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!validGuestKey(key)) return null
    const guest = await ctx.db.query('guests').withIndex('by_key', (q) => q.eq('key', key)).first()
    if (guest) await ctx.db.delete(guest._id)
    return null
  },
})

export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db.query('guests').withIndex('by_expires_at', (q) => q.lt('expiresAt', Date.now())).take(100)
    for (const guest of expired) await ctx.db.delete(guest._id)
  },
})
