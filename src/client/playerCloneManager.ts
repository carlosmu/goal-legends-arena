import { engine, Transform, Entity, PlayerIdentityData, GltfContainer, Animator, InputModifier } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo, triggerSceneEmote } from '~system/RestrictedActions'
import { clientSnapshot } from './gameStore'
import { GameState } from '../shared/gameState'

// ── Spawn positions (from assets/scene/main.composite, entities 542 / 543) ────

const KICKER_POS = Vector3.create(16.98, 0.22, 17.92)
const GK_POS     = Vector3.create(16,    0.22, 11.03)

const KICKER_ROT = { x: 0, y: 1, z: 0, w: 0 }
const GK_ROT     = { x: 0, y: 0, z: 0, w: 1 }

const TRAINING_BOT_SRC = 'assets/models/avatar_training.glb'

const ANIMS = 'assets/models/animations/'
const EMOTES = {
  [GameState.SelectingDirections]: { kicker: ANIMS + 'K_intro_emote.glb', gk: ANIMS + 'GK_intro_emote.glb' },
  [GameState.ResolvingRound]:      { kicker: ANIMS + 'K_shoot_emote.glb', gk: ANIMS + 'GK_shoot_emote.glb' },
}

// ── Module state ───────────────────────────────────────────────────────────────

let trainingBot: Entity | null = null

// Format: `${hasActiveMatch}-${kickerIsRed}`
let prevRoleKey         = ''
let prevPhase           = ''
let trainingBotIsKicker = false

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
        { clip: 'GK_intro_emote', playing: false, loop: true  },
        { clip: 'GK_shoot_emote', playing: false, loop: false },
      ]
    })
  }
  return trainingBot
}

function playTrainingBotAnim(phase: string) {
  if (!trainingBot) return
  const anim = Animator.getMutable(trainingBot)
  const isIntro = phase === GameState.SelectingDirections
  if (trainingBotIsKicker) {
    anim.states[0].playing = isIntro   // K_intro_emote
    anim.states[1].playing = !isIntro  // K_shoot_emote
    anim.states[2].playing = false
    anim.states[3].playing = false
  } else {
    anim.states[0].playing = false
    anim.states[1].playing = false
    anim.states[2].playing = isIntro   // GK_intro_emote
    anim.states[3].playing = !isIntro  // GK_shoot_emote
  }
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

function triggerLocalEmote(phase: string) {
  const entry = EMOTES[phase as keyof typeof EMOTES]
  if (!entry) return

  const s           = clientSnapshot
  const kickerIsRed = s.kickerIsRed === 1
  const localAddr   = localPlayerAddr()
  const kickerAddr  = (kickerIsRed ? s.redAddr : s.blueAddr).toLowerCase()
  const isKicker    = localAddr === kickerAddr

  const loop = phase === GameState.SelectingDirections
  void triggerSceneEmote({ src: isKicker ? entry.kicker : entry.gk, loop })
}

function repositionPlayers() {
  const s           = clientSnapshot
  const isPvE       = s.mode === 'pve'
  const kickerIsRed = s.kickerIsRed === 1
  const humanIsRed  = s.pveHumanIsRed === 1
  const localAddr   = localPlayerAddr()

  const kickerAddr = (kickerIsRed ? s.redAddr : s.blueAddr).toLowerCase()
  const localIsKicker = localAddr === kickerAddr

  // ── Move local player and freeze locomotion ────────────────────────────────
  lockLocomotion()
  if (localIsKicker) {
    void movePlayerTo({ newRelativePosition: KICKER_POS, cameraTarget: GK_POS })
  } else {
    void movePlayerTo({ newRelativePosition: GK_POS, cameraTarget: KICKER_POS })
  }

  // ── Training bot for PvE AI opponent ──────────────────────────────────────
  if (isPvE) {
    const kickerIsAI = kickerIsRed !== humanIsRed
    trainingBotIsKicker = kickerIsAI
    if (kickerIsAI) {
      showTrainingBot(KICKER_POS, KICKER_ROT)
    } else {
      showTrainingBot(GK_POS, GK_ROT)
    }
  } else {
    hideTrainingBot()
  }
}

// ── System ─────────────────────────────────────────────────────────────────────

export function initPlayerCloneSystem(): void {
  engine.addSystem((_dt: number) => {
    const s      = clientSnapshot
    const active = s.hasActiveMatch
    const phase  = s.phase

    const roleKey = `${active}-${s.kickerIsRed}`
    if (roleKey !== prevRoleKey) {
      prevRoleKey = roleKey
      if (active === 1) {
        repositionPlayers()
      } else {
        hideTrainingBot()
        unlockLocomotion()
        prevPhase = ''
      }
    }

    if (active === 1 && phase !== prevPhase) {
      prevPhase = phase
      triggerLocalEmote(phase)
      playTrainingBotAnim(phase)
    }
  })
}
