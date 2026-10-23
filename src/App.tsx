import { useEffect, useRef, useState } from 'react'
import { MAX_ITEMS, applyItem, canUseEffect, canUseItem, createGame, dealerMove, getCounts, grantItems, shoot, takeStolenItem, type Player, type Shell } from './game'
import { Gun, Health } from './GamePieces'
import { itemMeta } from './itemMeta'
import MultiplayerApp from './MultiplayerApp'
import './App.css'

function App() {
  const [mode, setMode] = useState<'solo' | 'multi'>(() => new URLSearchParams(location.search).has('room') ? 'multi' : 'solo')
  const backToSolo = () => {
    history.replaceState(null, '', location.pathname)
    setMode('solo')
  }
  return mode === 'multi'
    ? import.meta.env.VITE_CONVEX_URL
      ? <MultiplayerApp onBack={backToSolo} />
      : <main className="app-shell"><header className="topbar"><div className="brand">THE CHAMBER</div><button className="text-button" onClick={backToSolo}>혼자 하기</button></header><div className="room-loading">Convex 연결이 필요합니다. `npx convex dev`를 실행하세요.</div></main>
    : <SoloApp onMultiplayer={() => setMode('multi')} />
}

function SoloApp({ onMultiplayer }: { onMultiplayer: () => void }) {
  const [game, setGame] = useState(createGame)
  const [showRules, setShowRules] = useState(false)
  const [aimTarget, setAimTarget] = useState<Player | null>(null)
  const [shotKind, setShotKind] = useState<Shell | null>(null)
  const aimTimer = useRef<number | null>(null)
  const resetTimer = useRef<number | null>(null)
  const counts = getCounts(game.chamber)
  const playerTurn = game.status === 'playing' && game.turn === 'you'
  const canAct = playerTurn && aimTarget === null && game.stealing === null
  const known = game.known.you

  useEffect(() => {
    if (game.status !== 'playing' || game.turn !== 'dealer') return
    const timer = window.setTimeout(() => setGame((current) => dealerMove(current)), 850)
    return () => window.clearTimeout(timer)
  }, [game])

  useEffect(() => {
    return () => {
      if (aimTimer.current !== null) window.clearTimeout(aimTimer.current)
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
    }
  }, [])

  function handleShoot(target: Player) {
    if (!canAct) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setGame((current) => shoot(current, 'you', target))
      return
    }
    setAimTarget(target)
    aimTimer.current = window.setTimeout(() => {
      setShotKind(game.chamber[0])
      setGame((current) => shoot(current, 'you', target))
      resetTimer.current = window.setTimeout(() => {
        setShotKind(null)
        setAimTarget(null)
      }, 700)
    }, 500)
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✳</span><span>THE CHAMBER <small>게임플레이 실험실</small></span></div>
      <div className="top-actions"><span className="prototype-badge">LOCAL PROTOTYPE / 01</span><button className="text-button" onClick={onMultiplayer}>2인 멀티 ↗</button><button className="text-button" onClick={() => setShowRules(!showRules)} aria-expanded={showRules}>규칙 {showRules ? '닫기' : '보기'}</button></div>
    </header>
    {showRules && <section className="rules-panel" aria-label="게임 규칙">
      <div><strong>목표</strong><p>딜러의 체력을 먼저 0으로 만드세요.</p></div>
      <div><strong>턴</strong><p>상대에게 쏘면 턴이 넘어갑니다. 자신에게 공포탄을 쏘면 한 번 더 행동합니다.</p></div>
      <div><strong>탄환</strong><p>실탄과 공포탄의 개수만 공개됩니다. 순서는 매 장전마다 섞입니다.</p></div>
      <div><strong>아이템</strong><p>첫 장전은 빈 슬롯으로 시작합니다. 이후 장전마다 상자를 열어 양쪽에 두 개씩 지급합니다.</p></div>
    </section>}
    <div className="layout">
      <section className="table-frame" aria-label="벅샷 룰렛 플레이 테이블">
        <div className="table-heading"><div><span className="eyebrow">TABLE NO. 01</span><h1>끝까지 남는 쪽이 이긴다.</h1></div><div className="load-number">장전 <strong>{String(game.loadNumber).padStart(2, '0')}</strong></div></div>
        <div className={'table-surface' + (aimTarget ? ' aiming-' + aimTarget : '')}>
          <div className="opponent player-plate">
            <div className="avatar dealer-avatar" aria-hidden="true"><span>✳</span></div>
            <div className="plate-copy"><span className="plate-kicker">OPPONENT / CPU</span><strong>딜러</strong><Health value={game.health.dealer} label="딜러" /></div>
            <span className={game.turn === 'dealer' && game.status === 'playing' ? 'turn-flag current' : 'turn-flag'}>{game.turn === 'dealer' && game.status === 'playing' ? '행동 중' : '대기'}</span>
          </div>
          <div className="table-center">
            <div className="ammo-board" aria-label={'남은 실탄 ' + counts.live + '발, 공포탄 ' + counts.blank + '발'}>
              <span className="ammo-title">남은 탄환 <b>{String(game.chamber.length).padStart(2, '0')}</b></span>
              <span className="ammo-count"><i className="ammo-dot live" /> 실탄 <b>{counts.live}</b></span>
              <span className="ammo-count"><i className="ammo-dot blank" /> 공포탄 <b>{counts.blank}</b></span>
            </div>
            <div className="gun-wrap"><Gun aimTarget={aimTarget} shotKind={shotKind} /></div>
            <div className="center-stamp" aria-hidden="true">CHOOSE YOUR NEXT MOVE · CHOOSE YOUR NEXT MOVE ·</div>
          </div>
          <div className="self player-plate">
            <div className="avatar self-avatar" aria-hidden="true">YOU</div>
            <div className="plate-copy"><span className="plate-kicker">PLAYER / LOCAL</span><strong>당신</strong><Health value={game.health.you} label="당신" /></div>
            <span className={playerTurn ? 'turn-flag current' : 'turn-flag'}>{game.status === 'dealing' ? '상자 대기' : playerTurn ? '당신의 턴' : '대기'}</span>
          </div>
        </div>
        <div className="controls">
          <div className="status-line" aria-live="polite"><span className="status-pulse" />{aimTarget && !shotKind ? (aimTarget === 'dealer' ? '딜러에게 총구를 겨누는 중…' : '자신에게 총구를 겨누는 중…') : game.message}</div>
          {game.status === 'over'
            ? <button className="primary-button restart" disabled={aimTarget !== null} onClick={() => setGame(createGame())}>새 게임 시작 <span>↗</span></button>
            : game.status === 'dealing'
              ? <button className="primary-button deal-button" onClick={() => setGame((current) => grantItems(current))}><span><small>SUPPLY BOX / 02 ITEMS EACH</small>아이템 상자 열기</span><span className="deal-icon">✳</span></button>
              : game.stealing === 'you'
                ? <div className="steal-prompt">딜러 아이템에서 즉시 사용할 도구를 선택하세요 <span>↗</span></div>
            : <div className="shoot-actions">
              <button className="shoot-button opponent-button" disabled={!canAct} onClick={() => handleShoot('dealer')}><span className="button-index">01 / 공격</span><strong>딜러에게 발사</strong><span className="button-arrow">↗</span></button>
              <button className="shoot-button self-button" disabled={!canAct} onClick={() => handleShoot('you')}><span className="button-index">02 / 승부</span><strong>나에게 발사</strong><span className="button-arrow">↗</span></button>
            </div>}
        </div>
      </section>
      <aside className="sidebar">
        <section className="side-section arsenal"><div className="section-header"><span>01 / 도구</span><strong>내 아이템</strong></div>
          <div className="item-grid">{Array.from({ length: MAX_ITEMS }, (_, slot) => {
            const item = game.inventory.you[slot]
            return item
              ? <button key={slot} className="item-button" disabled={!canAct || !canUseItem(game, 'you', slot)} onClick={() => setGame((current) => applyItem(current, 'you', slot))} title={itemMeta[item].description}>
                <span className="item-symbol">{itemMeta[item].symbol}</span><span className="item-name">{itemMeta[item].name}<small>{itemMeta[item].description}</small></span>
              </button>
              : <div className="empty-item" key={slot} aria-label={'빈 아이템 슬롯 ' + (slot + 1)}><span>{String(slot + 1).padStart(2, '0')}</span><small>EMPTY</small></div>
          })}</div>
          {game.loadNumber === 1 && game.inventory.you.length === 0 && <p className="inventory-hint">첫 장전은 도구 없이 시작합니다. 다음 장전에 아이템 상자가 도착합니다.</p>}
          <div className="intel-row"><span>현재 탄환</span><strong>{known === null ? '알 수 없음' : known === 'live' ? '실탄' : '공포탄'}</strong></div>
          {game.forecasts.you.map((entry, index) => <div className="forecast-row" key={index}>버너폰 · {entry.position + 1}번째 탄환 <strong>{entry.shell === 'live' ? '실탄' : '공포탄'}</strong></div>)}
          {game.saw.you && <p className="effect-note">톱 효과 준비: 다음 실탄 피해 +1</p>}
          {game.skip.dealer && <p className="effect-note">수갑 효과 준비: 딜러의 다음 턴 건너뜀</p>}
          <div className="dealer-items"><div className="dealer-items-title"><span>딜러 아이템</span>{game.stealing === 'you' && <strong>사용할 도구를 선택하세요</strong>}</div>
            <div className="dealer-item-list">{game.inventory.dealer.length === 0
              ? <span className="dealer-empty">비어 있음</span>
              : game.inventory.dealer.map((item, slot) => game.stealing === 'you'
                ? <button key={slot} className="dealer-item" disabled={!canUseEffect(game, 'you', item)} onClick={() => setGame((current) => takeStolenItem(current, 'you', slot))} title={itemMeta[item].description}>{itemMeta[item].symbol}<span>{itemMeta[item].name}</span></button>
                : <span key={slot} className="dealer-item" title={itemMeta[item].description}>{itemMeta[item].symbol}<span>{itemMeta[item].name}</span></span>)}</div>
          </div>
        </section>
        <section className="side-section record"><div className="section-header"><span>02 / 기록</span><strong>테이블 로그</strong></div>
          <ol className="log-list" aria-label="최근 행동">{game.log.map((entry, index) => <li key={String(index) + entry}><span>{String(game.log.length - index).padStart(2, '0')}</span>{entry}</li>)}</ol>
        </section>
        <div className="sidebar-foot">확률을 읽고, 탄환을 기억하세요.<span>PROTOTYPE BUILD 01</span></div>
      </aside>
    </div>
    <footer className="page-footer"><span>벅샷 룰렛 메커닉 연구용 프로토타입</span><span>키보드 · 마우스 · 터치 지원</span></footer>
  </main>
}
export default App
