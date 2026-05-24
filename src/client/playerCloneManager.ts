import { engine, Transform, AvatarShape, Entity, PlayerIdentityData, AvatarEquippedData, AvatarBase } from '@dcl/sdk/ecs'
import { Color3 } from '@dcl/sdk/math'
import { clientSnapshot } from './gameStore'

// ── Constants ──────────────────────────────────────────────────────────────────

const URN = 'urn:decentraland:off-chain:base-avatars:'
const BODY_MALE = URN + 'BaseMale'

const GENERIC_WEARABLES = [
  URN + 'soccer_shirt',
  URN + 'hip_hop_joggers',
  URN + 'm_feet_soccershoes',
  URN + 'keanu_hair',
]
const GENERIC_SKIN = Color3.create(0.769, 0.576, 0.384)
const GENERIC_HAIR = Color3.Black()

const HIDDEN_SCALE = { x: 0, y: 0, z: 0 }
const VISIBLE_SCALE = { x: 1, y: 1, z: 1 }

// Positions read from assets/scene/main.composite (entities 542 / 543)
const KICKER_SPAWN = {
  pos: { x: 16.98, y: 0.22, z: 17.92 },
  rot: { x: 0, y: 1, z: 0, w: 0 },
}
const GK_SPAWN = {
  pos: { x: 16, y: 0.22, z: 11.03 },
  rot: { x: 0, y: 0, z: 0, w: 1 },
}

// ── Module state ───────────────────────────────────────────────────────────────

let kickerClone: Entity
let gkClone: Entity

let prevKickerKey = ''
let prevGkKey     = ''
let kickerVisible = false
let gkVisible     = false

let kickerHasWearables = false
let gkHasWearables     = false

// ── Avatar helpers ─────────────────────────────────────────────────────────────

function findPlayerEntity(addr: string): Entity | null {
  const lower = addr.toLowerCase()
  for (const [e, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address.toLowerCase() === lower) return e
  }
  return null
}

function applyPlayerAvatar(entity: Entity, addr: string): boolean {
  const player = findPlayerEntity(addr)
  const eq   = player && AvatarEquippedData.has(player) ? AvatarEquippedData.get(player) : null
  const base = player && AvatarBase.has(player)         ? AvatarBase.get(player)         : null
  const wearables = eq?.wearableUrns?.length ? [...eq.wearableUrns] : []
  AvatarShape.createOrReplace(entity, {
    id:                         addr.toLowerCase(),
    name:                       '',
    bodyShape:                  base?.bodyShapeUrn || BODY_MALE,
    wearables,
    skinColor:                  base?.skinColor ?? Color3.White(),
    hairColor:                  base?.hairColor ?? Color3.Black(),
    eyeColor:                   base?.eyesColor ?? Color3.create(0.4, 0.6, 0.8),
    emotes:                     [],
    expressionTriggerId:        '',
    expressionTriggerTimestamp: 0,
  })
  return wearables.length > 0
}

function applyGenericAvatar(entity: Entity, slotId: string) {
  AvatarShape.createOrReplace(entity, {
    id:                         slotId,
    name:                       '',
    bodyShape:                  BODY_MALE,
    wearables:                  GENERIC_WEARABLES,
    skinColor:                  GENERIC_SKIN,
    hairColor:                  GENERIC_HAIR,
    emotes:                     [],
    expressionTriggerId:        '',
    expressionTriggerTimestamp: 0,
  })
}

// ── Entity creation ────────────────────────────────────────────────────────────

function createCloneEntity(slotId: string, spawn: { pos: any; rot: any }): Entity {
  const e = engine.addEntity()
  AvatarShape.create(e, {
    id:                         slotId,
    name:                       '',
    bodyShape:                  BODY_MALE,
    wearables:                  [],
    skinColor:                  Color3.White(),
    hairColor:                  Color3.Black(),
    emotes:                     [],
    expressionTriggerId:        '',
    expressionTriggerTimestamp: 0,
  })
  Transform.create(e, { position: spawn.pos, rotation: spawn.rot, scale: HIDDEN_SCALE })
  return e
}

function setVisible(entity: Entity, visible: boolean) {
  Transform.getMutable(entity).scale = visible ? VISIBLE_SCALE : HIDDEN_SCALE
}

// ── System ─────────────────────────────────────────────────────────────────────

export function initPlayerCloneSystem(): void {
  kickerClone = createCloneEntity('clone-kicker', KICKER_SPAWN)
  gkClone     = createCloneEntity('clone-goalkeeper', GK_SPAWN)

  engine.addSystem((_dt: number) => {
    const s = clientSnapshot

    const isPvE       = s.mode === 'pve'
    const kickerIsRed = s.kickerIsRed === 1
    const humanIsRed  = s.pveHumanIsRed === 1

    const kickerAddr = kickerIsRed ? s.redAddr : s.blueAddr
    const gkAddr     = kickerIsRed ? s.blueAddr : s.redAddr

    const kickerIsAI = isPvE && (kickerIsRed !== humanIsRed)
    const gkIsAI     = isPvE && (kickerIsRed === humanIsRed)

    // ── Determine if each clone has a valid identity to render ───────────────
    const kickerHasIdentity = kickerIsAI || !!kickerAddr
    const gkHasIdentity     = gkIsAI     || !!gkAddr

    // ── Apply avatars as soon as identity is known (pre-loads in background) ─
    const kickerKey = kickerIsAI ? 'ai' : kickerAddr
    const gkKey     = gkIsAI     ? 'ai' : gkAddr

    if (kickerHasIdentity && kickerKey !== prevKickerKey) {
      if (kickerIsAI) { applyGenericAvatar(kickerClone, 'clone-kicker'); kickerHasWearables = true }
      else              kickerHasWearables = applyPlayerAvatar(kickerClone, kickerAddr)
      prevKickerKey = kickerKey
    } else if (kickerHasIdentity && !kickerHasWearables && !kickerIsAI) {
      kickerHasWearables = applyPlayerAvatar(kickerClone, kickerAddr)
    }

    if (gkHasIdentity && gkKey !== prevGkKey) {
      if (gkIsAI) { applyGenericAvatar(gkClone, 'clone-goalkeeper'); gkHasWearables = true }
      else          gkHasWearables = applyPlayerAvatar(gkClone, gkAddr)
      prevGkKey = gkKey
    } else if (gkHasIdentity && !gkHasWearables && !gkIsAI) {
      gkHasWearables = applyPlayerAvatar(gkClone, gkAddr)
    }

    // ── Show clones whenever their identity is known (not just active match) ─
    // This positions them at the spawn point so DCL renders & pre-loads them
    // during WaitingOpponent / SelectingDirections, well before the match starts.
    if (kickerHasIdentity !== kickerVisible) {
      setVisible(kickerClone, kickerHasIdentity)
      kickerVisible = kickerHasIdentity
      if (!kickerHasIdentity) { prevKickerKey = ''; kickerHasWearables = false }
    }

    if (gkHasIdentity !== gkVisible) {
      setVisible(gkClone, gkHasIdentity)
      gkVisible = gkHasIdentity
      if (!gkHasIdentity) { prevGkKey = ''; gkHasWearables = false }
    }
  })
}
