import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyItem, createGame, getCounts, grantItems, makeChamber, MULTIPLAYER_ITEM_POOL,
  shoot, takeStolenItem,
} from '../src/game.ts'

function state(chamber, you = [], dealer = []) {
  return { ...createGame(() => 0.2), chamber, inventory: { you, dealer } }
}

test('첫 장전의 아이템 슬롯은 비어 있다', () => {
  const game = createGame(() => 0.2)
  assert.deepEqual(game.inventory, { you: [], dealer: [] })
  assert.equal(game.status, 'playing')
  assert.equal(game.chamber.length, 4)
})

test('첫 장전의 탄환 수와 실탄 비율도 매 판 달라진다', () => {
  const low = createGame(() => 0.1)
  const high = createGame(() => 0.8)
  assert.deepEqual(getCounts(low.chamber), { live: 1, blank: 3 })
  assert.deepEqual(getCounts(high.chamber), { live: 5, blank: 1 })
  assert.equal(high.chamber.length, 6)
})

test('장전에는 실탄과 공포탄이 모두 들어가며 개수가 맞는다', () => {
  const chamber = makeChamber(() => 0.2)
  const counts = getCounts(chamber)
  assert.ok(counts.live > 0)
  assert.ok(counts.blank > 0)
  assert.equal(counts.live + counts.blank, chamber.length)
})

test('자신에게 공포탄을 쏘면 턴을 유지한다', () => {
  const next = shoot(state(['blank', 'live']), 'you', 'you')
  assert.equal(next.turn, 'you')
  assert.equal(next.health.you, 4)
  assert.deepEqual(next.chamber, ['live'])
})

test('상대에게 공포탄을 쏘면 턴이 넘어간다', () => {
  const next = shoot(state(['blank', 'live']), 'you', 'dealer')
  assert.equal(next.turn, 'dealer')
  assert.equal(next.health.dealer, 4)
})

test('빈 장전 뒤 상자를 열어 양쪽에 두 종류씩 지급한다', () => {
  const reload = shoot(state(['blank']), 'you', 'you', () => 0.2)
  assert.equal(reload.status, 'dealing')
  assert.equal(reload.loadNumber, 2)
  assert.deepEqual(reload.inventory.you, [])
  const dealt = grantItems(reload, () => 0.2)
  assert.equal(dealt.status, 'playing')
  assert.equal(dealt.inventory.you.length, 2)
  assert.equal(dealt.inventory.dealer.length, 2)
  assert.notEqual(dealt.inventory.you[0], dealt.inventory.you[1])
})

test('아이템 보급은 2번째 장전부터 두 장전마다 도착한다', () => {
  const second = shoot(state(['blank']), 'you', 'you', () => 0.2)
  const supplied = grantItems(second, () => 0.2)
  const third = shoot({ ...supplied, chamber: ['blank'] }, 'you', 'you', () => 0.2)
  assert.equal(third.loadNumber, 3)
  assert.equal(third.status, 'playing')
  assert.deepEqual(third.inventory, supplied.inventory)
  assert.match(third.message, /보급 없이/)
  assert.equal(grantItems(third), third)

  const fourth = shoot({ ...third, chamber: ['blank'] }, 'you', 'you', () => 0.2)
  assert.equal(fourth.loadNumber, 4)
  assert.equal(fourth.status, 'dealing')
  const nextSupply = grantItems(fourth, () => 0.2)
  assert.equal(nextSupply.inventory.you.length, 4)
  assert.equal(nextSupply.inventory.dealer.length, 4)
})

test('아이템은 8개 슬롯을 넘지 않고, 선택한 슬롯 하나만 소비한다', () => {
  const seven = ['beer', 'beer', 'saw', 'phone', 'cigarette', 'inverter', 'magnifier']
  const waiting = { ...state(['blank'], seven), status: 'dealing' }
  const dealt = grantItems(waiting, () => 0.2)
  assert.equal(dealt.inventory.you.length, 8)
  const used = applyItem(state(['blank', 'live'], ['beer', 'beer']), 'you', 1)
  assert.deepEqual(used.inventory.you, ['beer'])
})

test('톱을 사용한 실탄은 피해 2를 주고 효과가 사라진다', () => {
  const armed = applyItem(state(['live', 'blank'], ['saw']), 'you', 0)
  const next = shoot(armed, 'you', 'dealer')
  assert.equal(next.health.dealer, 2)
  assert.equal(next.saw.you, false)
})

test('돋보기로 본 탄환을 인버터로 반전하면 정보도 바뀐다', () => {
  const inspected = applyItem(state(['live', 'blank'], ['magnifier', 'inverter']), 'you', 0)
  assert.equal(inspected.known.you, 'live')
  const flipped = applyItem(inspected, 'you', 0)
  assert.equal(flipped.chamber[0], 'blank')
  assert.equal(flipped.known.you, 'blank')
})

test('버너폰의 미래 탄환 정보는 발사 후 현재 탄환 정보가 된다', () => {
  const watched = applyItem(state(['blank', 'live', 'blank'], ['phone']), 'you', 0, () => 0)
  assert.deepEqual(watched.forecasts.you, [{ position: 1, shell: 'live' }])
  const next = shoot(watched, 'you', 'you')
  assert.equal(next.known.you, 'live')
})

test('수갑은 상대의 다음 턴을 한 번 건너뛴다', () => {
  const cuffed = applyItem(state(['blank', 'live'], ['handcuffs']), 'you', 0)
  const next = shoot(cuffed, 'you', 'dealer')
  assert.equal(next.turn, 'you')
  assert.equal(next.skip.dealer, false)
})

test('멀티플레이 상자에는 전파 방해 장치가 나오고 상대 턴을 건너뛴다', () => {
  const waiting = { ...state(['live', 'blank']), status: 'dealing' }
  const dealt = grantItems(waiting, () => 0.99, MULTIPLAYER_ITEM_POOL)
  assert.ok(dealt.inventory.you.includes('jammer'))
  const jammed = applyItem(state(['live', 'blank'], ['jammer']), 'you', 0)
  assert.equal(jammed.skip.dealer, true)
  const next = shoot(jammed, 'you', 'dealer')
  assert.equal(next.turn, 'you')
})

test('아드레날린으로 상대 아이템을 골라 즉시 사용한다', () => {
  const injected = applyItem(state(['live', 'blank'], ['adrenaline'], ['saw']), 'you', 0)
  assert.equal(injected.stealing, 'you')
  const stolen = takeStolenItem(injected, 'you', 0)
  assert.deepEqual(stolen.inventory.dealer, [])
  assert.equal(stolen.saw.you, true)
  assert.equal(stolen.stealing, null)
})

test('유통기한 약은 회복 또는 피해를 준다', () => {
  const starting = { ...state(['live', 'blank'], ['medicine']), health: { you: 2, dealer: 4 } }
  assert.equal(applyItem(starting, 'you', 0, () => 0).health.you, 4)
  assert.equal(applyItem(starting, 'you', 0, () => 0.9).health.you, 1)
  assert.equal(applyItem({ ...starting, chamber: ['blank', 'live'] }, 'you', 0, () => 0).health.you, 4)
})

test('체력이 0이 되면 게임이 끝나고 이후 행동을 받지 않는다', () => {
  const nearEnd = { ...state(['live', 'blank']), health: { you: 4, dealer: 1 } }
  const ended = shoot(nearEnd, 'you', 'dealer')
  assert.equal(ended.status, 'over')
  assert.equal(ended.health.dealer, 0)
  assert.equal(shoot(ended, 'dealer', 'you'), ended)
})
