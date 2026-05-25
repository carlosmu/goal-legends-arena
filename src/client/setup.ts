import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  Name,
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
import { initAudioManager, tickAudioManager } from './audioManager'
import { initAnimationManager, tickAnimationManager } from './animationManager'

let syncedPinged = false
let loggedSyncReady = false

function tryOccupySpot(team: 'red' | 'blue') {
  if (!isStateSyncronized()) return
  room.send('occupySpot', { team })
}

function registerSpotPointerHandlers(entity: Entity | undefined, team: 'red' | 'blue', hover: string) {
  if (!entity) return
  pointerEventsSystem.onPointerDown(
    { entity, opts: { button: InputAction.IA_POINTER, hoverText: hover, maxDistance: POINTER_EVENT_MAX_DISTANCE } },
    () => {
      tryOccupySpot(team)
      if (Transform.has(entity)) {
        const pos = Transform.get(entity).position
        void movePlayerTo({ newRelativePosition: pos })
      }
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
  initAudioManager()
  initAnimationManager()

  const blue = findEntityByName('Blue_Spot')
  const red = findEntityByName('Red_Spot')
  registerSpotPointerHandlers(blue, 'blue', '')
  registerSpotPointerHandlers(red, 'red', '')

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
    tickAnimationManager(s.phase)
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
