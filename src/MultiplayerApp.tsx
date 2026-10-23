import { useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { MAX_ITEMS, type Player, type Shell } from './game'
import { Gun, Health } from './GamePieces'
import { itemMeta } from './itemMeta'
import { canTakeVisibleItem, canUseVisibleItem, type MultiplayerGame } from './multiplayer'
import { shouldRestoreRoom } from './roomSession'
import './MultiplayerApp.css'

const roomStorageKey = 'chamber-room-id'
const roomCodeStorageKey = 'chamber-room-code'
const playerStorageKey = 'chamber-player-key'

function rememberedRoom(): Id<'rooms'> | null {
  const savedCode = sessionStorage.getItem(roomCodeStorageKey)
  if (!shouldRestoreRoom(location.search, savedCode)) return null
  return sessionStorage.getItem(roomStorageKey) as Id<'rooms'> | null
}

function playerKey() {
  const saved = sessionStorage.getItem(playerStorageKey)
  if (saved && /^[a-f0-9]{64}$/.test(saved)) return saved
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  sessionStorage.setItem(playerStorageKey, key)
  return key
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message.replace(/^\[CONVEX[^\]]*\]\s*/, '') : '요청을 처리하지 못했습니다.'
}

export default function MultiplayerApp({ onBack }: { onBack: () => void }) {
  const [key] = useState(playerKey)
  const [roomId, setRoomId] = useState<Id<'rooms'> | null>(rememberedRoom)
  const [name, setName] = useState(() => sessionStorage.getItem('chamber-player-name') ?? '')
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [aimTarget, setAimTarget] = useState<Player | null>(null)
  const [shotKind, setShotKind] = useState<Shell | null>(null)
  const aimTimer = useRef<number | null>(null)
  const resetTimer = useRef<number | null>(null)

  const room = useQuery(api.rooms.view, roomId ? { id: roomId, key } : 'skip')
  const createRoom = useMutation(api.rooms.create)
  const joinRoom = useMutation(api.rooms.join)
  const setReady = useMutation(api.rooms.setReady)
  const fire = useMutation(api.rooms.fire)
  const mutateItem = useMutation(api.rooms.useItem)
  const takeItem = useMutation(api.rooms.takeItem)
  const openBox = useMutation(api.rooms.openBox)
  const leave = useMutation(api.rooms.leave)

  function enterRoom(id: Id<'rooms'>, roomCode: string) {
    sessionStorage.setItem(roomStorageKey, id)
    sessionStorage.setItem(roomCodeStorageKey, roomCode)
    sessionStorage.setItem('chamber-player-name', name.trim())
    history.replaceState(null, '', '?room=' + roomCode)
    setRoomId(id)
    setError('')
  }

  async function run(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    try { await action() }
    catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }

  async function handleCreate() {
    await run(async () => {
      const result = await createRoom({ key, name })
      enterRoom(result.id, result.code)
    })
  }

  async function handleJoin() {
    await run(async () => {
      const result = await joinRoom({ key, name, code })
      enterRoom(result.id, result.code)
    })
  }

  function clearRoom() {
    sessionStorage.removeItem(roomStorageKey)
    sessionStorage.removeItem(roomCodeStorageKey)
    history.replaceState(null, '', location.pathname)
    setRoomId(null)
    setCode('')
    setAimTarget(null)
    setShotKind(null)
    if (aimTimer.current !== null) window.clearTimeout(aimTimer.current)
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
  }

  async function handleLeave(toSolo = false) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (roomId) await leave({ id: roomId, key })
    } catch (cause) {
      setError('서버에서 방 나가기를 완료하지 못했습니다. ' + errorText(cause))
    } finally {
      clearRoom()
      setBusy(false)
      if (toSolo) onBack()
    }
  }

  async function handleCopy() {
    if (!room) return
    try {
      await navigator.clipboard.writeText(location.origin + '/?room=' + room.code)
      setNotice('초대 링크를 복사했습니다.')
    } catch {
      setNotice('초대 코드: ' + room.code)
    }
  }

  function handleFire(target: Player) {
    if (!roomId || !room?.game || busy || aimTarget) return
    const revision = room.revision
    setBusy(true)
    setError('')
    setAimTarget(target)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    aimTimer.current = window.setTimeout(async () => {
      try {
        const result = await fire({ id: roomId, key, target: target === 'you' ? 'self' : 'opponent', revision })
        setShotKind(result.shell)
      } catch (cause) {
        setError(errorText(cause))
      }
      resetTimer.current = window.setTimeout(() => {
        setAimTarget(null)
        setShotKind(null)
        setBusy(false)
      }, reduced ? 0 : 650)
    }, reduced ? 0 : 500)
  }

  const game = room?.game as MultiplayerGame | null | undefined
  const playerTurn = game?.status === 'playing' && game.turn === 'you'
  const canAct = playerTurn && !busy && !aimTarget && !game?.stealing

  return <main className="app-shell multiplayer-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✳</span><span>THE CHAMBER <small>2인 멀티플레이</small></span></div>
      <div className="top-actions"><span className="prototype-badge">CONVEX / LIVE ROOM</span><button className="text-button" disabled={busy} onClick={() => void handleLeave(true)}>혼자 하기</button></div>
    </header>
    {!roomId ? <section className="lobby-layout">
      <div className="lobby-intro"><span className="eyebrow">PRIVATE ROOM / 2 PLAYERS</span><h1>같은 테이블에서<br />서로를 겨누세요.</h1><p>초대 코드로 한 명을 부르고, 두 사람이 준비하면 서버에서 탄환을 섞어 게임을 시작합니다.</p><div className="lobby-facts"><span>02 <small>PLAYERS</small></span><span>09 <small>ITEMS</small></span><span>01 <small>HIDDEN CHAMBER</small></span></div></div>
      <div className="lobby-card"><div className="section-header"><span>01 / 입장</span><strong>방 만들기 또는 참가</strong></div>
        <label className="lobby-label" htmlFor="player-name">플레이어 이름</label><input id="player-name" value={name} maxLength={18} onChange={(event) => setName(event.target.value)} placeholder="이름을 입력하세요" />
        <button className="primary-button lobby-create" disabled={busy || !name.trim()} onClick={handleCreate}>새 방 만들기 <span>↗</span></button>
        <div className="lobby-divider">또는 초대 코드로 참가</div>
        <label className="lobby-label" htmlFor="room-code">초대 코드</label><input id="room-code" value={code} maxLength={10} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="6자리 코드" onKeyDown={(event) => { if (event.key === 'Enter' && name.trim() && code.trim()) void handleJoin() }} />
        <button className="secondary-button" disabled={busy || !name.trim() || !code.trim()} onClick={handleJoin}>방 참가하기 <span>→</span></button>
        {error && <p className="room-error" role="alert">{error}</p>}
      </div>
    </section> : room === undefined ? <div className="room-loading">방에 연결하는 중…</div> : room === null ? <div className="room-loading"><p>방이 닫혔거나 입장 정보가 만료됐습니다.</p><button className="secondary-button" onClick={clearRoom}>다른 방 찾기</button></div> : !game ? <section className="room-waiting">
      <div className="room-waiting-main"><span className="eyebrow">WAITING ROOM / {room.seat === 'host' ? 'HOST' : 'GUEST'}</span><h1>두 사람이 준비하면<br />테이블이 열립니다.</h1><div className="room-code-box"><span>초대 코드</span><strong>{room.code}</strong><button className="text-button" onClick={handleCopy}>링크 복사 ↗</button></div><p>초대 링크를 상대에게 보내세요. 같은 링크를 새 탭에서 열어 참가할 수도 있습니다.</p>{notice && <p className="room-notice" role="status">{notice}</p>}</div>
      <div className="room-waiting-side"><div className="section-header"><span>02 / 참가자</span><strong>입장 상태</strong></div><div className="seat-row"><span>01 / {room.selfName}</span><strong>{room.selfReady ? '준비 완료' : '대기 중'}</strong></div><div className="seat-row"><span>02 / {room.opponentName ?? '상대 대기'}</span><strong>{room.opponentName ? room.opponentReady ? '준비 완료' : '대기 중' : '빈 자리'}</strong></div><button className="primary-button ready-button" disabled={busy || !room.opponentName} onClick={() => run(() => setReady({ id: roomId, key, ready: !room.selfReady }))}>{room.selfReady ? '준비 취소' : '준비하기'} <span>↗</span></button><button className="room-leave" disabled={busy} onClick={() => void handleLeave()}>방 나가기</button>{error && <p className="room-error" role="alert">{error}</p>}</div>
    </section> : <div className="layout">
      <section className="table-frame" aria-label="2인 플레이 테이블">
        <div className="table-heading"><div><span className="eyebrow">ROOM {room.code} / ONLINE</span><h1>끝까지 남는 쪽이 이긴다.</h1></div><div className="load-number">장전 <strong>{String(game.loadNumber).padStart(2, '0')}</strong></div></div>
        <div className={'table-surface' + (aimTarget ? ' aiming-' + aimTarget : '')}>
          <div className="opponent player-plate"><div className="avatar dealer-avatar" aria-hidden="true"><span>✳</span></div><div className="plate-copy"><span className="plate-kicker">OPPONENT / ONLINE</span><strong>{room.opponentName}</strong><Health value={game.health.dealer} label={room.opponentName ?? '상대'} /></div><span className={game.turn === 'dealer' && game.status === 'playing' ? 'turn-flag current' : 'turn-flag'}>{game.turn === 'dealer' && game.status === 'playing' ? '상대 턴' : '대기'}</span></div>
          <div className="table-center"><div className="ammo-board" aria-label={'남은 실탄 ' + game.counts.live + '발, 공포탄 ' + game.counts.blank + '발'}><span className="ammo-title">남은 탄환 <b>{String(game.remaining).padStart(2, '0')}</b></span><span className="ammo-count"><i className="ammo-dot live" /> 실탄 <b>{game.counts.live}</b></span><span className="ammo-count"><i className="ammo-dot blank" /> 공포탄 <b>{game.counts.blank}</b></span></div><div className="gun-wrap"><Gun aimTarget={aimTarget} shotKind={shotKind} /></div><div className="center-stamp" aria-hidden="true">CHOOSE YOUR NEXT MOVE · CHOOSE YOUR NEXT MOVE ·</div></div>
          <div className="self player-plate"><div className="avatar self-avatar" aria-hidden="true">YOU</div><div className="plate-copy"><span className="plate-kicker">PLAYER / ONLINE</span><strong>{room.selfName}</strong><Health value={game.health.you} label={room.selfName} /></div><span className={playerTurn ? 'turn-flag current' : 'turn-flag'}>{game.status === 'dealing' ? '상자 대기' : playerTurn ? '당신의 턴' : '대기'}</span></div>
        </div>
        <div className="controls"><div className="status-line" aria-live="polite"><span className="status-pulse" />{aimTarget && !shotKind ? (aimTarget === 'dealer' ? '상대에게 총구를 겨누는 중…' : '자신에게 총구를 겨누는 중…') : game.message}</div>
          {game.status === 'over' ? <div className="rematch-controls"><button className="primary-button ready-button" disabled={busy} onClick={() => run(() => setReady({ id: roomId, key, ready: !room.selfReady }))}>{room.selfReady ? '재대결 준비 취소' : '재대결 준비'} <span>↗</span></button><span>{room.selfReady ? '상대의 준비를 기다립니다.' : room.opponentReady ? '상대가 준비했습니다.' : '두 사람이 준비하면 새 게임이 시작됩니다.'}</span></div> : game.status === 'dealing' ? game.turn === 'you' ? <button className="primary-button deal-button" disabled={busy} onClick={() => run(() => openBox({ id: roomId, key, revision: room.revision }))}><span><small>SUPPLY BOX / 02 ITEMS EACH</small>아이템 상자 열기</span><span className="deal-icon">✳</span></button> : <div className="turn-wait">상대가 아이템 상자를 여는 중입니다.</div> : game.stealing ? <div className="steal-prompt">상대 아이템에서 즉시 사용할 도구를 선택하세요 <span>↗</span></div> : <div className="shoot-actions"><button className="shoot-button opponent-button" disabled={!canAct} onClick={() => handleFire('dealer')}><span className="button-index">01 / 공격</span><strong>상대에게 발사</strong><span className="button-arrow">↗</span></button><button className="shoot-button self-button" disabled={!canAct} onClick={() => handleFire('you')}><span className="button-index">02 / 승부</span><strong>나에게 발사</strong><span className="button-arrow">↗</span></button></div>}
          {error && <p className="room-error" role="alert">{error}</p>}</div>
      </section>
      <aside className="sidebar"><section className="side-section arsenal"><div className="section-header"><span>01 / 도구</span><strong>내 아이템</strong></div><div className="item-grid">{Array.from({ length: MAX_ITEMS }, (_, slot) => { const item = game.inventory.you[slot]; return item ? <button key={slot} className="item-button" disabled={busy || !canUseVisibleItem(game, slot)} onClick={() => run(() => mutateItem({ id: roomId, key, slot, revision: room.revision }))} title={itemMeta[item].description}><span className="item-symbol">{itemMeta[item].symbol}</span><span className="item-name">{itemMeta[item].name}<small>{itemMeta[item].description}</small></span></button> : <div className="empty-item" key={slot} aria-label={'빈 아이템 슬롯 ' + (slot + 1)}><span>{String(slot + 1).padStart(2, '0')}</span><small>EMPTY</small></div> })}</div>{game.loadNumber === 1 && game.inventory.you.length === 0 && <p className="inventory-hint">첫 장전은 도구 없이 시작합니다. 다음 장전에 아이템 상자가 도착합니다.</p>}<div className="intel-row"><span>현재 탄환</span><strong>{game.known === null ? '알 수 없음' : game.known === 'live' ? '실탄' : '공포탄'}</strong></div>{game.forecasts.map((entry, index) => <div className="forecast-row" key={index}>버너폰 · {entry.position + 1}번째 탄환 <strong>{entry.shell === 'live' ? '실탄' : '공포탄'}</strong></div>)}{game.saw && <p className="effect-note">톱 효과 준비: 다음 실탄 피해 +1</p>}{game.skipOpponent && <p className="effect-note">수갑 효과 준비: 상대의 다음 턴 건너뜀</p>}<div className="dealer-items"><div className="dealer-items-title"><span>상대 아이템</span>{game.stealing && <strong>사용할 도구를 선택하세요</strong>}</div><div className="dealer-item-list">{game.inventory.dealer.length === 0 ? <span className="dealer-empty">비어 있음</span> : game.inventory.dealer.map((item, slot) => game.stealing ? <button key={slot} className="dealer-item" disabled={busy || !canTakeVisibleItem(game, item)} onClick={() => run(() => takeItem({ id: roomId, key, slot, revision: room.revision }))} title={itemMeta[item].description}>{itemMeta[item].symbol}<span>{itemMeta[item].name}</span></button> : <span key={slot} className="dealer-item" title={itemMeta[item].description}>{itemMeta[item].symbol}<span>{itemMeta[item].name}</span></span>)}</div></div></section><section className="side-section record"><div className="section-header"><span>02 / 기록</span><strong>테이블 로그</strong></div><ol className="log-list" aria-label="최근 행동">{game.log.map((entry, index) => <li key={String(index) + entry}><span>{String(game.log.length - index).padStart(2, '0')}</span>{entry}</li>)}</ol></section><div className="sidebar-foot"><button className="room-leave" disabled={busy} onClick={() => void handleLeave()}>방 나가기</button><span>ROOM {room.code} / CONVEX</span></div></aside>
    </div>}
    <footer className="page-footer"><span>서버가 턴과 숨겨진 탄환을 관리합니다.</span><span>실시간 2인 비공개 방</span></footer>
  </main>
}
