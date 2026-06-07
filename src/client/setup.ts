import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  Name,
  PlayerIdentityData,
  pointerEventsSystem,
  InputAction,
  ColliderLayer,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { movePlayerTo } from '~system/RestrictedActions'
import { room } from '../shared/messages'
import { AIM_COLLIDERS, POINTER_EVENT_MAX_DISTANCE } from '../shared/constants'
import { getLeaderboardRows } from './leaderboardManager'
import { prefetchLeaderboardFaces } from './leaderboardProfileCache'
import { readPenaltySnapshot, penaltyStateEntityReady } from './gameStore'
import { tickAudioManager } from './audioManager'
import { initAnimationManager, tickAnimationManager } from './animationManager'
import { tickFireworkManager } from './fireworkManager'
import { initSpotBillboardManager, tickSpotBillboardManager } from './spotBillboardManager'
import { markSpotClickedLocally, registerTakeSpotHandler } from './uiManager'

let syncedPinged = false
let loggedSyncReady = false

let redSpotEntity: Entity | undefined
let blueSpotEntity: Entity | undefined

/** movePlayerTo places the avatar's feet at the target; lift slightly so it sits on the spot. */
const SPOT_STAND_Y_OFFSET = 0.5

function localPlayerAddr(): string {
  if (!PlayerIdentityData.has(engine.PlayerEntity)) return ''
  return PlayerIdentityData.get(engine.PlayerEntity).address.toLowerCase()
}

/** While the local player is already in an active match, spots aren't selectable
 *  (clicking one would teleport them out of their kicker/keeper spot and camera view). */
function localIsInActiveMatch(): boolean {
  const s = readPenaltySnapshot()
  if (s.hasActiveMatch !== 1) return false
  const me = localPlayerAddr()
  if (!me) return false
  return me === s.redAddr.toLowerCase() || me === s.blueAddr.toLowerCase()
}

function tryOccupySpot(team: 'red' | 'blue') {
  if (!isStateSyncronized()) return
  markSpotClickedLocally()
  room.send('occupySpot', { team })
}

/** Walk the local player onto a spot entity (feet lifted by SPOT_STAND_Y_OFFSET). */
function movePlayerToSpot(entity: Entity) {
  if (!Transform.has(entity)) return
  const p = Transform.get(entity).position
  void movePlayerTo({ newRelativePosition: Vector3.create(p.x, p.y + SPOT_STAND_Y_OFFSET, p.z) })
}

/** Take a spot from a UI button (e.g. "Face the winner"): claim it and walk the player onto it. */
export function takeSpotFromUI(team: 'red' | 'blue') {
  tryOccupySpot(team)
  const entity = team === 'red' ? redSpotEntity : blueSpotEntity
  if (entity) movePlayerToSpot(entity)
}

function registerSpotPointerHandlers(entity: Entity | undefined, team: 'red' | 'blue', hover: string) {
  if (!entity) return
  pointerEventsSystem.onPointerDown(
    { entity, opts: { button: InputAction.IA_POINTER, hoverText: hover, maxDistance: POINTER_EVENT_MAX_DISTANCE } },
    () => {
      if (localIsInActiveMatch()) return
      tryOccupySpot(team)
      movePlayerToSpot(entity)
    }
  )
}

function findEntityByName(target: string): Entity | undefined {
  for (const [e, nm] of engine.getEntitiesWith(Name)) {
    if (nm.value === target) return e
  }
  return undefined
}

let lastLeaderboardJson = ''

export function initClient() {
  initAnimationManager()

  const blue = findEntityByName('Blue_Spot')
  const red = findEntityByName('Red_Spot')
  blueSpotEntity = blue
  redSpotEntity = red
  registerTakeSpotHandler(takeSpotFromUI)
  registerSpotPointerHandlers(blue, 'blue', '')
  registerSpotPointerHandlers(red, 'red', '')
  initSpotBillboardManager(red, blue)

  const dirs: Array<{ key: 'L' | 'C' | 'R'; pos: Vector3; scale: Vector3 }> = [
    { key: 'L', pos: AIM_COLLIDERS.L.pos, scale: AIM_COLLIDERS.L.scale },
    { key: 'C', pos: AIM_COLLIDERS.C.pos, scale: AIM_COLLIDERS.C.scale },
    { key: 'R', pos: AIM_COLLIDERS.R.pos, scale: AIM_COLLIDERS.R.scale }
  ]
  for (const { key, pos } of dirs) {
    const e = engine.addEntity()
    Transform.create(e, { position: pos, scale: Vector3.Zero() })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, { albedoColor: Color4.create(0.2, 0.85, 0, 0.6) })
    MeshCollider.setBox(e, ColliderLayer.CL_POINTER)
    pointerEventsSystem.onPointerDown(
      {
        entity: e,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: `Shoot ${key}`,
          maxDistance: POINTER_EVENT_MAX_DISTANCE
        }
      },
      () => {
        room.send('submitDirection', { dir: key })
      }
    )
  }

  room.onMessage('teleport', async (data) => {
    await movePlayerTo({
      newRelativePosition: Vector3.create(data.x, data.y, data.z),
      cameraTarget: Vector3.create(data.cx, data.cy, data.cz)
    })
  })

  engine.addSystem(() => {
    const s = readPenaltySnapshot()
    const lj = s.leaderboardJson
    if (lj !== lastLeaderboardJson) {
      lastLeaderboardJson = lj
      prefetchLeaderboardFaces(getLeaderboardRows(lj, 5).map((r) => r.addr))
    }

    tickAudioManager(s)
    tickAnimationManager(s)
    tickFireworkManager(s.phase)
    tickSpotBillboardManager(s)
    if (!syncedPinged && isStateSyncronized()) {
      syncedPinged = true
      room.send('clientReadyPing', {})
    }

    if (!loggedSyncReady && isStateSyncronized()) {
      loggedSyncReady = true
      readPenaltySnapshot()
      console.log(
        '[GLA Client] sync listo — componente de partida en cliente:',
        penaltyStateEntityReady(),
        'fase:',
        readPenaltySnapshot().phase
      )
    }
  })
}
