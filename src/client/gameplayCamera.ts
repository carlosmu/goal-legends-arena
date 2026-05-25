import { engine, Transform, Entity, MainCamera, VirtualCamera, Name } from '@dcl/sdk/ecs'
import { clientSnapshot } from './gameStore'

// ── State ──────────────────────────────────────────────────────────────────────

let pivotEntity:  Entity | null = null
let cameraEntity: Entity | null = null
let cameraActive  = false

// ── Helpers ────────────────────────────────────────────────────────────────────

function findPivot(): Entity | null {
  for (const [e, nm] of engine.getEntitiesWith(Name)) {
    if (nm.value === 'Cinematic_Camera_Pivot') return e
  }
  return null
}

function createCamera(pivot: Entity): Entity {
  const e = engine.addEntity()

  // 6 m on local +X from pivot; lookAtEntity keeps it aimed at the pivot
  Transform.create(e, {
    position: { x: 6, y: 2, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    parent:   pivot,
  })

  VirtualCamera.create(e, {
    lookAtEntity:      pivot as unknown as number,
    defaultTransition: { transitionMode: { $case: 'time', time: 0.5 } },
  })

  return e
}

function activateCamera() {
  if (!cameraEntity || cameraActive) return
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cameraEntity as unknown as number })
  cameraActive = true
}

function deactivateCamera() {
  if (!cameraActive) return
  MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: undefined })
  cameraActive = false
}

// ── System ─────────────────────────────────────────────────────────────────────

export function initGameplayCamera(): void {
  engine.addSystem((_dt: number) => {
    // Discover pivot from Creator Hub as soon as it's available
    if (!pivotEntity) {
      pivotEntity = findPivot()
      if (pivotEntity) cameraEntity = createCamera(pivotEntity)
    }

    if (!cameraEntity) return

    if (clientSnapshot.hasActiveMatch === 1) {
      activateCamera()
    } else {
      deactivateCamera()
    }
  })
}
