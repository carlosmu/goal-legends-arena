import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/src/players'
import { readPenaltySnapshot, clientSnapshot, penaltyStateEntityReady } from './gameStore'
import { getLeaderboardRows } from './leaderboardManager'
import { getLeaderboardFaceUrl, prefetchLeaderboardFaces } from './leaderboardProfileCache'
import { room } from '../shared/messages'
import { GameState } from '../shared/gameState'
import {
  COUNTRIES,
  initLocalCountryFromSnapshot,
  isPickerOpen,
  openPicker,
  selectCountry,
  flagBackground,
  engineFlagBackground,
  enginePicBackground
} from './countryStore'

/**
 * React-ECS ya re-renderiza el árbol cada frame (`@dcl/react-ecs` lo registra como un system).
 * Por eso `RootUi` se ejecuta cada tick sin necesidad de `useState`/`useEffect`. Forzar setState
 * cada frame descuadra el reconciler y produce errores tipo `parent ... do not have
 * $UITransformComponent`.
 */
export function setupUi() {
  ReactEcsRenderer.setUiRenderer(RootUi, { virtualWidth: 1920, virtualHeight: 1080 })
}

function mySide(s: typeof clientSnapshot, me: string): 'red' | 'blue' | null {
  if (!me) return null
  if (s.redAddr && me.toLowerCase() === s.redAddr.toLowerCase()) return 'red'
  if (s.blueAddr && me.toLowerCase() === s.blueAddr.toLowerCase()) return 'blue'
  return null
}

function isKickerView(s: typeof clientSnapshot, side: 'red' | 'blue' | null): boolean {
  if (!side) return false
  const kr = s.kickerIsRed === 1
  return (kr && side === 'red') || (!kr && side === 'blue')
}

function fs(size: number): number {
  return isMobile() ? Math.ceil(size * 1.5) : size
}

function vw(size: number): `${number}vw` {
  return (isMobile() ? `${size * 1.5}vw` : `${size}vw`) as `${number}vw`
}

const LEADERBOARD_TOP_N = 10

// UI_choose.png is 1024x1024; each DIVE/SHOOT slice is half height => aspect 2:1 (w:h)
// Pick sizes use isMobile() inside RootUi only — not at module load (Creator Hub loads as desktop).
const PICK_BTN_ALPHA = 0.05
const PICK_BTN_ALPHA_HOVER = 0.3

let lbShowUntilMs = 0
let prevPhase = ''
let pickerPage = 0
let prevPickerOpen = false
let splashDismissed = false
let hoverPickL = false
let hoverPickC = false
let hoverPickR = false
let hoverSplashStart = false
/** Offset entre reloj servidor y cliente, cacheado al primer snapshot válido (solo para debug). */
let serverClockOffset: number | null = null
/** Timestamp local del último click a un spot. Garantiza que el UI de "Waiting" aparezca incluso si
 * el servidor salta WaitingOpponent (e.g. cuando ya había alguien esperando y el match arranca al instante). */
let lastSpotClickAt = 0
const LOCAL_WAIT_MIN_MS = 3000
/** Ancla local del countdown cosmético de waiting. Arranca cuando la UI se vuelve visible y baja 30→0. */
let waitDisplayAnchorMs = 0
const WAIT_DISPLAY_TOTAL_S = 30

export function markSpotClickedLocally(): void {
  lastSpotClickAt = Date.now()
}

const RootUi = () => {
  readPenaltySnapshot()
  const s = clientSnapshot
  const me = getPlayer()?.userId || ''
  const myName = getPlayer()?.name || me
  const side = mySide(s, me)
  const kicker = isKickerView(s, side)

  // Para el debug "Timeout in" (inactivityDeadlineMs) usamos offset cacheado.
  if (serverClockOffset === null && s.serverNowMs > 0) {
    serverClockOffset = s.serverNowMs - Date.now()
  }
  const serverApproxNow = Date.now() + (serverClockOffset ?? 0)

const lbRows = getLeaderboardRows(s.leaderboardJson, LEADERBOARD_TOP_N)

  if (prevPhase === GameState.MatchEnd && s.phase !== GameState.MatchEnd) {
    lbShowUntilMs = Date.now() + 5000
  }
  prevPhase = s.phase
  const showLeaderboard = Date.now() < lbShowUntilMs

  // Determine if engine is red or blue in PvE
  const isPvE = s.mode === 'pve'
  const engineIsRed = isPvE && s.pveHumanIsRed === 0
  const engineIsBlue = isPvE && s.pveHumanIsRed === 1
  const winnerEngineSide =
    isPvE &&
    !!s.winnerSide &&
    ((s.winnerSide === 'red' && engineIsRed) || (s.winnerSide === 'blue' && engineIsBlue))

  /** Partida en curso (oculta welcome para nuevos hasta que termine). No incluye solo “esperando rival”. */
  const showWelcome = splashDismissed && s.hasActiveMatch === 0 && s.phase === GameState.LobbyIdle
  // Limpiar la bandera local cuando la partida ya está corriendo (no estamos esperando más).
  if (lastSpotClickAt > 0 && s.phase !== GameState.WaitingOpponent && s.phase !== GameState.LobbyIdle) {
    lastSpotClickAt = 0
  }
  const localWaitVisible = lastSpotClickAt > 0 && (Date.now() - lastSpotClickAt) < LOCAL_WAIT_MIN_MS
  const showWaiting =
    splashDismissed &&
    (localWaitVisible || (side && s.phase === GameState.WaitingOpponent && !(s.redAddr && s.blueAddr && s.mode !== 'pve')))
  // Ancla el countdown cosmético: arranca en 30 cuando la UI pasa de oculta a visible.
  if (showWaiting) {
    if (waitDisplayAnchorMs === 0) waitDisplayAnchorMs = Date.now()
  } else {
    waitDisplayAnchorMs = 0
  }
  const waitDisplayLeft = waitDisplayAnchorMs > 0
    ? Math.max(0, WAIT_DISPLAY_TOTAL_S - Math.floor((Date.now() - waitDisplayAnchorMs) / 1000))
    : WAIT_DISPLAY_TOTAL_S
  const showPick =
    splashDismissed && s.phase === GameState.SelectingDirections && side && (s.mode === 'pvp' || (s.mode === 'pve' && !!side))

  const pickMobile = isMobile()
  const pickPanelWidth = pickMobile ? '40vw' : '25vw'
  const pickPanelHeight = pickMobile ? '20vw' : '12.5vw'
  const pickBtnWidth = pickMobile ? 300 : 130
  const pickBtnHeight = pickMobile ? 230 : 100
  const pickBtnGap = pickMobile ? 20 : 8
  const pickBtnMarginBottom = pickMobile ? 50 : 20
  const showResult = splashDismissed && s.phase === GameState.ResolvingRound && !!s.resultLine
  const showMatchEnd = splashDismissed && s.phase === GameState.MatchEnd && !!s.winnerName
  const showStreak =
    splashDismissed &&
    s.phase === GameState.WinnerContinuePrompt &&
    !!me &&
    !!s.winnerStreakAddr &&
    me.toLowerCase() === s.winnerStreakAddr.toLowerCase()
  const showSpectatorChallenge =
    splashDismissed &&
    s.spectatorChallengeActive === 1 &&
    !!me &&
    !!s.winnerStreakAddr &&
    me.toLowerCase() !== s.winnerStreakAddr.toLowerCase()

  // Prefetch scoreboard faces whenever active players change
  if (s.hasActiveMatch === 1) prefetchLeaderboardFaces([s.redAddr, s.blueAddr].filter(Boolean))
  if (showMatchEnd && s.winnerSide && !winnerEngineSide) {
    const winAddr = s.winnerSide === 'red' ? s.redAddr : s.blueAddr
    if (winAddr) prefetchLeaderboardFaces([winAddr])
  }
  const winnerWinAddr = s.winnerSide === 'red' ? s.redAddr : s.blueAddr
  const winnerFaceUrl = winnerEngineSide ? undefined : getLeaderboardFaceUrl(winnerWinAddr)

  // Seed local country from server snapshot (first time only)
  const myCountryInSnapshot = side === 'red' ? s.redCountry : side === 'blue' ? s.blueCountry : ''
  initLocalCountryFromSnapshot(myCountryInSnapshot)

  const showCountryPicker = isPickerOpen()
  if (showCountryPicker && !prevPickerOpen) pickerPage = 0
  prevPickerOpen = showCountryPicker
  const FLAGS_PER_ROW = 6
  const FLAG_ROWS = 2
  const PAGE_SIZE = FLAGS_PER_ROW * FLAG_ROWS
  const TOTAL_PAGES = Math.ceil(COUNTRIES.length / PAGE_SIZE)
  const visibleCountries = COUNTRIES.slice(pickerPage * PAGE_SIZE, (pickerPage + 1) * PAGE_SIZE)

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}
    >
      {/* ========== SCOREBOARD ========== */}
      {splashDismissed && s.hasActiveMatch === 1 && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 5,
            zIndex: 55
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.8) }}
        >
          {/* Row 1: flag-pic-score-pic-flag */}
          <UiEntity
            uiTransform={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center'
            }}
          >
            {/* Blue flag + pic */}
            {engineIsBlue ? (
              <Button
                value=""
                uiTransform={{ width: 96, height: 72, margin: { right: 6 } }}
                uiBackground={engineFlagBackground()}
              />
            ) : s.blueCountry ? (
              <Button
                value=""
                uiTransform={{ width: 96, height: 72, margin: { right: 6 } }}
                uiBackground={flagBackground(s.blueCountry)}
                onMouseDown={() => { if (side === 'blue') openPicker() }}
              />
            ) : (
              side === 'blue' && (
                <Button
                  value="🌍"
                  fontSize={fs(30)}
                  uiTransform={{ width: 40, height: 40, margin: { right: 6 } }}
                  onMouseDown={() => openPicker()}
                />
              )
            )}
            <UiEntity
              uiTransform={{ width: 64, height: 64 }}
              uiBackground={{ textureMode: 'stretch', texture: { src: 'assets/images/blue_pic_bg.png' } }}
            >
              <UiEntity
                uiTransform={{ width: 64, height: 64 }}
                uiBackground={
                  engineIsBlue
                    ? enginePicBackground()
                    : getLeaderboardFaceUrl(s.blueAddr)
                    ? { textureMode: 'stretch', texture: { src: getLeaderboardFaceUrl(s.blueAddr)! } }
                    : { color: Color4.create(0, 0, 0, 0) }
                }
              />
            </UiEntity>

            {/* Score */}
            <Label
              value={`${s.blueScore} - ${s.redScore}`}
              fontSize={fs(70)}
              color={Color4.White()}
              textAlign="middle-center"
              uiTransform={{ margin: { left: 16, right: 16 } }}
            />

            {/* Red pic + flag */}
            <UiEntity
              uiTransform={{ width: 64, height: 64 }}
              uiBackground={{ textureMode: 'stretch', texture: { src: 'assets/images/red_pic_bg.png' } }}
            >
              <UiEntity
                uiTransform={{ width: 64, height: 64 }}
                uiBackground={
                  engineIsRed
                    ? enginePicBackground()
                    : getLeaderboardFaceUrl(s.redAddr)
                    ? { textureMode: 'stretch', texture: { src: getLeaderboardFaceUrl(s.redAddr)! } }
                    : { color: Color4.create(0, 0, 0, 0) }
                }
              />
            </UiEntity>
            {engineIsRed ? (
              <Button
                value=""
                uiTransform={{ width: 96, height: 72, margin: { left: 6 } }}
                uiBackground={engineFlagBackground()}
              />
            ) : s.redCountry ? (
              <Button
                value=""
                uiTransform={{ width: 96, height: 72, margin: { left: 6 } }}
                uiBackground={flagBackground(s.redCountry)}
                onMouseDown={() => { if (side === 'red') openPicker() }}
              />
            ) : (
              side === 'red' && (
                <Button
                  value="🌍"
                  fontSize={fs(30)}
                  uiTransform={{ width: 40, height: 40, margin: { left: 6 } }}
                  onMouseDown={() => openPicker()}
                />
              )
            )}
          </UiEntity>

          {/* Row 2: names */}
          <UiEntity
            uiTransform={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <UiEntity uiTransform={{ flexGrow: 1, display: 'flex', flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Label
                value={s.blueName || 'Blue'}
                fontSize={fs(20)}
                color={Color4.White()}
                textAlign="middle-right"
              />
            </UiEntity>
            <UiEntity uiTransform={{ width: '10vw' }} />
            <UiEntity uiTransform={{ flexGrow: 1, display: 'flex', flexDirection: 'row', justifyContent: 'flex-start' }}>
              <Label
                value={s.redName || 'Red'}
                fontSize={fs(20)}
                color={Color4.White()}
                textAlign="middle-left"
              />
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}
      {/* ========== fin SCOREBOARD ========== */}

      {/* ========== MATCH ACTION BAR ========== */}
      {splashDismissed && s.hasActiveMatch === 1 && side && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: '70vw' },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 55,
          }}
        >
          <Button
            value="Choose your Flag"
            fontSize={fs(20)}
            color={Color4.White()}
            uiTransform={{ width: 200, height: 60, margin: { right: 12 } }}
            uiBackground={{ color: Color4.create(0.2, 0.35, 0.6, 1) }}
            onMouseDown={() => openPicker()}
          />
          <Button
            value="Leave Match"
            fontSize={fs(20)}
            color={Color4.White()}
            uiTransform={{ width: 160, height: 60 }}
            uiBackground={{ color: Color4.create(0.55, 0.15, 0.2, 1) }}
            onMouseDown={() => room.send('leaveMatch', {})}
          />
        </UiEntity>
      )}
      {/* ========== fin MATCH ACTION BAR ========== */}

      {/* ========== UI: LEADERBOARD (centrado en pantalla) ========== */}
      {splashDismissed && showLeaderboard && <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0, right: 0, bottom: 0 },
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          pointerFilter: 'none'
        }}
      >
        {/* Panel visible del leaderboard (fondo + texto) */}
        <UiEntity
          uiTransform={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: isMobile() ? 42 : 38,
            minWidth: '25%',
            minHeight: '25%'
          }}
          uiBackground={{ color: Color4.create(0.08, 0.38, 0.14, 0.70) }}
        >
          <Label value="Leaderboard" fontSize={fs(30)} color={Color4.White()} textAlign="middle-center" uiTransform={{ width: '100%', margin: { bottom: 8 } }} />
          {lbRows.length === 0 ? (
            <Label
              value="(no wins yet)"
              fontSize={fs(20)}
              color={Color4.create(0.9, 0.95, 1, 1)}
              uiTransform={{ margin: { top: 6 } }}
            />
          ) : (
            <UiEntity uiTransform={{ display: 'flex', flexDirection: 'column' }}>
              {/* Header row */}
              <UiEntity
                uiTransform={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  height: vw(2),
                  margin: { top: 4, bottom: 2 }
                }}
              >
                <UiEntity uiTransform={{ flexGrow: 1 }} />
                <Label
                  value="wins"
                  fontSize={fs(20)}
                  color={Color4.create(1, 0.9, 0.3, 1)}
                  textAlign="middle-center"
                  uiTransform={{ width: vw(5), margin: { right: 4 } }}
                />
                <Label
                  value="streaks"
                  fontSize={fs(20)}
                  color={Color4.create(0.5, 1, 0.6, 1)}
                  textAlign="middle-center"
                  uiTransform={{ width: vw(5) }}
                />
              </UiEntity>
            {lbRows.map((row) => {
              const face = getLeaderboardFaceUrl(row.addr)
              const rowH = vw(2)
              const faceSz = vw(2)
              return (
                <UiEntity
                  key={row.addr}
                  uiTransform={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    height: rowH,
                    margin: { top: row.rank === 1 ? 6 : 3 }
                  }}
                  uiBackground={row.rank % 2 === 1 ? { color: Color4.create(1, 1, 1, 0.05) } : { color: Color4.create(0, 0, 0, 0) }}
                >
                  {/* Position */}
                  <UiEntity
                    uiTransform={{ width: vw(2), height: rowH, margin: { right: 5 } }}
                  >
                    <Label value={`${row.rank}.`} fontSize={fs(20)} color={Color4.White()} textAlign="middle-right" uiTransform={{ width: '100%', height: rowH }} />
                  </UiEntity>
                  {/* Profile pic */}
                  <UiEntity
                    uiTransform={{ width: faceSz, height: faceSz, margin: { right: 5 } }}
                    uiBackground={
                      face
                        ? { textureMode: 'stretch', texture: { src: face } }
                        : { color: Color4.create(0.22, 0.24, 0.3, 1) }
                    }
                  />
                  {/* Flag */}
                  <UiEntity
                    uiTransform={{ width: vw(3), height: vw(2), margin: { right: 5 } }}
                    uiBackground={
                      row.country
                        ? flagBackground(row.country)
                        : { color: Color4.create(0, 0, 0, 0) }
                    }
                  />
                  {/* Username */}
                  <UiEntity
                    uiTransform={{ width: vw(10), height: rowH, margin: { right: 5 } }}
                  >
                    <Label value={truncateName(row.name)} fontSize={fs(20)} color={Color4.create(0.9, 0.95, 1, 1)} textAlign="middle-left" uiTransform={{ width: '100%', height: rowH }} />
                  </UiEntity>
                  {/* Wins */}
                  <UiEntity
                    uiTransform={{ width: vw(5), height: rowH, margin: { right: 4 } }}
                  >
                    <Label value={`${row.wins}`} fontSize={fs(20)} color={Color4.create(1, 0.9, 0.3, 1)} textAlign="middle-center" uiTransform={{ width: '100%', height: rowH }} />
                  </UiEntity>
                  {/* Streak */}
                  <UiEntity
                    uiTransform={{ width: vw(5), height: rowH }}
                  >
                    <Label value={`${row.streak}`} fontSize={fs(20)} color={Color4.create(0.5, 1, 0.6, 1)} textAlign="middle-center" uiTransform={{ width: '100%', height: rowH }} />
                  </UiEntity>
                </UiEntity>
              )
            })}
            </UiEntity>
          )}
        </UiEntity>
      </UiEntity>
      }
      {/* ========== fin UI LEADERBOARD ========== */}

      {/* ========== COUNTRY PICKER ========== */}
      {splashDismissed && showCountryPicker && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.99) }}
        >
          <Label
            value="Welcome to Goal Legends Arena"
            fontSize={fs(50)}
            color={Color4.White()}
            textAlign="middle-center"
            uiTransform={{ margin: { bottom: 4 } }}
          />
          <Label
            value="World Cup Edition"
            fontSize={fs(35)}
            color={Color4.create(1, 0.85, 0.1, 1)}
            textAlign="middle-center"
            uiTransform={{ margin: { bottom: 20 } }}
          />
          <Label
            value="— Select your country —"
            fontSize={fs(30)}
            color={Color4.create(0.75, 0.85, 1, 1)}
            textAlign="middle-center"
            uiTransform={{ margin: { bottom: 16 } }}
          />
          {/* Flag grid: 6 per row, 4 rows */}
          {Array.from({ length: FLAG_ROWS }, (_, row) => (
            <UiEntity
              key={`row-${row}`}
              uiTransform={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'flex-start'
              }}
            >
              {visibleCountries.slice(row * FLAGS_PER_ROW, (row + 1) * FLAGS_PER_ROW).map((c) => (
                <UiEntity
                  key={c.iso}
                  uiTransform={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    margin: { left: 4, right: 4, bottom: '3vw' }
                  }}
                >
                  <Button
                    value=""
                    uiTransform={{ width: 168, height: 126 }}
                    uiBackground={flagBackground(c.iso)}
                    onMouseDown={() => selectCountry(c.iso)}
                  />
                  <Label
                    value={c.name.length > 10 ? c.name.slice(0, 10) + '...' : c.name}
                    fontSize={fs(20)}
                    color={Color4.White()}
                    textAlign="middle-center"
                    uiTransform={{ width: 168 }}
                  />
                </UiEntity>
              ))}
            </UiEntity>
          ))}
          {/* Pagination */}
          <UiEntity
            uiTransform={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              margin: { top: 16 }
            }}
          >
            {pickerPage > 0 && (
              <Button
                value="← Prev"
                fontSize={fs(20)}
                color={Color4.White()}
                uiTransform={{ width: 140, height: 44, margin: { right: 16 } }}
                uiBackground={{ color: Color4.create(0.2, 0.3, 0.5, 1) }}
                onMouseDown={() => { pickerPage-- }}
              />
            )}
            <Label
              value={`${pickerPage + 1} / ${TOTAL_PAGES}`}
              fontSize={fs(20)}
              color={Color4.create(0.8, 0.85, 1, 1)}
              textAlign="middle-center"
              uiTransform={{ width: 60 }}
            />
            {pickerPage < TOTAL_PAGES - 1 && (
              <Button
                value="Next →"
                fontSize={fs(20)}
                color={Color4.White()}
                uiTransform={{ width: 140, height: 44, margin: { left: 16 } }}
                uiBackground={{ color: Color4.create(0.2, 0.3, 0.5, 1) }}
                onMouseDown={() => { pickerPage++ }}
              />
            )}
          </UiEntity>
        </UiEntity>
      )}
      {/* ========== fin COUNTRY PICKER ========== */}

      {showWelcome && (
        <UiEntity
          uiTransform={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            margin: { top: '10vh' },
            padding: { top: 26, bottom: 26, left: 34, right: 34 },
            // maxWidth: 7201
          }}
          uiBackground={{ color: Color4.create(0.08, 0.38, 0.14, 0.70) }}
        >
          <UiEntity
            uiTransform={{ width: isMobile() ? 800 : 480, height: isMobile() ? 200 : 120 }}
            uiBackground={{
              textureMode: 'stretch',
              texture: { src: 'assets/images/UI_buttons.png' },
              // 4x4 sheet; using A1-B1-C1-D1 (row 1 full width)
              // u: 0.00 -> 1.00, v: 0.75 -> 1.00
              uvs: [0, 0.75, 0, 1, 1, 1, 1, 0.75],
              color: Color4.White()
            }}
          />
        </UiEntity>
      )}

      {showWaiting && (
        <UiEntity
          uiTransform={{
            margin: { top: '12vh' },
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.90) }}
        >
          <Label value="Waiting for opponent" fontSize={fs(35)} color={Color4.White()} textAlign="middle-center" />
          <Label
            value={`${waitDisplayLeft}s`}
            fontSize={fs(30)}
            color={Color4.create(1, 0.85, 0.2, 1)}
            uiTransform={{ margin: { top: 10 } }}
          />
          <UiEntity
            uiTransform={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              margin: { top: 18 }
            }}
          >
            <Button
              value="Player vs Engine"
              fontSize={fs(20)}
              color={Color4.White()}
              uiTransform={{ width: 220, height: 44, margin: { right: 12 } }}
              uiBackground={{ color: Color4.create(0.2, 0.45, 0.25, 1) }}
              onMouseDown={() => room.send('startPvE', {})}
            />
            <Button
              value="Cancel"
              fontSize={fs(20)}
              color={Color4.White()}
              uiTransform={{ width: 160, height: 44 }}
              uiBackground={{ color: Color4.create(0.55, 0.15, 0.2, 1) }}
              onMouseDown={() => room.send('cancelWaiting', {})}
            />
          </UiEntity>
        </UiEntity>
      )}

      {/* DIVE / SHOOT panels: centrado en pantalla */}
      {showPick && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0, right: 0, bottom: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: { bottom: isMobile() ? '8vh' : '4vh' },
            pointerFilter: 'none',
            zIndex: 1000
          }}
        >
          {/* DIVE: mitad superior de UI_choose.png */}
          {!kicker && (
            <UiEntity
              uiTransform={{
                width: pickPanelWidth,
                height: pickPanelHeight,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: 'assets/images/UI_choose.png' },
                uvs: [0, 0.5, 0, 1, 1, 1, 1, 0.5]
              }}
            >
              <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { bottom: pickBtnMarginBottom } }}>
                <Button
                  value=""
                  uiTransform={{ width: pickBtnWidth, height: pickBtnHeight, margin: { right: pickBtnGap } }}
                  uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, hoverPickL ? PICK_BTN_ALPHA_HOVER : PICK_BTN_ALPHA) }}
                  onMouseDown={() => room.send('submitDirection', { dir: 'L' })}
                  onMouseEnter={() => { hoverPickL = true }}
                  onMouseLeave={() => { hoverPickL = false }}
                />
                <Button
                  value=""
                  uiTransform={{ width: pickBtnWidth, height: pickBtnHeight, margin: { right: pickBtnGap } }}
                  uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, hoverPickC ? PICK_BTN_ALPHA_HOVER : PICK_BTN_ALPHA) }}
                  onMouseDown={() => room.send('submitDirection', { dir: 'C' })}
                  onMouseEnter={() => { hoverPickC = true }}
                  onMouseLeave={() => { hoverPickC = false }}
                />
                <Button
                  value=""
                  uiTransform={{ width: pickBtnWidth, height: pickBtnHeight }}
                  uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, hoverPickR ? PICK_BTN_ALPHA_HOVER : PICK_BTN_ALPHA) }}
                  onMouseDown={() => room.send('submitDirection', { dir: 'R' })}
                  onMouseEnter={() => { hoverPickR = true }}
                  onMouseLeave={() => { hoverPickR = false }}
                />
              </UiEntity>
            </UiEntity>
          )}
          {/* SHOOT: mitad inferior de UI_choose.png */}
          {kicker && (
            <UiEntity
              uiTransform={{
                width: pickPanelWidth,
                height: pickPanelHeight,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
              uiBackground={{
                textureMode: 'stretch',
                texture: { src: 'assets/images/UI_choose.png' },
                uvs: [0, 0, 0, 0.5, 1, 0.5, 1, 0]
              }}
            >
              <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { bottom: pickBtnMarginBottom } }}>
                <Button
                  value=""
                  uiTransform={{ width: pickBtnWidth, height: pickBtnHeight, margin: { right: pickBtnGap } }}
                  uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, hoverPickL ? PICK_BTN_ALPHA_HOVER : PICK_BTN_ALPHA) }}
                  onMouseDown={() => room.send('submitDirection', { dir: 'L' })}
                  onMouseEnter={() => { hoverPickL = true }}
                  onMouseLeave={() => { hoverPickL = false }}
                />
                <Button
                  value=""
                  uiTransform={{ width: pickBtnWidth, height: pickBtnHeight, margin: { right: pickBtnGap } }}
                  uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, hoverPickC ? PICK_BTN_ALPHA_HOVER : PICK_BTN_ALPHA) }}
                  onMouseDown={() => room.send('submitDirection', { dir: 'C' })}
                  onMouseEnter={() => { hoverPickC = true }}
                  onMouseLeave={() => { hoverPickC = false }}
                />
                <Button
                  value=""
                  uiTransform={{ width: pickBtnWidth, height: pickBtnHeight }}
                  uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, hoverPickR ? PICK_BTN_ALPHA_HOVER : PICK_BTN_ALPHA) }}
                  onMouseDown={() => room.send('submitDirection', { dir: 'R' })}
                  onMouseEnter={() => { hoverPickR = true }}
                  onMouseLeave={() => { hoverPickR = false }}
                />
              </UiEntity>
            </UiEntity>
          )}
        </UiEntity>
      )}

      {showResult && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'none',
            zIndex: 62
          }}
        >
          <UiEntity
            uiTransform={{
              padding: 22,
              maxWidth: 900,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
            uiBackground={{ color: Color4.create(0, 0, 0, 0.90) }}
          >
            <Label
              value={s.resultLine.split('\n')[0] || ''}
              fontSize={fs(60)}
              color={s.resultLine.startsWith('GOAL') ? Color4.create(1, 0.9, 0.1, 1) : Color4.create(0.4, 0.8, 1, 1)}
              textAlign="middle-center"
            />
          </UiEntity>
        </UiEntity>
      )}

      {showMatchEnd && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0, right: 0, bottom: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'none',
            zIndex: 70
          }}
        >
          {s.winnerSide ? (
            <UiEntity
              uiTransform={{
                padding: 32,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}
              uiBackground={{ color: Color4.create(0.05, 0.12, 0.08, 0.92) }}
            >
              <UiEntity
                uiTransform={{ width: 256, height: 256, margin: { bottom: 16 } }}
                uiBackground={
                  winnerEngineSide
                    ? enginePicBackground()
                    : winnerFaceUrl
                    ? { textureMode: 'stretch', texture: { src: winnerFaceUrl } }
                    : { color: Color4.create(0.2, 0.2, 0.2, 1) }
                }
              />
              <Label
                value={`Winner: @${s.winnerName}`}
                fontSize={fs(50)}
                color={Color4.create(1, 0.92, 0.35, 1)}
                textAlign="middle-center"
              />
              {winnerEngineSide ? (
                <UiEntity
                  uiTransform={{ width: 96, height: 72, margin: { top: 16 } }}
                  uiBackground={engineFlagBackground()}
                />
              ) : (s.winnerSide === 'red' ? s.redCountry : s.blueCountry) ? (
                <UiEntity
                  uiTransform={{ width: 96, height: 72, margin: { top: 16 } }}
                  uiBackground={flagBackground(s.winnerSide === 'red' ? s.redCountry : s.blueCountry)}
                />
              ) : (
                <UiEntity uiTransform={{ width: 1, height: 1 }} />
              )}
            </UiEntity>
          ) : (
            <UiEntity
              uiTransform={{
                padding: 32,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}
              uiBackground={{ color: Color4.create(0.1, 0.08, 0.08, 0.92) }}
            >
              <Label
                value={s.winnerName}
                fontSize={fs(40)}
                color={Color4.create(0.9, 0.6, 0.6, 1)}
                textAlign="middle-center"
              />
            </UiEntity>
          )}
        </UiEntity>
      )}

      {showStreak && (
        <UiEntity
          uiTransform={{
            margin: { top: '22vh' },
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
          uiBackground={{ color: Color4.create(0.1, 0.1, 0.2, 0.9) }}
        >
          <Label value="Keep playing on this spot?" fontSize={fs(30)} color={Color4.White()} />
          <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { top: 14 } }}>
            <Button
              value="YES"
              fontSize={fs(30)}
              color={Color4.White()}
              uiTransform={{ width: 140, height: 44, margin: { right: 12 } }}
              uiBackground={{ color: Color4.create(0.1, 0.65, 0.35, 1) }}
              onMouseDown={() => room.send('streakDecision', { continue: 1 })}
            />
            <Button
              value="NO"
              fontSize={fs(30)}
              color={Color4.White()}
              uiTransform={{ width: 140, height: 44 }}
              uiBackground={{ color: Color4.create(0.55, 0.15, 0.2, 1) }}
              onMouseDown={() => room.send('streakDecision', { continue: 0 })}
            />
          </UiEntity>
        </UiEntity>
      )}

      {showSpectatorChallenge && (
        <UiEntity
          uiTransform={{
            margin: { top: '30vh' },
            padding: 20,
            maxWidth: 640,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
          uiBackground={{ color: Color4.create(0.2, 0.05, 0.15, 0.9) }}
        >
          <Label
            value={`${s.spectatorWinnerName} is the WINNER! Face the winner?`}
            fontSize={fs(30)}
            color={Color4.White()}
            textAlign="middle-center"
          />
          <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { top: 14 } }}>
            <Button
              value="YES"
              fontSize={fs(30)}
              color={Color4.White()}
              uiTransform={{ width: 120, height: 40, margin: { right: 10 } }}
              uiBackground={{ color: Color4.create(0.2, 0.55, 0.9, 1) }}
              onMouseDown={() => room.send('spectatorChallenge', { accept: 1 })}
            />
            <Button
              value="NO"
              fontSize={fs(30)}
              color={Color4.White()}
              uiTransform={{ width: 120, height: 40 }}
              uiBackground={{ color: Color4.create(0.35, 0.35, 0.4, 1) }}
              onMouseDown={() => room.send('spectatorChallenge', { accept: 0 })}
            />
          </UiEntity>
        </UiEntity>
      )}

      {/* ========== SPLASH / WELCOME SCREEN ========== */}
      {!splashDismissed && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            zIndex: 998,
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.95) }}
        />
      )}
      {!splashDismissed && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
        >
          <UiEntity
            uiTransform={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Label
              value="Welcome to:"
              fontSize={fs(36)}
              color={Color4.White()}
              textAlign="middle-center"
              uiTransform={{ margin: { bottom: -50 } }}
            />
            <UiEntity
              uiTransform={{ width: 540, height: 540, margin: { bottom: -60 } }}
              uiBackground={{ textureMode: 'stretch', texture: { src: 'assets/images/logo.png' }, color: Color4.White() }}
            />
            <UiEntity
              uiTransform={{
                width: isMobile() ? 320 : 240,
                height: isMobile() ? 160 : 120,
                positionType: 'relative'
              }}
            >
              <Button
                value=""
                uiTransform={{ width: '100%', height: '100%' }}
                uiBackground={{
                  textureMode: 'stretch',
                  texture: { src: 'assets/images/UI_buttons.png' },
                  // 4x4 sheet; using A2-B2 (cols A+B, row 2)
                  // u: 0.00 -> 0.50, v: 0.50 -> 0.75
                  uvs: [0, 0.5, 0, 0.75, 0.5, 0.75, 0.5, 0.5],
                  color: Color4.White()
                }}
                onMouseDown={() => { splashDismissed = true }}
                onMouseEnter={() => { if (!isMobile()) hoverSplashStart = true }}
                onMouseLeave={() => { if (!isMobile()) hoverSplashStart = false }}
              />
              {hoverSplashStart && !isMobile() && (
                <UiEntity
                  uiTransform={{
                    positionType: 'absolute',
                    position: { bottom: 0, left: '10%' },
                    width: '80%',
                    height: 5,
                    pointerFilter: 'none'
                  }}
                  uiBackground={{ color: Color4.White() }}
                />
              )}
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}
      {/* ========== fin SPLASH ========== */}

      {splashDismissed && !isMobile() && <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { bottom: 0, left: 0, right: 0 },
          width: '100%',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'flex-end'
        }}
      >
        <UiEntity
          uiTransform={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: { top: 8, bottom: 8, left: 12, right: 12 },
            maxWidth: 720,
            minHeight: 180
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 1) }}
        >
          <Label
            value={`state: ${s.phase} | sync: ${isStateSyncronized() ? 'ok' : 'no'} | match: ${penaltyStateEntityReady() ? 'ok' : '—'} | mode: ${s.mode} | active: ${s.hasActiveMatch}`}
            fontSize={fs(14)}
            color={Color4.create(0.75, 1, 0.8, 1)}
          />
          <Label
            value={`side: ${side ?? '(none)'} | red: ${s.redName || '—'} | blue: ${s.blueName || '—'}`}
            fontSize={fs(14)}
            color={Color4.create(0.85, 0.9, 1, 1)}
            uiTransform={{ margin: { top: 4 } }}
          />
          <Label
            value={'Timeout in: ' + (typeof s.inactivityDeadlineMs === 'number' && s.inactivityDeadlineMs > 0 ? Math.max(0, Math.ceil((s.inactivityDeadlineMs - serverApproxNow) / 1000)) + 's' : 'off') + ` | server tick: ${s.serverTickCounter}`}
            fontSize={fs(14)}
            color={Color4.create(1, 0.7, 0.7, 1)}
            uiTransform={{ margin: { top: 4 } }}
          />
          <Label
            value={`last server event: ${resolveEventAddrs(s.lastServerEvent, s.redAddr, s.redName, s.blueAddr, s.blueName) || '(none)'}`}
            fontSize={fs(14)}
            color={Color4.create(1, 0.9, 0.6, 1)}
            uiTransform={{ margin: { top: 4 } }}
          />
        </UiEntity>
      </UiEntity>}
    </UiEntity>
  )
}

function shortAddr(addr: string): string {
  if (!addr) return '—'
  if (addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function truncateName(name: string, maxChars: number = 13): string {
  if (name.length <= maxChars) return name
  return name.slice(0, maxChars) + '...'
}

function resolveEventAddrs(event: string, redAddr: string, redName: string, blueAddr: string, blueName: string): string {
  let s = event
  if (redAddr) s = s.replace(new RegExp(redAddr, 'gi'), redName || redAddr)
  if (blueAddr) s = s.replace(new RegExp(blueAddr, 'gi'), blueName || blueAddr)
  return s
}
