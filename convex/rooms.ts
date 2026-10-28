import { internalMutation, mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { applyItem, canUseEffect, canUseItem, grantItems, shoot, takeStolenItem, MULTIPLAYER_ITEM_POOL, type GameState, type Player } from '../src/game'
import { createMultiplayerGame, projectGame, type Seat } from '../src/multiplayer'
import { isRoomSeatActive, ROOM_LEASE_MS } from '../src/roomPresence'
import { getGuest, requireGuest } from './guests'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function assertKey(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('유효하지 않은 플레이어 키입니다.')
}

function assertClientId(clientId: string) {
  if (!/^[a-f0-9-]{36}$/.test(clientId)) throw new Error('유효하지 않은 브라우저 연결입니다.')
}

function seatFor(room: Doc<'rooms'>, key: string, clientId: string, now: number): Seat {
  assertKey(key)
  assertClientId(clientId)
  if (room.hostKey === key && room.hostClientId === clientId && isRoomSeatActive(room.hostSeenAt, now)) return 'host'
  if (room.guestKey === key && room.guestClientId === clientId && isRoomSeatActive(room.guestSeenAt, now)) return 'guest'
  throw new Error('방 연결이 만료됐거나 다른 탭에서 접속했습니다.')
}

function clearGuest(room: Doc<'rooms'>) {
  return {
    guestKey: undefined, guestClientId: undefined, guestSeenAt: undefined,
    guestName: undefined, guestReady: false, hostReady: false,
    game: undefined, revision: (room.revision ?? 0) + 1,
  }
}

async function leaveOtherRooms(ctx: MutationCtx, key: string, exceptId?: Id<'rooms'>) {
  const hosted = await ctx.db.query('rooms').withIndex('by_host_key', (q) => q.eq('hostKey', key)).collect()
  for (const room of hosted) if (room._id !== exceptId) await ctx.db.delete(room._id)
  const joined = await ctx.db.query('rooms').withIndex('by_guest_key', (q) => q.eq('guestKey', key)).collect()
  for (const room of joined) if (room._id !== exceptId) await ctx.db.patch(room._id, { ...clearGuest(room), updatedAt: Date.now() })
}

function actorFor(seat: Seat): Player {
  return seat === 'host' ? 'you' : 'dealer'
}

function activeGame(room: Doc<'rooms'>): GameState {
  if (!isRoomSeatActive(room.guestSeenAt, Date.now())) throw new Error('상대의 연결이 끊겼습니다.')
  const game = room.game as GameState | undefined
  if (!game || game.status !== 'playing') throw new Error('지금은 행동할 수 없습니다.')
  return game
}

function assertRevision(room: Doc<'rooms'>, revision: number) {
  if (!Number.isInteger(revision) || revision !== (room.revision ?? 0)) {
    throw new Error('게임 상태가 바뀌었습니다. 화면을 확인한 뒤 다시 시도하세요.')
  }
}

function randomCode() {
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

export const create = mutation({
  args: { key: v.string(), clientId: v.string() },
  handler: async (ctx, { key, clientId }) => {
    const guest = await requireGuest(ctx, key)
    assertClientId(clientId)
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = randomCode()
      const existing = await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', code)).first()
      if (existing) continue
      await leaveOtherRooms(ctx, key)
      const id = await ctx.db.insert('rooms', {
        code, hostKey: key, hostClientId: clientId, hostSeenAt: Date.now(), hostName: guest.name,
        hostReady: false, guestReady: false,
        revision: 0,
        updatedAt: Date.now(),
      })
      return { id }
    }
    throw new Error('방을 만들지 못했습니다. 다시 시도하세요.')
  },
})

export const join = mutation({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string() },
  handler: async (ctx, { id, key, clientId }) => {
    const guest = await requireGuest(ctx, key)
    assertClientId(clientId)
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const now = Date.now()
    if (!isRoomSeatActive(room.hostSeenAt, now)) throw new Error('방장이 연결을 끊어 방이 만료됐습니다.')
    if (room.hostKey === key) {
      await leaveOtherRooms(ctx, key, room._id)
      await ctx.db.patch(room._id, { hostClientId: clientId, hostSeenAt: now, updatedAt: now })
      return { id: room._id }
    }
    const guestActive = isRoomSeatActive(room.guestSeenAt, now)
    if (room.guestKey && room.guestKey !== key && guestActive) throw new Error('이미 두 명이 참여 중인 방입니다.')
    if (room.guestKey && room.guestKey === key && guestActive) {
      await leaveOtherRooms(ctx, key, room._id)
      await ctx.db.patch(room._id, { guestClientId: clientId, guestSeenAt: now, updatedAt: now })
      return { id: room._id }
    }
    if (room.game && room.game.status !== 'over' && guestActive) throw new Error('진행 중인 방에는 참여할 수 없습니다.')
    await leaveOtherRooms(ctx, key, room._id)
    await ctx.db.patch(room._id, { guestKey: key, guestClientId: clientId, guestSeenAt: now, guestName: guest.name, guestReady: false, hostReady: false, game: undefined, revision: (room.revision ?? 0) + 1, updatedAt: now })
    return { id: room._id }
  },
})

export const listOpen = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!await getGuest(ctx, key)) return []
    const now = Date.now()
    const recent = await ctx.db.query('rooms').withIndex('by_updated_at').order('desc').take(100)
    return recent
      .filter((room) => isRoomSeatActive(room.hostSeenAt, now) && !isRoomSeatActive(room.guestSeenAt, now) && room.hostKey !== key)
      .slice(0, 30)
      .map((room) => ({ id: room._id, hostName: room.hostName, createdAt: room._creationTime }))
  },
})

export const resume = mutation({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string() },
  handler: async (ctx, { id, key, clientId }) => {
    if (!await getGuest(ctx, key)) return false
    assertClientId(clientId)
    const room = await ctx.db.get(id)
    if (!room) return false
    const now = Date.now()
    if (!isRoomSeatActive(room.hostSeenAt, now)) return false
    if (room.hostKey === key) {
      await ctx.db.patch(id, { hostClientId: clientId, hostSeenAt: now, updatedAt: now })
      return true
    }
    if (room.guestKey === key && isRoomSeatActive(room.guestSeenAt, now)) {
      await ctx.db.patch(id, { guestClientId: clientId, guestSeenAt: now, updatedAt: now })
      return true
    }
    return false
  },
})

export const heartbeat = mutation({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string() },
  handler: async (ctx, { id, key, clientId }) => {
    if (!await getGuest(ctx, key)) return false
    const room = await ctx.db.get(id)
    if (!room) return false
    const now = Date.now()
    try {
      const seat = seatFor(room, key, clientId, now)
      if (!isRoomSeatActive(room.hostSeenAt, now)) return false
      if (seat === 'host') {
        const expiredGuest = room.guestKey && !isRoomSeatActive(room.guestSeenAt, now)
        await ctx.db.patch(id, expiredGuest
          ? { ...clearGuest(room), hostSeenAt: now, updatedAt: now }
          : { hostSeenAt: now, updatedAt: now })
      } else {
        await ctx.db.patch(id, { guestSeenAt: now, updatedAt: now })
      }
      return true
    } catch {
      return false
    }
  },
})

export const view = query({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string() },
  handler: async (ctx, { id, key, clientId }) => {
    if (!await getGuest(ctx, key)) return null
    const room = await ctx.db.get(id)
    if (!room) return null
    const now = Date.now()
    let seat: Seat
    try { seat = seatFor(room, key, clientId, now) }
    catch { return null }
    if (!isRoomSeatActive(room.hostSeenAt, now)) return null
    const guestActive = Boolean(room.guestKey && isRoomSeatActive(room.guestSeenAt, now))
    return {
      id: room._id,
      revision: room.revision ?? 0,
      seat,
      selfName: seat === 'host' ? room.hostName : room.guestName ?? '참가자',
      opponentName: seat === 'host' ? guestActive ? room.guestName ?? null : null : room.hostName,
      selfReady: seat === 'host' ? room.hostReady : room.guestReady,
      opponentReady: seat === 'host' ? guestActive && room.guestReady : room.hostReady,
      game: room.game && guestActive ? projectGame(room.game as GameState, seat) : null,
    }
  },
})

export const setReady = mutation({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string(), ready: v.boolean() },
  handler: async (ctx, { id, key, clientId, ready }) => {
    await requireGuest(ctx, key)
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const seat = seatFor(room, key, clientId, Date.now())
    if (room.game && (room.game as GameState).status !== 'over') throw new Error('게임 진행 중에는 준비 상태를 바꿀 수 없습니다.')
    const hostReady = seat === 'host' ? ready : room.hostReady
    const guestReady = seat === 'guest' ? ready : room.guestReady
    if (room.guestKey && isRoomSeatActive(room.guestSeenAt, Date.now()) && hostReady && guestReady) {
      await ctx.db.patch(id, { hostReady: false, guestReady: false, game: createMultiplayerGame(), revision: (room.revision ?? 0) + 1, updatedAt: Date.now() })
    } else {
      await ctx.db.patch(id, { hostReady, guestReady, revision: (room.revision ?? 0) + 1, updatedAt: Date.now() })
    }
    return null
  },
})

export const fire = mutation({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string(), target: v.union(v.literal('self'), v.literal('opponent')), revision: v.number() },
  handler: async (ctx, { id, key, clientId, target, revision }) => {
    await requireGuest(ctx, key)
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const actor = actorFor(seatFor(room, key, clientId, Date.now()))
    assertRevision(room, revision)
    const game = activeGame(room)
    if (game.turn !== actor || game.stealing) throw new Error('지금은 당신의 차례가 아닙니다.')
    const shell = game.chamber[0]
    const victim = target === 'self' ? actor : actor === 'you' ? 'dealer' : 'you'
    const next = shoot(game, actor, victim)
    await ctx.db.patch(id, { game: next, revision: revision + 1, updatedAt: Date.now() })
    return { shell }
  },
})

export const useItem = mutation({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string(), slot: v.number(), revision: v.number() },
  handler: async (ctx, { id, key, clientId, slot, revision }) => {
    await requireGuest(ctx, key)
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const actor = actorFor(seatFor(room, key, clientId, Date.now()))
    assertRevision(room, revision)
    const game = activeGame(room)
    if (!Number.isInteger(slot) || !canUseItem(game, actor, slot)) throw new Error('이 아이템은 지금 사용할 수 없습니다.')
    await ctx.db.patch(id, { game: applyItem(game, actor, slot), revision: revision + 1, updatedAt: Date.now() })
    return null
  },
})

export const takeItem = mutation({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string(), slot: v.number(), revision: v.number() },
  handler: async (ctx, { id, key, clientId, slot, revision }) => {
    await requireGuest(ctx, key)
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const actor = actorFor(seatFor(room, key, clientId, Date.now()))
    assertRevision(room, revision)
    const game = activeGame(room)
    const victim = actor === 'you' ? 'dealer' : 'you'
    const item = game.inventory[victim][slot]
    if (!Number.isInteger(slot) || game.turn !== actor || game.stealing !== actor || !item || !canUseEffect(game, actor, item)) {
      throw new Error('이 아이템은 가져올 수 없습니다.')
    }
    await ctx.db.patch(id, { game: takeStolenItem(game, actor, slot), revision: revision + 1, updatedAt: Date.now() })
    return null
  },
})

export const openBox = mutation({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string(), revision: v.number() },
  handler: async (ctx, { id, key, clientId, revision }) => {
    await requireGuest(ctx, key)
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const actor = actorFor(seatFor(room, key, clientId, Date.now()))
    assertRevision(room, revision)
    const game = room.game as GameState | undefined
    if (!game || game.status !== 'dealing') throw new Error('열 수 있는 아이템 상자가 없습니다.')
    if (!isRoomSeatActive(room.guestSeenAt, Date.now())) throw new Error('상대의 연결이 끊겼습니다.')
    if (game.turn !== actor) throw new Error('상자를 열 차례가 아닙니다.')
    await ctx.db.patch(id, { game: grantItems(game, Math.random, MULTIPLAYER_ITEM_POOL), revision: revision + 1, updatedAt: Date.now() })
    return null
  },
})

export const leave = mutation({
  args: { id: v.id('rooms'), key: v.string(), clientId: v.string() },
  handler: async (ctx, { id, key, clientId }) => {
    const room = await ctx.db.get(id)
    if (!room) return null
    if (room.hostKey !== key && room.guestKey !== key) return null
    if (room.hostKey === key && room.hostClientId !== clientId) return null
    if (room.guestKey === key && room.guestClientId !== clientId) return null
    const seat = room.hostKey === key ? 'host' : 'guest'
    if (seat === 'host') await ctx.db.delete(id)
    else await ctx.db.patch(id, { ...clearGuest(room), updatedAt: Date.now() })
    return null
  },
})

export const cleanupStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ROOM_LEASE_MS
    const stale = await ctx.db.query('rooms').withIndex('by_updated_at', (q) => q.lt('updatedAt', cutoff)).take(100)
    for (const room of stale) await ctx.db.delete(room._id)
  },
})
