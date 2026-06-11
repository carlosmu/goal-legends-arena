import { engine, Transform, Entity, MainCamera, VirtualCamera, Name } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { getPlayer } from '@dcl/sdk/src/players'
import { clientSnapshot } from './gameStore'
import { GameState } from '../shared/gameState'
import { LEADERBOARD_MATCH_END_MS, SPOT_PROMPT_DELAY_MS } from '../shared/constants'

/** Keep the winner cinematic this long into WinnerContinuePrompt: the match-end leaderboard
 *  window plus the delay before the "Face the winner" prompt appears. Released after that. */
const POST_MATCH_CINEMATIC_MS = LEADERBOARD_MATCH_END_MS + SPOT_PROMPT_DELAY_MS

// ── State ──────────────────────────────────────────────────────────────────────

let pivotEntity:  Entity | null = null
let cameraEntity: Entity | null = null
/** Post-match cinematic: elevated, looking at its pivot, turned 180° to frame the stadium. */
let winnerCameraEntity: Entity | null = null
let winnerPivotEntity: Entity | null = null
let activeVCam: Entity | null = null

/** Winner camera: pivot spins continuously around Y (full 360° loop) for a cinematic shot. */
const WINNER_CAM_BASE_YAW = 180
const WINNER_CAM_SPIN_DEG_PER_SEC = 18 // ~20 s per full revolution
let winnerCamSpinT = 0
/** Phase last seen by the camera system + when WinnerContinuePrompt began (for the
 *  leaderboard cinematic window). */
let prevCamPhase = ''
let winnerPromptStartMs = 0

/** Camera choice for spectators (players in scene not in the match). 'match' = cinematic. */
export type SpectatorCameraMode = 'match' | 'free'
let spectatorCameraMode: SpectatorCameraMode = 'match'

export function setSpectatorCameraMode(mode: SpectatorCameraMode): void {
  spectatorCameraMode = mode
}

export function getSpectatorCameraMode(): SpectatorCameraMode {
  return spectatorCameraMode
}

function localIsMatchParticipant(): boolean {
  const me = (getPlayer()?.userId || '').toLowerCase()
  if (!me) return false
  return me === clientSnapshot.redAddr.toLowerCase() || me === clientSnapshot.blueAddr.toLowerCase()
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function findPivot(): Entity | null {
  for (const [e, nm] of engine.getEntitiesWith(Name)) {
    if (nm.value === 'Cinematic_Camera_Pivot') return e
  }
  return null
}

function createCamera(pivot: Entity): Entity {
  const e = engine.addEntity()

  // 6 m on local +X from pivot; lookAtEntity keeps it aimed at the pivot
  Transform.create(e, {
    position: { x: 6, y: 2, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    parent:   pivot,
  })

  VirtualCamera.create(e, {
    lookAtEntity:      pivot as unknown as number,
    defaultTransition: { transitionMode: { $case: 'time', time: 0.5 } },
  })

  return e
}

/** Self-contained winner camera: own pivot at (16,2,16) turned 180° in Y, camera 10 m up
 *  (offset back on Z), aimed at the pivot so it frames the stadium. */
function createWinnerCamera(): Entity {
  const pivot = engine.addEntity()
  Transform.create(pivot, {
    position: Vector3.create(16, 2, 16),
    rotation: Quaternion.fromEulerDegrees(0, WINNER_CAM_BASE_YAW, 0),
  })
  winnerPivotEntity = pivot

  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(0, 10, 12),
    parent:   pivot,
  })
  VirtualCamera.create(e, {
    lookAtEntity:      pivot as unknown as number,
    defaultTransition: { transitionMode: { $case: 'time', time: 0.5 } },
  })

  return e
}

/** Switch the active virtual camera (or null = standard Decentraland camera). */
function setActiveCamera(target: Entity | null) {
  if (activeVCam === target) return
  activeVCam = target
  MainCamera.createOrReplace(engine.CameraEntity, {
    virtualCameraEntity: target === null ? undefined : (target as unknown as number),
  })
}

// ── System ─────────────────────────────────────────────────────────────────────

export function initGameplayCamera(): void {
  engine.addSystem((dt: number) => {
    // Discover pivot from Creator Hub as soon as it's available
    if (!pivotEntity) {
      pivotEntity = findPivot()
      if (pivotEntity) cameraEntity = createCamera(pivotEntity)
    }
    if (!winnerCameraEntity) winnerCameraEntity = createWinnerCamera()

    const phase = clientSnapshot.phase
    const matchActive = clientSnapshot.hasActiveMatch === 1

    // Mark when WinnerContinuePrompt began so the cinematic can span the leaderboard window.
    if (phase === GameState.WinnerContinuePrompt && prevCamPhase !== GameState.WinnerContinuePrompt) {
      winnerPromptStartMs = Date.now()
    }
    prevCamPhase = phase

    // Only a real win triggers the celebration — an abandonment / leave / disconnect ends the
    // match with no winnerSide and must NOT show the winner cinematic.
    const hasWinner = clientSnapshot.winnerSide !== ''

    // Winner celebration: the spinning winner camera is shown to EVERYONE during the winner
    // banner (MatchEnd) AND the match-end leaderboard window at the start of WinnerContinuePrompt.
    const inLeaderboardWindow =
      phase === GameState.WinnerContinuePrompt && Date.now() - winnerPromptStartMs < POST_MATCH_CINEMATIC_MS
    const isWinnerCinematic = matchActive && hasWinner && (phase === GameState.MatchEnd || inLeaderboardWindow)
    if (isWinnerCinematic) {
      setActiveCamera(winnerCameraEntity)
      if (winnerPivotEntity) {
        winnerCamSpinT += dt
        const yaw = WINNER_CAM_BASE_YAW + WINNER_CAM_SPIN_DEG_PER_SEC * winnerCamSpinT
        Transform.getMutable(winnerPivotEntity).rotation = Quaternion.fromEulerDegrees(0, yaw, 0)
      }
      return
    }
    winnerCamSpinT = 0

    // Match over with no celebration: the "Face the winner" prompt (WinnerContinuePrompt) or a
    // winner-less end (abandonment / leave / disconnect at MatchEnd). Release EVERYONE to the
    // standard Decentraland camera so they can look around freely.
    if (matchActive && (phase === GameState.WinnerContinuePrompt || (phase === GameState.MatchEnd && !hasWinner))) {
      setActiveCamera(null)
      return
    }

    // Otherwise: participants always get the gameplay cinematic; spectators get it
    // unless they opted into the free (standard Decentraland) camera.
    const wantCinematic =
      matchActive && (localIsMatchParticipant() || spectatorCameraMode === 'match')
    if (wantCinematic && cameraEntity) {
      setActiveCamera(cameraEntity)
    } else {
      setActiveCamera(null)
    }
  })
}
