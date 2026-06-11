import { engine, AudioSource, Transform, Entity } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import * as utils from '@dcl-sdk/utils'

/**
 * Lightweight audio helper used by the Portal class. Each `playSingleSound` spawns a throwaway
 * entity carrying an AudioSource; one-shots are auto-removed after they finish, looping sounds
 * are kept until the caller stops them with `stopSound`.
 */

/** Decibels-full-scale → linear gain (0 dBFS = 1.0). Matches the volume convention portals use. */
export function dBfsToLinear(dbfs: number): number {
  return Math.pow(10, dbfs / 20)
}

export type PlaySingleSoundOptions = {
  audioClipUrl: string
  volume?: number
  loop?: boolean
  position?: { x: number; y: number; z: number }
}

/** Fallback removal time for non-looping clips (door SFX are short). */
const ONE_SHOT_CLEANUP_MS = 8000

class AudioPlayer {
  playSingleSound(opts: PlaySingleSoundOptions): Entity {
    const e = engine.addEntity()
    const p = opts.position
    Transform.create(e, { position: p ? Vector3.create(p.x, p.y, p.z) : Vector3.create(0, 0, 0) })
    AudioSource.create(e, {
      audioClipUrl: opts.audioClipUrl,
      playing: true,
      loop: opts.loop ?? false,
      volume: opts.volume ?? 1
    })

    if (!opts.loop) {
      utils.timers.setTimeout(() => {
        if (Transform.has(e)) engine.removeEntity(e)
      }, ONE_SHOT_CLEANUP_MS)
    }

    return e
  }

  stopSound(entity: Entity): void {
    if (AudioSource.has(entity)) AudioSource.getMutable(entity).playing = false
    if (Transform.has(entity)) engine.removeEntity(entity)
  }
}

export const audioPlayer = new AudioPlayer()
