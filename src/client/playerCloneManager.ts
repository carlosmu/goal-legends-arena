import { engine, Transform, Entity, PlayerIdentityData, GltfContainer, Animator, InputModifier, executeTask } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo, triggerSceneEmote } from '~system/RestrictedActions'
import { clientSnapshot, readPenaltySnapshot } from './gameStore'
import { GameState, AimDirection } from '../shared/gameState'

// ── Spawn positions (from assets/scene/main.composite, entities 542 / 543) ────

const KICKER_POS = Vector3.create(16.98, 0.22, 17.92)
const GK_POS     = Vector3.create(16,    0.22, 11.03)

const KICKER_ROT = { x: 0, y: 1, z: 0, w: 0 }
const GK_ROT     = { x: 0, y: 0, z: 0, w: 1 }

const TRAINING_BOT_SRC = 'assets/models/avatar_training.glb'

const ANIMS = 'assets/models/animations/'
const EMOTES = {
  [GameState.SelectingDirections]: { kicker: ANIMS + 'K_intro_emote.glb', gk: ANIMS + 'GK_intro_emote.glb' },
  [GameState.ResolvingRound]:      { kicker: ANIMS + 'K_shoot_emote.glb' },
}

function gkShootEmoteSrc(pick: string): string {
  switch (pick as AimDirection) {
    case 'L':
      return ANIMS + 'GK_shoot_L_emote.glb'
    case 'R':
      return ANIMS + 'GK_shoot_R_emote.glb'
    default:
      return ANIMS + 'GK_shoot_C_emote.glb'
  }
}

function gkShootClip(pick: string): string {
  switch (pick as AimDirection) {
    case 'L':
      return 'GK_shoot_L_emote'
    case 'R':
      return 'GK_shoot_R_emote'
    default:
      return 'GK_shoot_C_emote'
  }
}

// ── Module state ───────────────────────────────────────────────────────────────

let trainingBot: Entity | null = null

// Format: `${hasActiveMatch}-${kickerIsRed}`
let prevRoleKey         = ''
let prevPhase           = ''
let trainingBotIsKicker = false
let repositionPromise: Promise<void> = Promise.resolve()
let localEmoteToken     = 0

const EMOTE_AFTER_MOVE_MS = 150

// ── Helpers ────────────────────────────────────────────────────────────────────

function localPlayerAddr(): string {
  if (!PlayerIdentityData.has(engine.PlayerEntity)) return ''
  return PlayerIdentityData.get(engine.PlayerEntity).address.toLowerCase()
}

function ensureTrainingBot(): Entity {
  if (!trainingBot) {
    trainingBot = engine.addEntity()
    GltfContainer.create(trainingBot, { src: TRAINING_BOT_SRC })
    Transform.create(trainingBot, { scale: Vector3.Zero() })
    Animator.create(trainingBot, {
      states: [
        { clip: 'K_intro_emote',  playing: false, loop: false },
        { clip: 'K_shoot_emote',  playing: false, loop: false },
        { clip: 'GK_intro_emote',    playing: false, loop: true  },
        { clip: 'GK_shoot_L_emote',  playing: false, loop: false },
        { clip: 'GK_shoot_C_emote',  playing: false, loop: false },
        { clip: 'GK_shoot_R_emote',  playing: false, loop: false },
      ]
    })
  }
  return trainingBot
}

function playTrainingBotAnim(phase: string, gkPick: string) {
  if (!trainingBot) return
  const isIntro = phase === GameState.SelectingDirections
  const clip = trainingBotIsKicker
    ? (isIntro ? 'K_intro_emote'  : 'K_shoot_emote')
    : (isIntro ? 'GK_intro_emote' : gkShootClip(gkPick))
  Animator.stopAllAnimations(trainingBot, true)
  Animator.playSingleAnimation(trainingBot, clip, true)
}

function showTrainingBot(pos: Vector3, rot: { x: number; y: number; z: number; w: number }) {
  const e = ensureTrainingBot()
  const t = Transform.getMutable(e)
  t.position = pos
  t.rotation = rot
  t.scale    = Vector3.One()
}

function hideTrainingBot() {
  if (!trainingBot) return
  Transform.getMutable(trainingBot).scale = Vector3.Zero()
}

function lockLocomotion() {
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: true }),
  })
}

function unlockLocomotion() {
  InputModifier.createOrReplace(engine.PlayerEntity, {
    mode: InputModifier.Mode.Standard({ disableAll: false }),
  })
}

function shouldLoopSceneEmote(src: string, phase: string): boolean {
  return phase === GameState.SelectingDirections && src.endsWith('GK_intro_emote.glb')
}

function playSceneEmote(src: string, loop: boolean): void {
  if (loop) {
    void triggerSceneEmote({ src, loop: true })
    return
  }
  void triggerSceneEmote({ src, loop: false })
}

function triggerLocalEmote(phase: string, gkPick: string) {
  const entry = EMOTES[phase as keyof typeof EMOTES]
  if (!entry) return

  const s           = clientSnapshot
  const kickerIsRed = s.kickerIsRed === 1
  const localAddr   = localPlayerAddr()
  const kickerAddr  = (kickerIsRed ? s.redAddr : s.blueAddr).toLowerCase()
  const isKicker    = localAddr === kickerAddr
  const src = isKicker
    ? entry.kicker
    : phase === GameState.ResolvingRound
      ? gkShootEmoteSrc(gkPick)
      : (entry as { kicker: string; gk: string }).gk
  const loop        = shouldLoopSceneEmote(src, phase)
  const token       = ++localEmoteToken

  executeTask(async () => {
    await repositionPromise
    await new Promise<void>((resolve) => setTimeout(() => resolve(), EMOTE_AFTER_MOVE_MS))
    if (token !== localEmoteToken) return
    playSceneEmote(src, loop)
  })
}

function repositionPlayers() {
  const s           = clientSnapshot
  const kickerIsRed = s.kickerIsRed === 1
  const localAddr   = localPlayerAddr()

  const localIsRed = localAddr === s.redAddr.toLowerCase()
  const localIsBlue = localAddr === s.blueAddr.toLowerCase()
  if (!localIsRed && !localIsBlue) return

  const kickerAddr = (kickerIsRed ? s.redAddr : s.blueAddr).toLowerCase()
  const localIsKicker = localAddr === kickerAddr

  // ── Move local player and freeze locomotion ────────────────────────────────
  lockLocomotion()
  repositionPromise = localIsKicker
    ? movePlayerTo({ newRelativePosition: KICKER_POS, cameraTarget: GK_POS }).then(() => {})
    : movePlayerTo({ newRelativePosition: GK_POS, cameraTarget: KICKER_POS }).then(() => {})
}

function manageTrainingBot() {
  const s           = clientSnapshot
  const isPvE       = s.mode === 'pve'
  const kickerIsRed = s.kickerIsRed === 1
  const humanIsRed  = s.pveHumanIsRed === 1

  if (!isPvE) {
    hideTrainingBot()
    return
  }

  const kickerIsAI = kickerIsRed !== humanIsRed
  trainingBotIsKicker = kickerIsAI
  if (kickerIsAI) {
    showTrainingBot(KICKER_POS, KICKER_ROT)
  } else {
    showTrainingBot(GK_POS, GK_ROT)
  }
}

// ── System ─────────────────────────────────────────────────────────────────────

export function initPlayerCloneSystem(): void {
  engine.addSystem((_dt: number) => {
    const s       = readPenaltySnapshot()
    const active  = s.hasActiveMatch
    const phase   = s.phase
    const localAddr = localPlayerAddr()
    const localIsRed = localAddr === s.redAddr.toLowerCase()
    const localIsBlue = localAddr === s.blueAddr.toLowerCase()

    const roleKey = `${active}-${s.kickerIsRed}`
    if (roleKey !== prevRoleKey) {
      prevRoleKey = roleKey
      if (active === 1) {
        repositionPlayers()
        manageTrainingBot()
      } else {
        hideTrainingBot()
        unlockLocomotion()
        prevPhase = ''
        localEmoteToken++
        repositionPromise = Promise.resolve()
      }
    }

    if (active === 1 && phase !== prevPhase) {
      prevPhase = phase
      if (localIsRed || localIsBlue) {
        triggerLocalEmote(phase, s.gkPick)
      }
      playTrainingBotAnim(phase, s.gkPick)
    }
  })
}
