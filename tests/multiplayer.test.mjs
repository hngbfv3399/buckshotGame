import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame } from '../src/game.ts'
import { createMultiplayerGame, projectGame } from '../src/multiplayer.ts'
import { GUEST_SESSION_MS, parseGuestSession } from '../src/guestSession.ts'
import { isRoomSeatActive, ROOM_LEASE_MS } from '../src/roomPresence.ts'

test('응답이 끊긴 참가자의 방 자리는 제한 시간 뒤 만료된다', () => {
  assert.equal(isRoomSeatActive(1000, 1000 + ROOM_LEASE_MS - 1), true)
  assert.equal(isRoomSeatActive(1000, 1000 + ROOM_LEASE_MS), false)
  assert.equal(isRoomSeatActive(undefined, 1000), false)
})

test('게스트 로그인은 한 시간 동안만 복구된다', () => {
  const saved = JSON.stringify({ key: 'a'.repeat(64), name: '테스터', expiresAt: 1000 + GUEST_SESSION_MS })
  assert.equal(parseGuestSession(saved, 1000 + GUEST_SESSION_MS - 1)?.name, '테스터')
  assert.equal(parseGuestSession(saved, 1000 + GUEST_SESSION_MS), null)
  assert.equal(parseGuestSession('{bad json'), null)
})

test('멀티플레이 선공은 방장과 참가자 모두 가능하고 화면에 맞게 표시된다', () => {
  const hostFirst = createMultiplayerGame(() => 0.2)
  const guestFirst = createMultiplayerGame(() => 0.8)
  assert.equal(hostFirst.turn, 'you')
  assert.equal(guestFirst.turn, 'dealer')
  assert.equal(projectGame(hostFirst, 'host').turn, 'you')
  assert.equal(projectGame(hostFirst, 'guest').turn, 'dealer')
  assert.equal(projectGame(guestFirst, 'host').turn, 'dealer')
  assert.equal(projectGame(guestFirst, 'guest').turn, 'you')
  assert.match(projectGame(guestFirst, 'guest').message, /^당신이 선공입니다\./)
  assert.match(projectGame(guestFirst, 'host').message, /^상대가 선공입니다\./)
})

test('서버 화면은 각자 본 탄환 정보만 전달한다', () => {
  const state = createGame(() => 0.2)
  state.known.you = 'live'
  state.forecasts.you = [{ position: 2, shell: 'blank' }]
  state.known.dealer = 'blank'
  state.forecasts.dealer = [{ position: 3, shell: 'live' }]
  const host = projectGame(state, 'host')
  const guest = projectGame(state, 'guest')
  assert.equal(host.known, 'live')
  assert.deepEqual(host.forecasts, [{ position: 2, shell: 'blank' }])
  assert.equal(guest.known, 'blank')
  assert.deepEqual(guest.forecasts, [{ position: 3, shell: 'live' }])
  assert.equal('chamber' in host, false)
  assert.equal('chamber' in guest, false)
  assert.deepEqual(host.counts, guest.counts)
})

test('게스트 화면에서는 자기 턴과 문장 주어가 올바르게 바뀐다', () => {
  const state = createGame(() => 0.2)
  state.turn = 'dealer'
  state.message = '당신이 현재 탄환을 확인했습니다.'
  state.log = ['딜러가 맥주를 사용했습니다.', state.message]
  const guest = projectGame(state, 'guest')
  assert.equal(guest.turn, 'you')
  assert.equal(guest.message, '상대가 현재 탄환을 확인했습니다.')
  assert.equal(guest.log[0], '당신이 맥주를 사용했습니다.')
})
