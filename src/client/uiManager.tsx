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
  flagSrc
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

let lbShowUntilMs = 0
let prevPhase = ''
let pickerPage = 0
let prevPickerOpen = false
let splashDismissed = false

const RootUi = () => {
  readPenaltySnapshot()
  const s = clientSnapshot
  const me = getPlayer()?.userId || ''
  const myName = getPlayer()?.name || me
  const side = mySide(s, me)
  const kicker = isKickerView(s, side)

  // Calculate remaining time directly from server timestamp, rounding UP to prevent flicker
  let waitLeft = 0
  if (s.waitEndMs > 0) {
    waitLeft = Math.max(0, Math.ceil((s.waitEndMs - Date.now()) / 1000))
  }

  const roundLabel = s.suddenDeath ? `Sudden death — shot ${s.shotIndex + 1}` : `Shoot ${Math.min(s.shotIndex + 1, 10)} / 10`
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

  /** Partida en curso (oculta welcome para nuevos hasta que termine). No incluye solo “esperando rival”. */
  const showWelcome = splashDismissed && s.hasActiveMatch === 0 && s.phase === GameState.LobbyIdle
  const showWaiting =
    splashDismissed && s.phase === GameState.WaitingOpponent && side && waitLeft > 0 && !(s.redAddr && s.blueAddr && s.mode !== 'pve')
  const showPick =
    splashDismissed && s.phase === GameState.SelectingDirections && side && (s.mode === 'pvp' || (s.mode === 'pve' && !!side))
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
            padding: 18,
            zIndex: 55
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.6) }}
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
                uiBackground={{ textureMode: 'stretch', texture: { src: 'assets/images/engine_flag.png' }, color: Color4.White() }}
              />
            ) : s.blueCountry ? (
              <Button
                value=""
                uiTransform={{ width: 96, height: 72, margin: { right: 6 } }}
                uiBackground={{ textureMode: 'stretch', texture: { src: flagSrc(s.blueCountry) }, color: Color4.White() }}
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
                    ? { textureMode: 'stretch', texture: { src: 'assets/images/engine_pic.png' } }
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
                    ? { textureMode: 'stretch', texture: { src: 'assets/images/engine_pic.png' } }
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
                uiBackground={{ textureMode: 'stretch', texture: { src: 'assets/images/engine_flag.png' }, color: Color4.White() }}
              />
            ) : s.redCountry ? (
              <Button
                value=""
                uiTransform={{ width: 96, height: 72, margin: { left: 6 } }}
                uiBackground={{ textureMode: 'stretch', texture: { src: flagSrc(s.redCountry) }, color: Color4.White() }}
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
              justifyContent: 'center',
              alignItems: 'center',
              margin: { top: 4 }
            }}
          >
            <Label
              value={s.blueName || 'Blue'}
              fontSize={fs(30)}
              color={Color4.White()}
              textAlign="middle-right"
              uiTransform={{ width: 170, margin: { right: 8 } }}
            />
            <Label
              value={s.redName || 'Red'}
              fontSize={fs(30)}
              color={Color4.White()}
              textAlign="middle-left"
              uiTransform={{ width: 170, margin: { left: 8 } }}
            />
          </UiEntity>
          {side && (
            <Button
              value="Leave Match"
              fontSize={fs(20)}
              color={Color4.White()}
              uiTransform={{ width: 160, height: 36, margin: { top: 30 } }}
              uiBackground={{ color: Color4.create(0.55, 0.15, 0.2, 1) }}
              onMouseDown={() => room.send('leaveMatch', {})}
            />
          )}
        </UiEntity>
      )}
      {/* ========== fin SCOREBOARD ========== */}

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
            padding: isMobile() ? 58 : 38,
            minWidth: '25%',
            minHeight: '25%'
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.90) }}
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
                        ? { textureMode: 'stretch', texture: { src: flagSrc(row.country) }, color: Color4.White() }
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
            zIndex: 200
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
                    uiBackground={{ textureMode: 'stretch', texture: { src: flagSrc(c.iso) }, color: Color4.White() }}
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
            padding: { top: 22, bottom: 22, left: 32, right: 32 },
            maxWidth: 720
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.90) }}
        >
          <Label
            value="Choose a Spot to start playing!"
            fontSize={fs(35)}
            color={Color4.White()}
            textAlign="middle-center"
          />
          <Label
            value="Or simply enjoy the show"
            fontSize={fs(30)}
            color={Color4.create(0.88, 0.9, 0.95, 1)}
            textAlign="middle-center"
            uiTransform={{ margin: { top: 14 } }}
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
          <Label value="Waiting for the rival" fontSize={fs(35)} color={Color4.White()} textAlign="middle-center" />
          <Label
            value={`${waitLeft}s`}
            fontSize={fs(30)}
            color={Color4.create(1, 0.85, 0.2, 1)}
            uiTransform={{ margin: { top: 10 } }}
          />
          <Button
            value="Training Mode (PvE)"
            fontSize={fs(30)}
            color={Color4.White()}
            uiTransform={{ width: 220, height: 44, margin: { top: 18 } }}
            uiBackground={{ color: Color4.create(0.2, 0.45, 0.25, 1) }}
            onMouseDown={() => room.send('startPvE', {})}
          />
        </UiEntity>
      )}

      {showPick && (
        <UiEntity
          uiTransform={{
            margin: { top: '15vh' },
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: 760
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.90) }}
        >
          <Label value={roundLabel} fontSize={fs(30)} color={Color4.create(0.9, 0.95, 1, 1)} uiTransform={{ margin: { bottom: 10 } }} />
          {kicker && (
            <Label
              value="You are the Kicker — choose where to shoot (Left / Center / Right)"
              fontSize={fs(30)}
              color={Color4.White()}
              textAlign="middle-center"
            />
          )}
          {!kicker && (
            <Label
              value="You are the Goalkeeper — choose where to dive (Left / Center / Right)"
              fontSize={fs(30)}
              color={Color4.White()}
              textAlign="middle-center"
            />
          )}
          <Label
            value="Use the green boxes near the goal or the buttons below."
            fontSize={fs(20)}
            color={Color4.create(0.8, 0.85, 0.95, 1)}
            uiTransform={{ margin: { top: 12 } }}
          />
          <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { top: 16 } }}>
            <Button
              value="Left"
              fontSize={fs(30)}
              color={Color4.White()}
              uiTransform={{ width: 120, height: 40, margin: { right: 8 } }}
              uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, 1) }}
              onMouseDown={() => room.send('submitDirection', { dir: 'L' })}
            />
            <Button
              value="Center"
              fontSize={fs(30)}
              color={Color4.White()}
              uiTransform={{ width: 120, height: 40, margin: { right: 8 } }}
              uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, 1) }}
              onMouseDown={() => room.send('submitDirection', { dir: 'C' })}
            />
            <Button
              value="Right"
              fontSize={fs(30)}
              color={Color4.White()}
              uiTransform={{ width: 120, height: 40 }}
              uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, 1) }}
              onMouseDown={() => room.send('submitDirection', { dir: 'R' })}
            />
          </UiEntity>
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
            <Label
              value={s.resultLine.split('\n')[1] || ''}
              fontSize={fs(30)}
              color={Color4.White()}
              textAlign="middle-center"
              uiTransform={{ margin: { top: 10 } }}
            />
            <Label
              value={s.resultLine.split('\n')[2] || ''}
              fontSize={fs(30)}
              color={Color4.White()}
              textAlign="middle-center"
              uiTransform={{ margin: { top: 4 } }}
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
                  getLeaderboardFaceUrl(s.winnerSide === 'red' ? s.redAddr : s.blueAddr)
                    ? { textureMode: 'stretch', texture: { src: getLeaderboardFaceUrl(s.winnerSide === 'red' ? s.redAddr : s.blueAddr)! } }
                    : { color: Color4.create(0.2, 0.2, 0.2, 1) }
                }
              />
              <Label
                value={`Winner: @${s.winnerName}`}
                fontSize={fs(50)}
                color={Color4.create(1, 0.92, 0.35, 1)}
                textAlign="middle-center"
              />
              {(s.winnerSide === 'red' ? s.redCountry : s.blueCountry) ? (
                <UiEntity
                  uiTransform={{ width: 96, height: 72, margin: { top: 16 } }}
                  uiBackground={{
                    textureMode: 'stretch',
                    texture: { src: flagSrc(s.winnerSide === 'red' ? s.redCountry : s.blueCountry) },
                    color: Color4.White()
                  }}
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
            <Button
              value="START"
              fontSize={fs(32)}
              color={Color4.White()}
              uiTransform={{ width: 220, height: 56 }}
              uiBackground={{ color: Color4.create(0.1, 0.65, 0.2, 1) }}
              onMouseDown={() => { splashDismissed = true }}
            />
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
            value={'Timeout in: ' + (typeof s.inactivityDeadlineMs === 'number' && s.inactivityDeadlineMs > 0 ? Math.max(0, Math.ceil((s.inactivityDeadlineMs - Date.now()) / 1000)) + 's' : 'off') + ` | server tick: ${s.serverTickCounter}`}
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
