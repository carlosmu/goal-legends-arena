import { Vector3 } from '@dcl/sdk/math'

export const AUDIO = {
  crowd: 'assets/audio/crowd.mp3',
  whistle: 'assets/audio/whistle.mp3',
  point: 'assets/audio/point.mp3',
  fail: 'assets/audio/fail.mp3',
  winner: 'assets/audio/winner.mp3'
} as const

export const WAIT_OPPONENT_MS = 30_000
export const ROUND_RESULT_MS = 4500
export const MATCH_END_UI_MS = 6500
export const BAN_COOLDOWN_MS = 120_000
/** Regulation: 5 kicks per player as kicker = 10 alternating shots. */
export const REGULATION_SHOTS = 10

/** Fallback stand position if POV entity is missing (scene center-ish, elevated). */
export const STANDS_FALLBACK = {
  pos: Vector3.create(16, 8, 8),
  cam: Vector3.create(16, 1, 16)
}

/**
 * Direction helper colliders near the goal (scene space).
 * Sit Spots están a z≈23.3 y el POV/portería a z≈16, así que “adelante” (hacia la portería)
 * es Z decreciente.
 */
export const AIM_COLLIDERS = {
  L: { pos: Vector3.create(17.3, 1.3, 10.5), scale: Vector3.create(1.2, 2, 0.1) },
  C: { pos: Vector3.create(16, 1.3, 10.5), scale: Vector3.create(1.2, 2, 0.1) },
  R: { pos: Vector3.create(14.7, 1.3, 10.5), scale: Vector3.create(1.2, 2, 0.1) }
} as const

/** Máx. distancia (m) jugador → hit para `pointerEventsSystem` (clic en spots y bloques L/C/R). */
export const POINTER_EVENT_MAX_DISTANCE = 20

export const SYNC_STATE_ENTITY_ENUM = 9001

/** Distancia al centro del spot para contar como “ocupado” (Sit Spot puede no disparar pointer del juego). */
export const SPOT_PROXIMITY_RADIUS = 2.8
