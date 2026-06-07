import { engine, AudioSource, Transform } from '@dcl/sdk/ecs'
import * as utils from '@dcl-sdk/utils'
import { Vector3 } from '@dcl/sdk/math'
import { AUDIO } from '../shared/constants'
import { GameState } from '../shared/gameState'
import type { ClientSnapshot } from './gameStore'

let crowdEntity: ReturnType<typeof engine.addEntity> | null = null
let sfxEntity: ReturnType<typeof engine.addEntity> | null = null

let prevPhase = ''
let resultSoundPlayed = false

export function resetAudioManager(): void {
  if (crowdEntity !== null && Transform.has(crowdEntity)) {
    engine.removeEntity(crowdEntity)
  }
  crowdEntity = null
  if (sfxEntity !== null && Transform.has(sfxEntity)) {
    engine.removeEntity(sfxEntity)
  }
  sfxEntity = null
  prevPhase = ''
  resultSoundPlayed = false
}

export function initAudioManager() {
  if (crowdEntity !== null && AudioSource.has(crowdEntity)) return
  crowdEntity = engine.addEntity()
  Transform.create(crowdEntity, { position: Vector3.create(16, 2, 16) })
  AudioSource.create(crowdEntity, {
    audioClipUrl: AUDIO.crowd,
    playing: true,
    loop: true,
    volume: 0.65,
    // Non-spatial: constant volume, no L/R panning regardless of camera position.
    global: true
  })

  // Algunos runtimes arrancan mejor el loop si se re-dispara tras un tick.
  utils.timers.setTimeout(() => {
    if (!crowdEntity || !AudioSource.has(crowdEntity)) return
    const a = AudioSource.getMutable(crowdEntity)
    a.playing = false
    a.playing = true
  }, 300)

  sfxEntity = engine.addEntity()
  Transform.create(sfxEntity, { position: Vector3.create(16, 2, 16) })
  AudioSource.create(sfxEntity, {
    audioClipUrl: AUDIO.whistle,
    playing: false,
    loop: false,
    volume: 0.9,
    // Non-spatial: centered feedback SFX (whistle/goal/save/winner), equal in both ears.
    global: true
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
    resultSoundPlayed = false
  }
  // The server fills resultLine only when the goal/save is revealed (~GOAL_REVEAL_MS
  // into the animation); play the result SFX exactly then so it matches the visuals.
  if (ph === GameState.ResolvingRound && !resultSoundPlayed && !!s.resultLine) {
    resultSoundPlayed = true
    playOneShot(s.lastRoundWasGoal === 1 ? AUDIO.point : AUDIO.fail)
  }
  if (prevPhase !== GameState.MatchEnd && ph === GameState.MatchEnd) {
    playOneShot(s.winnerSide ? AUDIO.winner : AUDIO.abandoned)
  }
  prevPhase = ph
}
