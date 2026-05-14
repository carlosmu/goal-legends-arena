import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  Name,
  pointerEventsSystem,
  InputAction,
  PointerEventType,
  inputSystem,
  ColliderLayer,
  Entity
} from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { movePlayerTo } from '~system/RestrictedActions'
import { getPlayer } from '@dcl/sdk/src/players'
import { room } from '../shared/messages'
import { AIM_COLLIDERS, SPOT_PROXIMITY_RADIUS } from '../shared/constants'
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
  const fire = () => tryOccupySpot(team)
  pointerEventsSystem.onPointerDown({ entity, opts: { button: InputAction.IA_POINTER, hoverText: hover } }, fire)
  pointerEventsSystem.onPointerDown({ entity, opts: { button: InputAction.IA_PRIMARY, hoverText: hover } }, fire)
}

function findEntityByName(target: string): Entity | undefined {
  for (const [e, nm] of engine.getEntitiesWith(Name)) {
    if (nm.value === target) return e
  }
  return undefined
}

export function initClient() {
  initAudioManager()
  initAnimationManager()

  const blue = findEntityByName('Blue_Spot')
  const red = findEntityByName('Red_Spot')
  registerSpotPointerHandlers(blue, 'blue', 'Take Blue Spot (click or E)')
  registerSpotPointerHandlers(red, 'red', 'Take Red Spot (click or E)')

  const spotClaim = { insideBlue: false, insideRed: false }

  const dirs: Array<{ key: 'L' | 'C' | 'R'; pos: Vector3; scale: Vector3 }> = [
    { key: 'L', pos: AIM_COLLIDERS.L.pos, scale: AIM_COLLIDERS.L.scale },
    { key: 'C', pos: AIM_COLLIDERS.C.pos, scale: AIM_COLLIDERS.C.scale },
    { key: 'R', pos: AIM_COLLIDERS.R.pos, scale: AIM_COLLIDERS.R.scale }
  ]
  for (const { key, pos, scale } of dirs) {
    const e = engine.addEntity()
    Transform.create(e, { position: pos, scale })
    MeshRenderer.setBox(e)
    Material.setPbrMaterial(e, { albedoColor: Color4.create(0.2, 0.85, 0.35, 0.4) })
    MeshCollider.setBox(e, ColliderLayer.CL_POINTER)
    pointerEventsSystem.onPointerDown(
      { entity: e, opts: { button: InputAction.IA_POINTER, hoverText: `Shoot ${key}` } },
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

    if (isStateSyncronized() && getPlayer()?.userId && Transform.has(engine.PlayerEntity)) {
      const p = Transform.get(engine.PlayerEntity).position
      const near = (ent: Entity | undefined) => {
        if (!ent || !Transform.has(ent)) return false
        const t = Transform.get(ent).position
        return Vector3.distance(p, t) < SPOT_PROXIMITY_RADIUS
      }
      const nb = near(blue)
      if (nb && !spotClaim.insideBlue) tryOccupySpot('blue')
      spotClaim.insideBlue = nb
      const nr = near(red)
      if (nr && !spotClaim.insideRed) tryOccupySpot('red')
      spotClaim.insideRed = nr

      if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)) {
        if (nb && !nr) tryOccupySpot('blue')
        else if (nr && !nb) tryOccupySpot('red')
        else if (nb && nr && blue && red && Transform.has(blue) && Transform.has(red)) {
          const db = Vector3.distance(p, Transform.get(blue).position)
          const dr = Vector3.distance(p, Transform.get(red).position)
          tryOccupySpot(db <= dr ? 'blue' : 'red')
        }
      }
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
