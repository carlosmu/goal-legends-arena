import { engine, Entity, GltfContainer, Name, Transform, VisibilityComponent } from '@dcl/sdk/ecs'
import { EntityNames } from '../../assets/scene/entity-names'
import { initAudioManager } from './audioManager'

/** Load tier: lower = earlier. Tier 1 (arena) stays visible from composite. */
const TIER_ARENA = 1
const TIER_CORE = 2
const TIER_AMBIENT = 3
const TIER_DECOR = 4

const TIER_DELAY_SEC: Record<number, number> = {
  [TIER_CORE]: 0.8,
  [TIER_AMBIENT]: 2.0,
  [TIER_DECOR]: 3.5
}

/** NPC avatars spawn after core scene GLBs (spots, etc.). */
export const NPC_LOAD_DELAY_SEC = 1.2
export const NPC_SPAWN_BATCH = 2
export const NPC_SPAWN_INTERVAL_SEC = 0.45

type DeferredEntity = {
  entity: Entity
  tier: number
}

const deferredVisible: DeferredEntity[] = []
const hiddenByName: Entity[] = []

let bootstrapped = false
let bootstrapPending = true
let elapsedSec = 0
let audioStarted = false
let systemRegistered = false

function isLiveEntity(entity: Entity): boolean {
  return Transform.has(entity)
}

function tierForGltfSrc(src: string): number {
  if (src.includes('futbol_arena.glb')) return TIER_ARENA
  if (
    src.includes('stadium_flags.glb') ||
    src.includes('blue_spot.glb') ||
    src.includes('red_spot.glb') ||
    src.includes('ball.glb') ||
    src.includes('invisible_box.glb') ||
    src.includes('avatar_training.glb')
  ) {
    return TIER_CORE
  }
  if (src.includes('spotlight.glb')) return TIER_AMBIENT
  if (src.includes('avatar_placeholder.glb') || src.includes('admin_toolkit.glb') || src.includes('sitting_pose')) {
    return TIER_DECOR
  }
  return TIER_AMBIENT
}

function shouldHideInitially(name: string): boolean {
  return (
    name === EntityNames.Video_Screen ||
    name === EntityNames.Fireworks ||
    name === EntityNames.Spot_Lights ||
    name.startsWith('Firework_') ||
    name.startsWith('Spotlight') ||
    name === EntityNames.Spot_Rotation_1 ||
    name === EntityNames.Spot_Rotation_2 ||
    name === EntityNames.Spot_Rotation_3 ||
    name === EntityNames.Spot_Rotation_4
  )
}

function hideEntity(entity: Entity): void {
  if (!isLiveEntity(entity)) return
  VisibilityComponent.createOrReplace(entity, { visible: false })
}

function showEntity(entity: Entity): void {
  if (!isLiveEntity(entity)) return
  VisibilityComponent.createOrReplace(entity, { visible: true })
}

function sceneReadyForBootstrap(): boolean {
  for (const [entity] of engine.getEntitiesWith(GltfContainer)) {
    if (!isLiveEntity(entity)) continue
    if (GltfContainer.get(entity).src.includes('futbol_arena.glb')) return true
  }
  return false
}

function bootstrapDeferredLoad(): void {
  const toDefer: DeferredEntity[] = []
  for (const [entity] of engine.getEntitiesWith(GltfContainer)) {
    if (!isLiveEntity(entity)) continue
    const tier = tierForGltfSrc(GltfContainer.get(entity).src)
    if (tier === TIER_ARENA) continue
    hideEntity(entity)
    toDefer.push({ entity, tier })
  }
  deferredVisible.push(...toDefer)

  for (const [entity, nm] of engine.getEntitiesWith(Name)) {
    if (!shouldHideInitially(nm.value)) continue
    hideEntity(entity)
    hiddenByName.push(entity)
  }

  console.log(
    `[Load] Splash/UI first — arena visible — deferred visibility for ${deferredVisible.length} GLBs, hidden ${hiddenByName.length} entities`
  )
}

function restoreDeferredVisible(): void {
  for (let i = deferredVisible.length - 1; i >= 0; i--) {
    const item = deferredVisible[i]
    if (!isLiveEntity(item.entity)) {
      deferredVisible.splice(i, 1)
      continue
    }
    if (elapsedSec < TIER_DELAY_SEC[item.tier]) continue
    showEntity(item.entity)
    deferredVisible.splice(i, 1)
  }
}

function revealHiddenAmbient(): void {
  if (elapsedSec < TIER_DELAY_SEC[TIER_AMBIENT]) return
  for (let i = hiddenByName.length - 1; i >= 0; i--) {
    const entity = hiddenByName[i]
    if (!isLiveEntity(entity)) {
      hiddenByName.splice(i, 1)
      continue
    }
    showEntity(entity)
    hiddenByName.splice(i, 1)
  }
}

function maybeStartAmbientAudio(): void {
  if (audioStarted || elapsedSec < TIER_DELAY_SEC[TIER_AMBIENT]) return
  audioStarted = true
  initAudioManager()
}

/** True when decor tier started and NPC batching can begin. */
export function npcLoadReady(): boolean {
  return bootstrapped && elapsedSec >= NPC_LOAD_DELAY_SEC
}

export function resetSceneLoadManager(): void {
  deferredVisible.length = 0
  hiddenByName.length = 0
  bootstrapped = false
  bootstrapPending = true
  elapsedSec = 0
  audioStarted = false
}

function sceneLoadSystem(dt: number): void {
  if (bootstrapPending) {
    if (!sceneReadyForBootstrap()) return
    bootstrapPending = false
    bootstrapped = true
    bootstrapDeferredLoad()
  }
  elapsedSec += dt
  restoreDeferredVisible()
  revealHiddenAmbient()
  maybeStartAmbientAudio()
}

export function initSceneLoadManager(): void {
  resetSceneLoadManager()
  if (systemRegistered) return
  systemRegistered = true
  engine.addSystem(sceneLoadSystem)
}
