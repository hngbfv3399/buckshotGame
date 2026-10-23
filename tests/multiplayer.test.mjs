import test from 'node:test'
import assert from 'node:assert/strict'
import { createGame } from '../src/game.ts'
import { projectGame } from '../src/multiplayer.ts'
import { shouldRestoreRoom } from '../src/roomSession.ts'
import { isRoomSeatActive, ROOM_LEASE_MS } from '../src/roomPresence.ts'

test('응답이 끊긴 참가자의 방 자리는 제한 시간 뒤 만료된다', () => {
  assert.equal(isRoomSeatActive(1000, 1000 + ROOM_LEASE_MS - 1), true)
  assert.equal(isRoomSeatActive(1000, 1000 + ROOM_LEASE_MS), false)
  assert.equal(isRoomSeatActive(undefined, 1000), false)
})

test('초대 링크가 없으면 지난 방에 다시 들어가지 않는다', () => {
  assert.equal(shouldRestoreRoom('', 'ABC123'), false)
  assert.equal(shouldRestoreRoom('?room=ABC123', 'ABC123'), true)
  assert.equal(shouldRestoreRoom('?room=NEW123', 'ABC123'), false)
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
