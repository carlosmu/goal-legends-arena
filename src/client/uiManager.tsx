import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/src/players'
import { readPenaltySnapshot, clientSnapshot, penaltyStateEntityReady } from './gameStore'
import { getLeaderboardRows } from './leaderboardManager'
import { getLeaderboardFaceUrl } from './leaderboardProfileCache'
import { room } from '../shared/messages'
import { GameState } from '../shared/gameState'

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

const LEADERBOARD_TOP_N = 5

const RootUi = () => {
  readPenaltySnapshot()
  const s = clientSnapshot
  const me = getPlayer()?.userId || ''
  const myName = getPlayer()?.name || me
  const side = mySide(s, me)
  const kicker = isKickerView(s, side)
  const waitLeft = s.waitEndMs > 0 ? Math.max(0, Math.ceil((s.waitEndMs - Date.now()) / 1000)) : 0
  const roundLabel = s.suddenDeath ? `Sudden death — shot ${s.shotIndex + 1}` : `Shoot ${Math.min(s.shotIndex + 1, 10)} / 10`
  const lbRows = getLeaderboardRows(s.leaderboardJson, LEADERBOARD_TOP_N)

  /** Partida en curso (oculta welcome para nuevos hasta que termine). No incluye solo “esperando rival”. */
  const showWelcome = s.hasActiveMatch === 0 && s.phase === GameState.LobbyIdle
  const showWaiting =
    s.phase === GameState.WaitingOpponent && side && waitLeft > 0 && !(s.redAddr && s.blueAddr && s.mode !== 'pve')
  const showPick =
    s.phase === GameState.SelectingDirections && side && (s.mode === 'pvp' || (s.mode === 'pve' && !!side))
  const showResult = s.phase === GameState.ResolvingRound && !!s.resultLine
  const showMatchEnd = s.phase === GameState.MatchEnd && !!s.winnerName
  const showStreak =
    s.phase === GameState.WinnerContinuePrompt &&
    !!me &&
    !!s.winnerStreakAddr &&
    me.toLowerCase() === s.winnerStreakAddr.toLowerCase()
  const showSpectatorChallenge =
    s.spectatorChallengeActive === 1 &&
    !!me &&
    !!s.winnerStreakAddr &&
    me.toLowerCase() !== s.winnerStreakAddr.toLowerCase()

  const scoreLine = `@${s.redName || 'Red'}: ${s.redScore} - ${s.blueScore} :@${s.blueName || 'Blue'}`

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
      {s.hasActiveMatch === 1 && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 12, left: '50%' },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <Label value={scoreLine} fontSize={20} color={Color4.White()} textAlign="middle-center" />
        </UiEntity>
      )}

      {/* ========== UI: LEADERBOARD (panel superior izquierdo) ==========
          · Contenedor exterior: mueve todo el bloque editando `padding` (top/left/right/bottom) y `zIndex`.
          · Contenedor interior (fondo negro): tamaño, padding del panel, `maxWidth`, `uiBackground`.
          · Filas: top 5 con `getLeaderboardRows`; miniatura vía `getLeaderboardFaceUrl` (cache en `leaderboardProfileCache`).
          Fin bloque leaderboard → siguiente sección: Welcome / Lobby.
      */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          padding: { top: '15vh', left: '5vh' },
          zIndex: 50,
          pointerFilter: 'none'
        }}
      >
        {/* Panel visible del leaderboard (fondo + texto) */}
        <UiEntity
          uiTransform={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: 12,
            maxWidth: 420
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
        >
          <Label value="DEV-Leaderboard" fontSize={16} color={Color4.White()} uiTransform={{ margin: { bottom: 8 } }} />
          {lbRows.length === 0 ? (
            <Label
              value="(no wins yet)"
              fontSize={13}
              color={Color4.create(0.9, 0.95, 1, 1)}
              uiTransform={{ margin: { top: 6 }, maxWidth: 400 }}
            />
          ) : (
            lbRows.map((row) => {
              const face = getLeaderboardFaceUrl(row.addr)
              const rowH = 40
              const faceSz = 36
              return (
                <UiEntity
                  key={row.addr}
                  uiTransform={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    minHeight: rowH,
                    margin: { top: row.rank === 1 ? 6 : 4 },
                    maxWidth: 400
                  }}
                >
                  <UiEntity
                    uiTransform={{
                      width: 32,
                      height: rowH,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      margin: { right: 4 }
                    }}
                  >
                    <Label value={`${row.rank}.`} fontSize={13} color={Color4.White()} textAlign="middle-center" />
                  </UiEntity>
                  <UiEntity
                    uiTransform={{
                      width: faceSz,
                      height: faceSz,
                      margin: { right: 8 },
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                    uiBackground={
                      face
                        ? { textureMode: 'stretch', texture: { src: face } }
                        : { color: Color4.create(0.22, 0.24, 0.3, 1) }
                    }
                  />
                  <UiEntity
                    uiTransform={{
                      flexGrow: 1,
                      minHeight: rowH,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start'
                    }}
                  >
                    <Label
                      value={`${row.name} - wins: ${row.wins} | streak: ${row.streak}`}
                      fontSize={13}
                      color={Color4.create(0.9, 0.95, 1, 1)}
                      textAlign="middle-left"
                    />
                  </UiEntity>
                </UiEntity>
              )
            })
          )}
        </UiEntity>
      </UiEntity>
      {/* ========== fin UI LEADERBOARD ========== */}

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
          uiBackground={{ color: Color4.create(0, 0, 0, 0.82) }}
        >
          <Label
            value="Welcome to Goal Legends Arena. Choose a Spot to Begin"
            fontSize={22}
            color={Color4.White()}
            textAlign="middle-center"
          />
          <Label
            value="Walk to the Red or Blue spot, then click or press E (same as Sit Here)."
            fontSize={16}
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
          uiBackground={{ color: Color4.create(0, 0, 0, 0.78) }}
        >
          <Label value="Waiting for the rival" fontSize={24} color={Color4.White()} textAlign="middle-center" />
          <Label
            value={`${waitLeft}s`}
            fontSize={20}
            color={Color4.create(1, 0.85, 0.2, 1)}
            uiTransform={{ margin: { top: 10 } }}
          />
        </UiEntity>
      )}

      {showPick && (
        <UiEntity
          uiTransform={{
            margin: { top: '10vh' },
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: 760
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.82) }}
        >
          <Label value={roundLabel} fontSize={18} color={Color4.create(0.9, 0.95, 1, 1)} uiTransform={{ margin: { bottom: 10 } }} />
          {kicker && (
            <Label
              value="You are the Kicker — choose where to shoot (Left / Center / Right)"
              fontSize={20}
              color={Color4.White()}
              textAlign="middle-center"
            />
          )}
          {!kicker && (
            <Label
              value="You are the Goalkeeper — choose where to dive (Left / Center / Right)"
              fontSize={20}
              color={Color4.White()}
              textAlign="middle-center"
            />
          )}
          <Label
            value="Use the green boxes near the goal or the buttons below."
            fontSize={14}
            color={Color4.create(0.8, 0.85, 0.95, 1)}
            uiTransform={{ margin: { top: 12 } }}
          />
          <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { top: 16 } }}>
            <Button
              value="Left"
              fontSize={16}
              color={Color4.White()}
              uiTransform={{ width: 120, height: 40, margin: { right: 8 } }}
              uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, 1) }}
              onMouseDown={() => room.send('submitDirection', { dir: 'L' })}
            />
            <Button
              value="Center"
              fontSize={16}
              color={Color4.White()}
              uiTransform={{ width: 120, height: 40, margin: { right: 8 } }}
              uiBackground={{ color: Color4.create(0.15, 0.45, 0.85, 1) }}
              onMouseDown={() => room.send('submitDirection', { dir: 'C' })}
            />
            <Button
              value="Right"
              fontSize={16}
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
            margin: { top: '8vh' },
            padding: 22,
            maxWidth: 900
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.88) }}
        >
          <Label value={s.resultLine} fontSize={20} color={Color4.Yellow()} textAlign="middle-center" />
        </UiEntity>
      )}

      {showMatchEnd && (
        <UiEntity
          uiTransform={{
            margin: { top: '8vh' },
            padding: 26,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
          uiBackground={{ color: Color4.create(0.05, 0.12, 0.08, 0.92) }}
        >
          <Label value={`Winner: @${s.winnerName}`} fontSize={32} color={Color4.create(1, 0.92, 0.35, 1)} textAlign="middle-center" />
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
          <Label value="Keep playing on this spot?" fontSize={20} color={Color4.White()} />
          <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { top: 14 } }}>
            <Button
              value="YES"
              fontSize={18}
              color={Color4.White()}
              uiTransform={{ width: 140, height: 44, margin: { right: 12 } }}
              uiBackground={{ color: Color4.create(0.1, 0.65, 0.35, 1) }}
              onMouseDown={() => room.send('streakDecision', { continue: 1 })}
            />
            <Button
              value="NO"
              fontSize={18}
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
            fontSize={18}
            color={Color4.White()}
            textAlign="middle-center"
          />
          <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { top: 14 } }}>
            <Button
              value="YES"
              fontSize={16}
              color={Color4.White()}
              uiTransform={{ width: 120, height: 40, margin: { right: 10 } }}
              uiBackground={{ color: Color4.create(0.2, 0.55, 0.9, 1) }}
              onMouseDown={() => room.send('spectatorChallenge', { accept: 1 })}
            />
            <Button
              value="NO"
              fontSize={16}
              color={Color4.White()}
              uiTransform={{ width: 120, height: 40 }}
              uiBackground={{ color: Color4.create(0.35, 0.35, 0.4, 1) }}
              onMouseDown={() => room.send('spectatorChallenge', { accept: 0 })}
            />
          </UiEntity>
        </UiEntity>
      )}

      {side && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: 170, left: 0, right: 0 },
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'flex-start',
            zIndex: 100
          }}
        >
          <UiEntity
            uiTransform={{
              padding: { top: 2, bottom: 2, left: 16, right: 16 }
            }}
            uiBackground={{
              color: side === 'red' ? Color4.create(0.75, 0.12, 0.18, 0.92) : Color4.create(0.12, 0.35, 0.85, 0.92)
            }}
          >
            <Label
              value={`You are ${side === 'red' ? 'RED' : 'BLUE'} — seat OK`}
              fontSize={18}
              color={Color4.White()}
              textAlign="middle-center"
            />
          </UiEntity>
        </UiEntity>
      )}

      <UiEntity
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
            maxWidth: 720
          }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.85) }}
        >
          <Label
            value="DEV-INFO"
            fontSize={17}
            color={Color4.create(0.55, 1, 0.75, 1)}
            textAlign="middle-center"
            uiTransform={{ margin: { bottom: 6 } }}
          />
          <Label
            value={`state: ${s.phase} | sync: ${isStateSyncronized() ? 'ok' : 'no'} | match: ${penaltyStateEntityReady() ? 'ok' : '—'} | mode: ${s.mode} | active: ${s.hasActiveMatch}`}
            fontSize={14}
            color={Color4.create(0.75, 1, 0.8, 1)}
          />
          <Label
            value={`side: ${side ?? '(none)'} | red: ${s.redName || '—'} (${shortAddr(s.redAddr)}) | blue: ${s.blueName || '—'} (${shortAddr(s.blueAddr)})`}
            fontSize={13}
            color={Color4.create(0.85, 0.9, 1, 1)}
            uiTransform={{ margin: { top: 4 } }}
          />
          <Label
            value={`you: ${myName} (${shortAddr(me)}) | server tick: ${s.serverTickCounter}`}
            fontSize={13}
            color={Color4.create(0.7, 0.8, 0.95, 1)}
            uiTransform={{ margin: { top: 4 } }}
          />
          <Label
            value={`last server event: ${s.lastServerEvent || '(none)'}`}
            fontSize={13}
            color={Color4.create(1, 0.9, 0.6, 1)}
            uiTransform={{ margin: { top: 4 } }}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

function shortAddr(addr: string): string {
  if (!addr) return '—'
  if (addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
