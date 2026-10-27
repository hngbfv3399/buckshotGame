import { createGame, getCounts, type GameState, type Item, type Player, type Shell } from './game.ts'

export type Seat = 'host' | 'guest'

export type MultiplayerGame = {
  health: Record<Player, number>
  turn: Player
  loadNumber: number
  inventory: Record<Player, Item[]>
  known: Shell | null
  forecasts: { position: number; shell: Shell }[]
  saw: boolean
  skipOpponent: boolean
  stealing: boolean
  status: GameState['status']
  message: string
  log: string[]
  remaining: number
  counts: { live: number; blank: number }
}

export type RoomView = {
  id: string
  code: string
  revision: number
  seat: Seat
  selfName: string
  opponentName: string | null
  selfReady: boolean
  opponentReady: boolean
  game: MultiplayerGame | null
}

export function createMultiplayerGame(random = Math.random): GameState {
  const game = createGame(random)
  const turn: Player = random() < 0.5 ? 'you' : 'dealer'
  const firstTurn = turn === 'you' ? '당신이 선공입니다.' : '딜러가 선공입니다.'
  return {
    ...game,
    turn,
    message: firstTurn + ' ' + game.message,
    log: [firstTurn, ...game.log],
  }
}

function localize(message: string, seat: Seat) {
  if (seat === 'host') return message.replaceAll('딜러', '상대')
  return message
    .replaceAll('당신이', '상대가')
    .replaceAll('당신', '\u0000')
    .replaceAll('딜러가', '당신이')
    .replaceAll('딜러', '당신')
    .replaceAll('\u0000', '상대')
}

export function projectGame(state: GameState, seat: Seat): MultiplayerGame {
  const self: Player = seat === 'host' ? 'you' : 'dealer'
  const opponent: Player = seat === 'host' ? 'dealer' : 'you'
  return {
    health: { you: state.health[self], dealer: state.health[opponent] },
    turn: state.turn === self ? 'you' : 'dealer',
    loadNumber: state.loadNumber,
    inventory: { you: [...state.inventory[self]], dealer: [...state.inventory[opponent]] },
    known: state.known[self],
    forecasts: state.forecasts[self].map((forecast) => ({ ...forecast })),
    saw: state.saw[self],
    skipOpponent: state.skip[opponent],
    stealing: state.stealing === self,
    status: state.status,
    message: localize(state.message, seat),
    log: state.log.map((entry) => localize(entry, seat)),
    remaining: state.chamber.length,
    counts: getCounts(state.chamber),
  }
}

export function canUseVisibleItem(game: MultiplayerGame, slot: number): boolean {
  if (game.status !== 'playing' || game.turn !== 'you' || game.stealing) return false
  const item = game.inventory.you[slot]
  if (!item) return false
  if (item === 'cigarette') return game.health.you < 4
  if (item === 'saw') return !game.saw
  if (item === 'phone') return game.remaining >= 2
  if (item === 'handcuffs' || item === 'jammer') return !game.skipOpponent
  if (item === 'adrenaline') return game.inventory.dealer.some((target) => canTakeVisibleItem(game, target))
  return true
}

export function canTakeVisibleItem(game: MultiplayerGame, item: Item): boolean {
  return item !== 'adrenaline' &&
    (item !== 'cigarette' || game.health.you < 4) &&
    (item !== 'saw' || !game.saw) &&
    (item !== 'phone' || game.remaining >= 2) &&
    ((item !== 'handcuffs' && item !== 'jammer') || !game.skipOpponent)
}
