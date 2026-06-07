import { engine, Animator, GltfContainer, VisibilityComponent, Entity } from '@dcl/sdk/ecs'
import { GameState, AimDirection } from '../shared/gameState'
import type { ClientSnapshot } from './gameStore'

/**
 * Ball (assets/models/animations/ball.glb) is invisible by default and only shown
 * during ResolvingRound, playing the clip that matches the kicker's pick and the
 * outcome: Goal_L/C/R when it's a goal, Save_L/C/R when the keeper saves it.
 */
const BALL_SRC_HINT = 'animations/ball.glb'
const BALL_CLIPS = ['Goal_L', 'Goal_C', 'Goal_R', 'Save_L', 'Save_C', 'Save_R'] as const

let ballEntity: Entity | null = null
let ballAnimatorReady = false
let prevPhase = ''

function findBall(): Entity | null {
  for (const [e, g] of engine.getEntitiesWith(GltfContainer)) {
    if (g.src.includes(BALL_SRC_HINT)) return e
  }
  return null
}

/** Resolve the ball entity (deferred-loaded) and make sure all 6 clips exist on it. */
function ensureBall(): Entity | null {
  if (ballEntity !== null && !GltfContainer.has(ballEntity)) {
    ballEntity = null
    ballAnimatorReady = false
  }
  if (ballEntity === null) ballEntity = findBall()
  if (ballEntity === null) return null
  if (!ballAnimatorReady) {
    Animator.createOrReplace(ballEntity, {
      states: BALL_CLIPS.map((clip) => ({ clip, playing: false, loop: false }))
    })
    ballAnimatorReady = true
  }
  return ballEntity
}

function ballClipFor(kickerPick: string, goal: boolean): string | null {
  const dir = kickerPick as AimDirection
  if (dir !== 'L' && dir !== 'C' && dir !== 'R') return null
  return `${goal ? 'Goal' : 'Save'}_${dir}`
}

function showAndPlay(e: Entity, clip: string): void {
  VisibilityComponent.createOrReplace(e, { visible: true })
  Animator.stopAllAnimations(e, true)
  Animator.playSingleAnimation(e, clip, true)
}

function hideBall(e: Entity): void {
  Animator.stopAllAnimations(e, true)
  VisibilityComponent.createOrReplace(e, { visible: false })
}

export function initAnimationManager(): void {
  prevPhase = ''
  ballEntity = null
  ballAnimatorReady = false
}

export function tickAnimationManager(s: ClientSnapshot): void {
  const e = ensureBall()
  if (e === null) return
  if (s.phase === prevPhase) return
  prevPhase = s.phase

  if (s.phase === GameState.ResolvingRound) {
    const clip = ballClipFor(s.kickerPick, s.lastRoundWasGoal === 1)
    if (clip) showAndPlay(e, clip)
    else hideBall(e)
  } else {
    hideBall(e)
  }
}
