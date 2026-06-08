import { engine, Animator, GltfContainer, VisibilityComponent, Entity } from '@dcl/sdk/ecs'
import { GameState, AimDirection } from '../shared/gameState'
import type { ClientSnapshot } from './gameStore'

/**
 * Ball (assets/models/animations/ball.glb) is invisible by default and only shown
 * during the round: Ball_Intro while directions are picked (alongside K_intro_emote),
 * then Goal_L/C/R or Save_L/C/R during ResolvingRound depending on pick + outcome.
 */
const BALL_SRC_HINT = 'animations/ball.glb'
const BALL_CLIPS = ['Ball_Intro', 'Goal_L', 'Goal_C', 'Goal_R', 'Save_L', 'Save_C', 'Save_R'] as const

let ballEntity: Entity | null = null
let ballAnimatorReady = false
let prevPhase = ''
/** Ball stays hidden this long after an intro→shot swap so the clip cross-fade isn't seen. */
const BALL_SWAP_HIDE_MS = 180
/** Epoch ms when the ball should be revealed after a swap; 0 = nothing pending. */
let revealAtMs = 0

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
  revealAtMs = 0
}

export function tickAnimationManager(s: ClientSnapshot): void {
  const e = ensureBall()
  if (e === null) return

  // Reveal the ball once the swap window passed (kept hidden during the intro→shot
  // clip cross-fade so the pose pop / floating jump isn't visible).
  if (revealAtMs > 0 && Date.now() >= revealAtMs) {
    VisibilityComponent.createOrReplace(e, { visible: true })
    revealAtMs = 0
  }

  if (s.phase === prevPhase) return
  prevPhase = s.phase

  if (s.phase === GameState.SelectingDirections) {
    // Mirrors the kicker's K_intro_emote (human or NPC) at the start of each round.
    showAndPlay(e, 'Ball_Intro')
    revealAtMs = 0
  } else if (s.phase === GameState.ResolvingRound) {
    const clip = ballClipFor(s.kickerPick, s.lastRoundWasGoal === 1)
    if (clip) {
      // Swap to the shot while hidden, reveal after the cross-fade — no float at the cut.
      VisibilityComponent.createOrReplace(e, { visible: false })
      Animator.stopAllAnimations(e, true)
      Animator.playSingleAnimation(e, clip, true)
      revealAtMs = Date.now() + BALL_SWAP_HIDE_MS
    } else {
      hideBall(e)
    }
  } else {
    hideBall(e)
    revealAtMs = 0
  }
}
