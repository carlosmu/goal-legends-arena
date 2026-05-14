import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/src/players'
import { readPenaltySnapshot, clientSnapshot, penaltyStateEntityReady } from './gameStore'
import { formatLeaderboardLines } from './leaderboardManager'
import { room } from '../shared/messages'
import { GameState } from '../shared/gameState'

/** El runtime de React-ECS no repinta solo; hay que pulsar para leer el estado sincronizado cada frame. */
let pulseGameUi: () => void = () => {}

export function bumpGameUiFrame() {
  pulseGameUi()
}

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

const RootUi = () => {
  const [, setUiFrame] = ReactEcs.useState(0)
  ReactEcs.useEffect(() => {
    pulseGameUi = () => setUiFrame((n) => n + 1)
    return () => {
      pulseGameUi = () => {}
    }
  }, [])

  readPenaltySnapshot()
  const s = clientSnapshot
  const me = getPlayer()?.userId || ''
  const myName = getPlayer()?.name || me
  const side = mySide(s, me)
  const kicker = isKickerView(s, side)
  const waitLeft = s.waitEndMs > 0 ? Math.max(0, Math.ceil((s.waitEndMs - Date.now()) / 1000)) : 0
  const roundLabel = s.suddenDeath ? `Sudden death — shot ${s.shotIndex + 1}` : `Shoot ${Math.min(s.shotIndex + 1, 10)} / 10`
  const lbLines = formatLeaderboardLines(s.leaderboardJson, 10)

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

      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '15vh', left: 16 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: 12,
          maxWidth: 420
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.75) }}
      >
        <Label value="Leaderboard" fontSize={16} color={Color4.White()} uiTransform={{ margin: { bottom: 8 } }} />
        <Label
          value={lbLines.length ? lbLines.join('   |   ') : '(no wins yet)'}
          fontSize={13}
          color={Color4.create(0.9, 0.95, 1, 1)}
          uiTransform={{ margin: { top: 6 }, maxWidth: 400 }}
        />
      </UiEntity>

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

      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { bottom: 24, left: '50%' },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <Label
          value={`state: ${s.phase} | sync: ${isStateSyncronized() ? 'ok' : 'no'} | match: ${penaltyStateEntityReady() ? 'ok' : '—'}`}
          fontSize={14}
          color={Color4.create(0.7, 1, 0.75, 1)}
          textAlign="middle-center"
        />
        <Label value={`you: ${myName}`} fontSize={12} color={Color4.create(0.65, 0.75, 0.85, 1)} uiTransform={{ margin: { top: 4 } }} />
      </UiEntity>
    </UiEntity>
  )
}
