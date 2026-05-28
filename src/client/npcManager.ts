import { engine, Transform, AvatarShape, Name, Entity } from '@dcl/sdk/ecs'

function isLiveEntity(entity: Entity): boolean {
  return Transform.has(entity)
}
import { Color3 } from '@dcl/sdk/math'
import { npcLoadReady, NPC_SPAWN_BATCH, NPC_SPAWN_INTERVAL_SEC } from './sceneLoadManager'

// ── Utilities ─────────────────────────────────────────────────────────────────

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Avatar pools ──────────────────────────────────────────────────────────────

const SKIN_COLORS: Color3[] = [
  Color3.create(0.957, 0.776, 0.741),
  Color3.create(0.565, 0.337, 0.169),
  Color3.create(0.769, 0.576, 0.384),
  Color3.create(0.91,  0.824, 0.698),
]

const HAIR_COLORS: Color3[] = [
  Color3.Black(),
  Color3.create(0.98,  0.745, 0.11),
  Color3.create(0.114, 0.522, 0.984),
  Color3.Red(),
  Color3.Gray(),
]

const EMOTES = ['clap', 'tik', 'handsair', 'fistpump', 'wave']

const URN = 'urn:decentraland:off-chain:base-avatars:'

const BODY_FEMALE = URN + 'BaseFemale'
const BODY_MALE   = URN + 'BaseMale'
const SUNGLASSES  = URN + 'black_sun_glasses'

const BEARDS = [
  URN + 'beard',
  URN + 'balbo_beard',
  URN + 'chin_beard',
]

const HAIR = [
  URN + 'keanu_hair',
  URN + 'cool_hair',
  URN + 'semi_afro',
  URN + 'hair_punk',
  URN + 'pony_tail',
  URN + 'rasta',
  URN + 'shoulder_hair',
  URN + 'double_bun',
  URN + 'hair_bun',
]

const UPPER_BODY = [
  URN + 'soccer_shirt',
  URN + 'sport_jacket',
  URN + 'f_sport_purple_tshirt',
  URN + 'blue_tshirt',
  URN + 'simple_blue_tshirt',
  URN + 'polobluetshirt',
  URN + 'f_blue_jacket',
  URN + 'red_tshirt',
  URN + 'f_red_simple_tshirt',
  URN + 'orangebasictshirt',
  URN + 'polocoloredtshirt',
  URN + 'safari_shirt',
  URN + 'm_sweater_02',
  URN + 'm_sweater',
  URN + 'black_top',
  URN + 'white_top',
  URN + 'f_simple_yellow_tshirt',
]

const LOWER_BODY = [
  URN + 'f_capris',
  URN + 'f_jeans',
  URN + 'hip_hop_joggers',
  URN + 'f_brown_trousers',
  URN + 'comfortablepants',
  URN + 'grey_joggers',
  URN + 'kilt',
  URN + 'safari_pants',
]

const SHOES = [
  URN + 'moccasin',
  URN + 'sneakers',
  URN + 'Espadrilles',
  URN + 'ruby_blue_loafer',
  URN + 'crocs',
  URN + 'pink_sleepers',
  URN + 'red_sandals',
  URN + 'm_mountainshoes.glb',
  URN + 'm_feet_soccershoes',
]

// ── Avatar creation ───────────────────────────────────────────────────────────

function buildWearables(isMale: boolean): string[] {
  const w = [pick(HAIR), pick(UPPER_BODY), pick(LOWER_BODY), pick(SHOES)]
  if (isMale && Math.random() < 0.5) w.push(pick(BEARDS))
  if (Math.random() < 0.3) w.push(SUNGLASSES)
  return w
}

type Vec3 = { x: number; y: number; z: number }
type Quat = { x: number; y: number; z: number; w: number }
type NPCEntry = { entity: Entity; emote: string }

const EMOTE_LOOP_INTERVAL = 4

function spawnNPC(index: number, pos: Vec3, rot: Quat): NPCEntry {
  const isMale = Math.random() < 0.5
  const entity = engine.addEntity()
  const emote  = pick(EMOTES)

  AvatarShape.create(entity, {
    id:                       `npc-${index}`,
    name:                     '',
    bodyShape:                isMale ? BODY_MALE : BODY_FEMALE,
    emotes:                   [],
    wearables:                buildWearables(isMale),
    skinColor:                pick(SKIN_COLORS),
    hairColor:                pick(HAIR_COLORS),
    expressionTriggerId:      emote,
    expressionTriggerTimestamp: Date.now(),
  })

  Transform.create(entity, { position: pos, rotation: rot })
  return { entity, emote }
}

// ── Spawn system ──────────────────────────────────────────────────────────────

function findNPCSpawnPoints(): Array<{ pos: Vec3; rot: Quat }> {
  const spawns: Array<{ pos: Vec3; rot: Quat }> = []
  for (const [entity, nm] of engine.getEntitiesWith(Name)) {
    if (!nm.value.startsWith('NPC_')) continue
    if (!Transform.has(entity)) continue
    const { position, rotation } = Transform.get(entity)
    spawns.push({
      pos: { x: position.x, y: position.y, z: position.z },
      rot: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    })
  }
  return spawns
}

let _spawnQueue: Array<{ pos: Vec3; rot: Quat }> = []
let _spawnIndex = 0
let _spawnTimer = 0
let _spawnQueueBuilt = false
let _npcs: NPCEntry[] = []
let _loopTimer = 0
let _systemRegistered = false

export function resetNpcManager(): void {
  for (const { entity } of _npcs) {
    if (isLiveEntity(entity)) engine.removeEntity(entity)
  }
  _npcs = []
  _spawnQueue = []
  _spawnIndex = 0
  _spawnTimer = 0
  _spawnQueueBuilt = false
  _loopTimer = 0
}

function npcSystem(dt: number): void {
    if (!_spawnQueueBuilt) {
      if (!npcLoadReady()) return
      _spawnQueue = findNPCSpawnPoints()
      _spawnQueueBuilt = true
      _spawnIndex = 0
      console.log(`[NPC] Found ${_spawnQueue.length} spawn points`)
      if (_spawnQueue.length === 0) return
    }

    if (_spawnIndex < _spawnQueue.length) {
      _spawnTimer += dt
      if (_spawnTimer < NPC_SPAWN_INTERVAL_SEC) return
      _spawnTimer = 0
      const end = Math.min(_spawnIndex + NPC_SPAWN_BATCH, _spawnQueue.length)
      for (let i = _spawnIndex; i < end; i++) {
        const s = _spawnQueue[i]
        _npcs.push(spawnNPC(i, s.pos, s.rot))
      }
      _spawnIndex = end
      if (_spawnIndex >= _spawnQueue.length) {
        console.log(`[NPC] Spawned ${_npcs.length} avatars (staggered)`)
      }
      return
    }

    if (_npcs.length === 0) return
    _loopTimer += dt
    if (_loopTimer < EMOTE_LOOP_INTERVAL) return
    _loopTimer = 0

    for (const { entity, emote } of _npcs) {
      if (!AvatarShape.has(entity)) continue
      const shape = AvatarShape.getMutable(entity)
      shape.expressionTriggerId       = emote
      shape.expressionTriggerTimestamp = Date.now()
    }
}

export function initNPCSystem(): void {
  resetNpcManager()
  if (_systemRegistered) return
  _systemRegistered = true
  engine.addSystem(npcSystem)
}
