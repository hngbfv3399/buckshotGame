import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { applyItem, canUseEffect, canUseItem, createGame, grantItems, shoot, takeStolenItem, type GameState, type Player } from '../src/game'
import { projectGame, type Seat } from '../src/multiplayer'
import type { Doc } from './_generated/dataModel'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z2-9]/g, '')
}

function cleanName(name: string) {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 18)
  if (!cleaned) throw new Error('이름을 입력하세요.')
  return cleaned
}

function assertKey(key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('유효하지 않은 플레이어 키입니다.')
}

function seatFor(room: Doc<'rooms'>, key: string): Seat {
  assertKey(key)
  if (room.hostKey === key) return 'host'
  if (room.guestKey === key) return 'guest'
  throw new Error('이 방에 참여하지 않았습니다.')
}

function actorFor(seat: Seat): Player {
  return seat === 'host' ? 'you' : 'dealer'
}

function activeGame(room: Doc<'rooms'>): GameState {
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
  args: { key: v.string(), name: v.string() },
  handler: async (ctx, { key, name }) => {
    assertKey(key)
    const hostName = cleanName(name)
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = randomCode()
      const existing = await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', code)).first()
      if (existing) continue
      const id = await ctx.db.insert('rooms', {
        code, hostKey: key, hostName,
        hostReady: false, guestReady: false,
        revision: 0,
        updatedAt: Date.now(),
      })
      return { id, code }
    }
    throw new Error('방 코드를 만들지 못했습니다. 다시 시도하세요.')
  },
})

export const join = mutation({
  args: { code: v.string(), key: v.string(), name: v.string() },
  handler: async (ctx, { code, key, name }) => {
    assertKey(key)
    const guestName = cleanName(name)
    const room = await ctx.db.query('rooms').withIndex('by_code', (q) => q.eq('code', normalizeCode(code))).first()
    if (!room) throw new Error('방을 찾을 수 없습니다. 초대 코드를 확인하세요.')
    if (room.hostKey === key || room.guestKey === key) return { id: room._id, code: room.code }
    if (room.guestKey) throw new Error('이미 두 명이 참여 중인 방입니다.')
    if (room.game && room.game.status !== 'over') throw new Error('진행 중인 방에는 참여할 수 없습니다.')
    await ctx.db.patch(room._id, { guestKey: key, guestName, guestReady: false, hostReady: false, game: undefined, revision: (room.revision ?? 0) + 1, updatedAt: Date.now() })
    return { id: room._id, code: room.code }
  },
})

export const view = query({
  args: { id: v.id('rooms'), key: v.string() },
  handler: async (ctx, { id, key }) => {
    if (!/^[a-f0-9]{64}$/.test(key)) return null
    const room = await ctx.db.get(id)
    if (!room || (room.hostKey !== key && room.guestKey !== key)) return null
    const seat = seatFor(room, key)
    return {
      id: room._id,
      code: room.code,
      revision: room.revision ?? 0,
      seat,
      selfName: seat === 'host' ? room.hostName : room.guestName ?? '참가자',
      opponentName: seat === 'host' ? room.guestName ?? null : room.hostName,
      selfReady: seat === 'host' ? room.hostReady : room.guestReady,
      opponentReady: seat === 'host' ? room.guestReady : room.hostReady,
      game: room.game ? projectGame(room.game as GameState, seat) : null,
    }
  },
})

export const setReady = mutation({
  args: { id: v.id('rooms'), key: v.string(), ready: v.boolean() },
  handler: async (ctx, { id, key, ready }) => {
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const seat = seatFor(room, key)
    if (room.game && (room.game as GameState).status !== 'over') throw new Error('게임 진행 중에는 준비 상태를 바꿀 수 없습니다.')
    const hostReady = seat === 'host' ? ready : room.hostReady
    const guestReady = seat === 'guest' ? ready : room.guestReady
    if (room.guestKey && hostReady && guestReady) {
      await ctx.db.patch(id, { hostReady: false, guestReady: false, game: createGame(), revision: (room.revision ?? 0) + 1, updatedAt: Date.now() })
    } else {
      await ctx.db.patch(id, { hostReady, guestReady, revision: (room.revision ?? 0) + 1, updatedAt: Date.now() })
    }
    return null
  },
})

export const fire = mutation({
  args: { id: v.id('rooms'), key: v.string(), target: v.union(v.literal('self'), v.literal('opponent')), revision: v.number() },
  handler: async (ctx, { id, key, target, revision }) => {
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const actor = actorFor(seatFor(room, key))
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
  args: { id: v.id('rooms'), key: v.string(), slot: v.number(), revision: v.number() },
  handler: async (ctx, { id, key, slot, revision }) => {
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const actor = actorFor(seatFor(room, key))
    assertRevision(room, revision)
    const game = activeGame(room)
    if (!Number.isInteger(slot) || !canUseItem(game, actor, slot)) throw new Error('이 아이템은 지금 사용할 수 없습니다.')
    await ctx.db.patch(id, { game: applyItem(game, actor, slot), revision: revision + 1, updatedAt: Date.now() })
    return null
  },
})

export const takeItem = mutation({
  args: { id: v.id('rooms'), key: v.string(), slot: v.number(), revision: v.number() },
  handler: async (ctx, { id, key, slot, revision }) => {
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const actor = actorFor(seatFor(room, key))
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
  args: { id: v.id('rooms'), key: v.string(), revision: v.number() },
  handler: async (ctx, { id, key, revision }) => {
    const room = await ctx.db.get(id)
    if (!room) throw new Error('방을 찾을 수 없습니다.')
    const actor = actorFor(seatFor(room, key))
    assertRevision(room, revision)
    const game = room.game as GameState | undefined
    if (!game || game.status !== 'dealing') throw new Error('열 수 있는 아이템 상자가 없습니다.')
    if (game.turn !== actor) throw new Error('상자를 열 차례가 아닙니다.')
    await ctx.db.patch(id, { game: grantItems(game), revision: revision + 1, updatedAt: Date.now() })
    return null
  },
})

export const leave = mutation({
  args: { id: v.id('rooms'), key: v.string() },
  handler: async (ctx, { id, key }) => {
    const room = await ctx.db.get(id)
    if (!room) return null
    const seat = seatFor(room, key)
    if (seat === 'host') await ctx.db.delete(id)
    else await ctx.db.patch(id, {
      guestKey: undefined, guestName: undefined, guestReady: false,
      hostReady: false, game: undefined, revision: (room.revision ?? 0) + 1, updatedAt: Date.now(),
    })
    return null
  },
})
