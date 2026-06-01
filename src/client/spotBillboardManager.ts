import {
  engine,
  Entity,
  Transform,
  MeshRenderer,
  Material,
  Billboard,
  BillboardMode,
  VisibilityComponent,
  MaterialTransparencyMode
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { UI_ATLAS_SRC, spotBillboardPlaneUvs } from './uiAtlasStore'
import type { ClientSnapshot } from './gameStore'

const HEIGHT_ABOVE_SPOT_M = 3
const BOB_RANGE_M = 0.3
/** A4 = 1×1 cell → cuadrado (m). */
const PLANE_SIZE_M = 0.5
const BOB_HALF_CYCLE_MS = 1500

let redSpot: Entity | null = null
let blueSpot: Entity | null = null
let redBillboard: Entity | null = null
let blueBillboard: Entity | null = null

function spotBillboardVisible(team: 'red' | 'blue', s: ClientSnapshot): boolean {
  if (s.hasActiveMatch === 1) return false
  if (team === 'red' && s.redAddr) return false
  if (team === 'blue' && s.blueAddr) return false
  return true
}

function bobOffsetY(): number {
  return ((1 - Math.cos((Date.now() * Math.PI) / BOB_HALF_CYCLE_MS)) / 2) * BOB_RANGE_M
}

function syncBillboardToSpot(billboard: Entity, spot: Entity): void {
  if (!Transform.has(spot) || !Transform.has(billboard)) return
  const spotPos = Transform.get(spot).position
  const t = Transform.getMutable(billboard)
  t.position = Vector3.create(
    spotPos.x,
    spotPos.y + HEIGHT_ABOVE_SPOT_M - bobOffsetY(),
    spotPos.z
  )
}

function createSpotBillboard(spot: Entity): Entity {
  const spotPos = Transform.has(spot) ? Transform.get(spot).position : Vector3.Zero()
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(spotPos.x, spotPos.y + HEIGHT_ABOVE_SPOT_M, spotPos.z),
    rotation: Quaternion.fromEulerDegrees(90, 0, 0),
    scale: Vector3.create(PLANE_SIZE_M, PLANE_SIZE_M * 1.5, 1)
  })
  MeshRenderer.setPlane(e, spotBillboardPlaneUvs())
  const atlasTex = Material.Texture.Common({ src: UI_ATLAS_SRC })
  Material.setPbrMaterial(e, {
    albedoColor: Color4.White(),
    texture: atlasTex,
    emissiveTexture: atlasTex,
    emissiveColor: Color3.White(),
    emissiveIntensity: 1,
    metallic: 0,
    roughness: 1,
    transparencyMode: MaterialTransparencyMode.MTM_ALPHA_BLEND
  })
  Billboard.create(e, { billboardMode: BillboardMode.BM_Y })
  VisibilityComponent.create(e, { visible: true })
  return e
}

export function initSpotBillboardManager(red: Entity | undefined, blue: Entity | undefined): void {
  redSpot = red ?? null
  blueSpot = blue ?? null
  if (redSpot) redBillboard = createSpotBillboard(redSpot)
  if (blueSpot) blueBillboard = createSpotBillboard(blueSpot)
}

export function resetSpotBillboardManager(): void {
  if (redBillboard) {
    engine.removeEntity(redBillboard)
    redBillboard = null
  }
  if (blueBillboard) {
    engine.removeEntity(blueBillboard)
    blueBillboard = null
  }
  redSpot = null
  blueSpot = null
}

export function tickSpotBillboardManager(s: ClientSnapshot): void {
  if (redBillboard && redSpot) {
    syncBillboardToSpot(redBillboard, redSpot)
    VisibilityComponent.createOrReplace(redBillboard, { visible: spotBillboardVisible('red', s) })
  }
  if (blueBillboard && blueSpot) {
    syncBillboardToSpot(blueBillboard, blueSpot)
    VisibilityComponent.createOrReplace(blueBillboard, { visible: spotBillboardVisible('blue', s) })
  }
}
