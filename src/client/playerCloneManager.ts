import { engine, Transform, Entity, PlayerIdentityData, GltfContainer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { clientSnapshot } from './gameStore'

// ── Spawn positions (from assets/scene/main.composite, entities 542 / 543) ────

const KICKER_POS = Vector3.create(16.98, 0.22, 17.92)
const GK_POS     = Vector3.create(16,    0.22, 11.03)

const KICKER_ROT = { x: 0, y: 1, z: 0, w: 0 }
const GK_ROT     = { x: 0, y: 0, z: 0, w: 1 }

const TRAINING_BOT_SRC = 'assets/models/avatar_training.glb'

// ── Module state ───────────────────────────────────────────────────────────────

let trainingBot: Entity | null = null

// Tracks the last role assignment so we only reposition on actual changes.
// Format: `${hasActiveMatch}-${kickerIsRed}`
let prevRoleKey = ''

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
  }
  return trainingBot
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

function repositionPlayers() {
  const s           = clientSnapshot
  const isPvE       = s.mode === 'pve'
  const kickerIsRed = s.kickerIsRed === 1
  const humanIsRed  = s.pveHumanIsRed === 1
  const localAddr   = localPlayerAddr()

  const kickerAddr = (kickerIsRed ? s.redAddr : s.blueAddr).toLowerCase()
  const localIsKicker = localAddr === kickerAddr

  // ── Move local player ──────────────────────────────────────────────────────
  if (localIsKicker) {
    void movePlayerTo({ newRelativePosition: KICKER_POS, cameraTarget: GK_POS })
  } else {
    void movePlayerTo({ newRelativePosition: GK_POS, cameraTarget: KICKER_POS })
  }

  // ── Training bot for PvE AI opponent ──────────────────────────────────────
  if (isPvE) {
    const kickerIsAI = kickerIsRed !== humanIsRed
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

    const roleKey = `${active}-${s.kickerIsRed}`

    if (roleKey === prevRoleKey) return
    prevRoleKey = roleKey

    if (active === 1) {
      repositionPlayers()
    } else {
      hideTrainingBot()
    }
  })
}
