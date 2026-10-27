export type Shell = 'live' | 'blank'
export type Player = 'you' | 'dealer'
export type Item =
  | 'magnifier' | 'beer' | 'saw' | 'cigarette' | 'handcuffs'
  | 'phone' | 'inverter' | 'medicine' | 'adrenaline' | 'jammer'

export const MAX_HEALTH = 4
export const MAX_ITEMS = 8
export const ITEM_POOL: Item[] = [
  'magnifier', 'beer', 'saw', 'cigarette', 'handcuffs',
  'phone', 'inverter', 'medicine', 'adrenaline',
]
export const MULTIPLAYER_ITEM_POOL: Item[] = [...ITEM_POOL, 'jammer']

const itemNames: Record<Item, string> = {
  magnifier: '돋보기', beer: '맥주', saw: '톱', cigarette: '담배',
  handcuffs: '수갑', phone: '버너폰', inverter: '인버터',
  medicine: '유통기한 약', adrenaline: '아드레날린', jammer: '전파 방해 장치',
}

type Forecast = { position: number; shell: Shell }
export type GameState = {
  health: Record<Player, number>
  chamber: Shell[]
  turn: Player
  loadNumber: number
  inventory: Record<Player, Item[]>
  known: Record<Player, Shell | null>
  forecasts: Record<Player, Forecast[]>
  saw: Record<Player, boolean>
  skip: Record<Player, boolean>
  stealing: Player | null
  status: 'playing' | 'dealing' | 'over'
  message: string
  log: string[]
}

const other = (player: Player): Player => player === 'you' ? 'dealer' : 'you'
const name = (player: Player) => player === 'you' ? '당신' : '딜러'
const subject = (player: Player) => player === 'you' ? '당신이' : '딜러가'
const shellName = (shell: Shell) => shell === 'live' ? '실탄' : '공포탄'
const appendLog = (log: string[], entry: string) => [entry, ...log].slice(0, 7)
const inverse = (shell: Shell): Shell => shell === 'live' ? 'blank' : 'live'

export function getCounts(chamber: Shell[]) {
  return chamber.reduce((counts, shell) => ({ ...counts, [shell]: counts[shell] + 1 }), { live: 0, blank: 0 })
}

export function makeChamber(random = Math.random): Shell[] {
  const size = 4 + Math.floor(random() * 3)
  const liveCount = 1 + Math.floor(random() * (size - 1))
  const chamber: Shell[] = [
    ...Array.from({ length: liveCount }, (): Shell => 'live'),
    ...Array.from({ length: size - liveCount }, (): Shell => 'blank'),
  ]
  for (let i = chamber.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[chamber[i], chamber[j]] = [chamber[j], chamber[i]]
  }
  return chamber
}

export function createGame(random = Math.random): GameState {
  return {
    health: { you: MAX_HEALTH, dealer: MAX_HEALTH },
    chamber: makeChamber(random),
    turn: 'you',
    loadNumber: 1,
    inventory: { you: [], dealer: [] },
    known: { you: null, dealer: null },
    forecasts: { you: [], dealer: [] },
    saw: { you: false, dealer: false },
    skip: { you: false, dealer: false },
    stealing: null,
    status: 'playing',
    message: '첫 장전에는 아이템이 없습니다. 탄환을 모두 쓰면 상자가 도착합니다.',
    log: ['첫 장전 완료. 아이템 없이 시작합니다.'],
  }
}

function nextIntel(state: GameState) {
  const forecasts: GameState['forecasts'] = { you: [], dealer: [] }
  const known: GameState['known'] = { you: null, dealer: null }
  for (const player of ['you', 'dealer'] as const) {
    for (const entry of state.forecasts[player]) {
      if (entry.position === 1) known[player] = entry.shell
      else if (entry.position > 1) forecasts[player].push({ ...entry, position: entry.position - 1 })
    }
  }
  return { known, forecasts }
}

function replenish(state: GameState, random = Math.random): GameState {
  const loadNumber = state.loadNumber + 1
  const suppliesArrive = loadNumber % 2 === 0
  return {
    ...state,
    chamber: makeChamber(random),
    loadNumber,
    known: { you: null, dealer: null },
    forecasts: { you: [], dealer: [] },
    status: suppliesArrive ? 'dealing' : 'playing',
    message: suppliesArrive
      ? '새 장전. 아이템 상자를 열어 양쪽에 도구를 지급하세요.'
      : '새 장전. 이번에는 아이템 보급 없이 계속 진행합니다.',
    log: appendLog(state.log, String(loadNumber) + '번째 장전. ' + (suppliesArrive ? '아이템 상자가 도착했습니다.' : '아이템 보급은 없습니다.')),
  }
}

function drawItems(count: number, random = Math.random, pool = ITEM_POOL): Item[] {
  const picked: Item[] = []
  for (let i = 0; i < count; i++) {
    const options = pool.filter((item) => !picked.includes(item))
    picked.push(options[Math.floor(random() * options.length)])
  }
  return picked
}

export function grantItems(state: GameState, random = Math.random, pool = ITEM_POOL): GameState {
  if (state.status !== 'dealing') return state
  const you = drawItems(Math.min(2, MAX_ITEMS - state.inventory.you.length), random, pool)
  const dealer = drawItems(Math.min(2, MAX_ITEMS - state.inventory.dealer.length), random, pool)
  const summary = '아이템 지급: ' + (you.length ? you.map((item) => itemNames[item]).join(', ') : '빈 슬롯 없음')
  return {
    ...state,
    inventory: {
      you: [...state.inventory.you, ...you],
      dealer: [...state.inventory.dealer, ...dealer],
    },
    status: 'playing',
    message: summary,
    log: appendLog(state.log, summary),
  }
}

export function shoot(state: GameState, actor: Player, target: Player, random = Math.random): GameState {
  if (state.status !== 'playing' || state.turn !== actor || state.stealing || !state.chamber.length) return state
  const shell = state.chamber[0]
  const damage = shell === 'live' ? (state.saw[actor] ? 2 : 1) : 0
  const health = { ...state.health, [target]: Math.max(0, state.health[target] - damage) }
  const retained = actor === target && shell === 'blank'
  const skip = { ...state.skip }
  let turn = retained ? actor : other(actor)
  let skipped = false
  if (turn !== actor && skip[turn]) {
    skip[turn] = false
    turn = actor
    skipped = true
  }
  const summary = name(actor) + ' → ' + (target === actor ? '자신' : name(target)) + ': ' + shellName(shell)
    + (damage ? ', 피해 ' + damage : '') + (retained ? ' · 턴 유지' : '') + (skipped ? ' · 상대 턴 건너뜀' : '')
  let next: GameState = {
    ...state,
    chamber: state.chamber.slice(1),
    health,
    turn,
    skip,
    ...nextIntel(state),
    saw: { ...state.saw, [actor]: false },
    message: summary,
    log: appendLog(state.log, summary),
  }
  if (health.you === 0 || health.dealer === 0) {
    const winner = health.dealer === 0 ? '당신' : '딜러'
    return { ...next, status: 'over', message: winner + ' 승리. 다시 도전하시겠습니까?' }
  }
  if (next.chamber.length === 0) next = replenish(next, random)
  return next
}

export function canUseEffect(state: GameState, actor: Player, item: Item): boolean {
  if (item === 'cigarette' && state.health[actor] === MAX_HEALTH) return false
  if (item === 'saw' && state.saw[actor]) return false
  if (item === 'phone' && state.chamber.length < 2) return false
  if ((item === 'handcuffs' || item === 'jammer') && state.skip[other(actor)]) return false
  if (item === 'adrenaline') return false
  return true
}

export function canUseItem(state: GameState, actor: Player, slot: number): boolean {
  if (state.status !== 'playing' || state.turn !== actor || state.stealing) return false
  const item = state.inventory[actor][slot]
  if (!item) return false
  if (item === 'adrenaline') {
    return state.inventory[other(actor)].some((target) => canUseEffect(state, actor, target))
  }
  return canUseEffect(state, actor, item)
}

function resolveEffect(state: GameState, actor: Player, item: Item, random = Math.random): GameState {
  let next: GameState
  let summary: string
  if (item === 'magnifier') {
    next = { ...state, known: { ...state.known, [actor]: state.chamber[0] } }
    summary = subject(actor) + ' 현재 탄환을 확인했습니다.'
  } else if (item === 'beer') {
    next = {
      ...state,
      chamber: state.chamber.slice(1),
      ...nextIntel(state),
      saw: { ...state.saw, [actor]: false },
    }
    summary = subject(actor) + ' ' + shellName(state.chamber[0]) + '을 배출했습니다.'
  } else if (item === 'saw') {
    next = { ...state, saw: { ...state.saw, [actor]: true } }
    summary = subject(actor) + ' 톱을 사용했습니다. 다음 실탄 피해 +1.'
  } else if (item === 'cigarette') {
    next = { ...state, health: { ...state.health, [actor]: Math.min(MAX_HEALTH, state.health[actor] + 1) } }
    summary = subject(actor) + ' 체력 1을 회복했습니다.'
  } else if (item === 'handcuffs' || item === 'jammer') {
    next = { ...state, skip: { ...state.skip, [other(actor)]: true } }
    summary = subject(actor) + (item === 'jammer' ? ' 전파 방해 장치를' : ' 수갑을') + ' 사용했습니다. 상대의 다음 턴을 건너뜁니다.'
  } else if (item === 'phone') {
    const position = 1 + Math.floor(random() * (state.chamber.length - 1))
    const shell = state.chamber[position]
    next = {
      ...state,
      forecasts: {
        ...state.forecasts,
        [actor]: [...state.forecasts[actor], { position, shell }],
      },
    }
    summary = subject(actor) + ' 버너폰으로 미래 탄환 하나를 확인했습니다.'
  } else if (item === 'inverter') {
    const chamber = [inverse(state.chamber[0]), ...state.chamber.slice(1)]
    next = {
      ...state,
      chamber,
      known: {
        you: state.known.you === null ? null : inverse(state.known.you),
        dealer: state.known.dealer === null ? null : inverse(state.known.dealer),
      },
    }
    summary = subject(actor) + ' 현재 탄환을 반전했습니다.'
  } else if (item === 'medicine') {
    const recovered = random() < 0.5
    const value = Math.max(0, Math.min(MAX_HEALTH, state.health[actor] + (recovered ? 2 : -1)))
    next = { ...state, health: { ...state.health, [actor]: value } }
    summary = subject(actor) + (recovered ? ' 약으로 체력 2를 회복했습니다.' : ' 약의 부작용으로 체력 1을 잃었습니다.')
  } else {
    return state
  }
  next = { ...next, message: summary, log: appendLog(state.log, summary) }
  if (next.health[actor] === 0) {
    return { ...next, status: 'over', message: name(other(actor)) + ' 승리. 다시 도전하시겠습니까?' }
  }
  if (next.chamber.length === 0) next = replenish(next, random)
  return next
}

export function applyItem(state: GameState, actor: Player, slot: number, random = Math.random): GameState {
  if (!canUseItem(state, actor, slot)) return state
  const item = state.inventory[actor][slot]
  const inventory = {
    ...state.inventory,
    [actor]: state.inventory[actor].filter((_, index) => index !== slot),
  }
  const next = { ...state, inventory }
  if (item === 'adrenaline') {
    const summary = subject(actor) + ' 아드레날린을 사용했습니다. 상대 아이템을 선택하세요.'
    return { ...next, stealing: actor, message: summary, log: appendLog(state.log, summary) }
  }
  return resolveEffect(next, actor, item, random)
}

export function takeStolenItem(state: GameState, actor: Player, slot: number, random = Math.random): GameState {
  if (state.status !== 'playing' || state.turn !== actor || state.stealing !== actor) return state
  const victim = other(actor)
  const item = state.inventory[victim][slot]
  if (!item || !canUseEffect(state, actor, item)) return state
  const inventory = {
    ...state.inventory,
    [victim]: state.inventory[victim].filter((_, index) => index !== slot),
  }
  return resolveEffect({ ...state, inventory, stealing: null }, actor, item, random)
}

export function dealerMove(state: GameState, random = Math.random): GameState {
  if (state.status !== 'playing' || state.turn !== 'dealer') return state
  if (state.stealing === 'dealer') {
    const slot = state.inventory.you.findIndex((item) => canUseEffect(state, 'dealer', item))
    return slot >= 0 ? takeStolenItem(state, 'dealer', slot, random) : { ...state, stealing: null }
  }
  const tryItem = (item: Item) => {
    const slot = state.inventory.dealer.findIndex((held) => held === item)
    return slot < 0 || !canUseItem(state, 'dealer', slot) ? null : applyItem(state, 'dealer', slot, random)
  }
  if (state.health.dealer <= 2) {
    const heal = tryItem('cigarette') ?? tryItem('medicine')
    if (heal) return heal
  }
  if (state.known.dealer === null && state.chamber.length > 1) {
    const inspect = tryItem('magnifier')
    if (inspect) return inspect
  }
  if (state.known.dealer === 'blank') {
    const flip = tryItem('inverter')
    if (flip) return flip
  }
  const counts = getCounts(state.chamber)
  const liveChance = state.known.dealer === 'live' ? 1 : state.known.dealer === 'blank' ? 0 : counts.live / state.chamber.length
  if (liveChance === 1) {
    const strengthen = tryItem('saw')
    if (strengthen) return strengthen
  }
  if (!state.skip.you && liveChance >= 0.5) {
    const restrain = tryItem('handcuffs') ?? tryItem('jammer')
    if (restrain) return restrain
  }
  if (state.chamber.length > 2 && state.forecasts.dealer.length === 0) {
    const lookAhead = tryItem('phone')
    if (lookAhead) return lookAhead
  }
  return shoot(state, 'dealer', liveChance >= 0.5 ? 'you' : 'dealer', random)
}
