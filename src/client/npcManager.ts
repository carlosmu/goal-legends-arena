import { engine, Transform, AvatarShape, Name, Entity } from '@dcl/sdk/ecs'
import { Color3 } from '@dcl/sdk/math'

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
// const EMOTES = ['disco', 'tektonik', 'tik', 'robot', 'hammer', 'idle']

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
  // sporty / football
  URN + 'soccer_shirt',           // M  - jersey de fútbol
  URN + 'sport_jacket',           // M  - campera deportiva
  URN + 'f_sport_purple_tshirt',  // F  - remera deporte violeta
  // azul
  URN + 'blue_tshirt',            // M
  URN + 'simple_blue_tshirt',     // F
  URN + 'polobluetshirt',         // unisex
  URN + 'f_blue_jacket',          // F  - campera azul
  // rojo
  URN + 'red_tshirt',             // M
  URN + 'f_red_simple_tshirt',    // F
  // naranja
  URN + 'orangebasictshirt',      // unisex
  // multicolor
  URN + 'polocoloredtshirt',      // unisex
  // neutros
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

const EMOTE_LOOP_INTERVAL = 4 // seconds — adjust to match longest emote duration

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

let _counter = 0
let _done    = false
let _npcs: NPCEntry[] = []
let _loopTimer = 0

export function initNPCSystem(): void {
  engine.addSystem((dt: number) => {
    if (!_done) {
      if (++_counter < 100) return
      _done  = true
      const spawns = findNPCSpawnPoints()
      _npcs  = spawns.map((s, i) => spawnNPC(i, s.pos, s.rot))
      console.log(`[NPC] Spawned ${_npcs.length} avatars`)
      return
    }

    if (_npcs.length === 0) return
    _loopTimer += dt
    if (_loopTimer < EMOTE_LOOP_INTERVAL) return
    _loopTimer = 0

    for (const { entity, emote } of _npcs) {
      const shape = AvatarShape.getMutable(entity)
      shape.expressionTriggerId       = emote
      shape.expressionTriggerTimestamp = Date.now()
    }
  })
}
