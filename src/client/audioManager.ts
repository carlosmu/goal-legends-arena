import { engine, executeTask, AudioSource, Transform } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { AUDIO } from '../shared/constants'
import { GameState } from '../shared/gameState'
import type { ClientSnapshot } from './gameStore'
import { readPenaltySnapshot } from './gameStore'

let crowdEntity: ReturnType<typeof engine.addEntity> | null = null
let sfxEntity: ReturnType<typeof engine.addEntity> | null = null

let prevPhase = ''
let crowdFollowRegistered = false

/**
 * AudioSource es 3D/espacial: si el clip está fijo en el centro del campo y el
 * jugador spawnea lejos (p. ej. portería), el volumen cae mucho y parece “mudo”.
 * Seguimos la posición del PlayerEntity para que el ambiente se oiga estable.
 */
function registerCrowdFollowPlayer() {
  if (crowdFollowRegistered) return
  crowdFollowRegistered = true
  engine.addSystem(() => {
    if (!Transform.has(engine.PlayerEntity)) return
    const p = Transform.get(engine.PlayerEntity).position
    const pos = Vector3.create(p.x, p.y, p.z)
    if (crowdEntity !== null && Transform.has(crowdEntity)) {
      Transform.getMutable(crowdEntity).position = pos
    }
    if (sfxEntity !== null && Transform.has(sfxEntity)) {
      Transform.getMutable(sfxEntity).position = pos
    }
  })
}

export function initAudioManager() {
  if (crowdEntity !== null) return
  crowdEntity = engine.addEntity()
  Transform.create(crowdEntity, { position: Vector3.create(16, 2, 16) })
  AudioSource.create(crowdEntity, {
    audioClipUrl: AUDIO.crowd,
    playing: true,
    loop: true,
    volume: 0.65
  })
  registerCrowdFollowPlayer()

  // Algunos runtimes arrancan mejor el loop si se re-dispara tras un tick.
  executeTask(async () => {
    await new Promise<void>((r) => setTimeout(r, 300))
    if (!crowdEntity || !AudioSource.has(crowdEntity)) return
    const a = AudioSource.getMutable(crowdEntity)
    a.playing = false
    a.playing = true
  })

  sfxEntity = engine.addEntity()
  Transform.create(sfxEntity, { position: Vector3.create(16, 2, 16) })
  AudioSource.create(sfxEntity, {
    audioClipUrl: AUDIO.whistle,
    playing: false,
    loop: false,
    volume: 0.9
  })
}

function playOneShot(clip: string) {
  if (!sfxEntity) return
  const a = AudioSource.getMutable(sfxEntity)
  a.audioClipUrl = clip
  a.playing = false
  a.playing = true
}

export function tickAudioManager(s: ClientSnapshot) {
  const ph = s.phase
  if (prevPhase !== GameState.ResolvingRound && ph === GameState.ResolvingRound) {
    playOneShot(AUDIO.whistle)
    executeTask(async () => {
      await new Promise<void>((r) => setTimeout(r, 650))
      const cur = readPenaltySnapshot()
      if (cur.lastRoundWasGoal === 1) playOneShot(AUDIO.point)
      else playOneShot(AUDIO.fail)
    })
  }
  if (prevPhase !== GameState.MatchEnd && ph === GameState.MatchEnd) {
    playOneShot(s.winnerSide ? AUDIO.winner : AUDIO.abandoned)
  }
  prevPhase = ph
}
