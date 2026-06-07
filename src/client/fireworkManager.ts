import { engine, Name, ParticleSystem, PBParticleSystem_BlendMode, Entity } from '@dcl/sdk/ecs'
import { Color4 } from '@dcl/sdk/math'
import * as utils from '@dcl-sdk/utils'
import { GameState } from '../shared/gameState'

let prevPhase = ''
let fireworkEntities: Entity[] = []
/** Small delay between each firework so they cascade instead of firing all at once. */
const FIREWORK_STAGGER_MS = 250
/** Bumped on every (de)activation so stale staggered timers don't fire late. */
let activationToken = 0

function findFireworks(): void {
  fireworkEntities = []
  for (const [e, nm] of engine.getEntitiesWith(Name)) {
    if (nm.value.startsWith('Firework_')) fireworkEntities.push(e)
  }
}

function fireworkParticleConfig() {
  return {
    active: true,
    loop: true,
    prewarm: false,
    faceTravelDirection: false,
    rate: 0,
    lifetime: 2.5,
    maxParticles: 300,
    gravity: 1,
    blendMode: PBParticleSystem_BlendMode.PSB_ADD,
    shape: ParticleSystem.Shape.Point(),
    initialVelocitySpeed: { start: 5, end: 6 },
    initialSize: { start: 0.08, end: 0.18 },
    sizeOverTime: { start: 1, end: 0 },
    initialColor: {
      start: Color4.create(1.000, 0.900, 0.400, 1.000),
      end:   Color4.create(1.000, 0.400, 0.100, 1.000),
    },
    colorOverTime: {
      start: Color4.create(1.000, 0.800, 0.500, 1.000),
      end:   Color4.create(0.800, 0.200, 0.000, 0.000),
    },
    bursts: {
      values: [
        { time: 0,   count: 40, cycles: 2, interval: 0.15, probability: 1   },
        { time: 0.5, count: 60, cycles: 1, interval: 0.01, probability: 0.8 },
        { time: 1.2, count: 30, cycles: 3, interval: 0.1,  probability: 0.9 },
      ],
    },
  }
}

function activateFireworks(): void {
  const token = ++activationToken
  fireworkEntities.forEach((e, i) => {
    utils.timers.setTimeout(() => {
      if (token !== activationToken) return // canceled by a later (de)activation
      ParticleSystem.createOrReplace(e, fireworkParticleConfig())
    }, i * FIREWORK_STAGGER_MS)
  })
}

function deactivateFireworks(): void {
  activationToken++ // cancel any pending staggered activations
  for (const e of fireworkEntities) {
    if (ParticleSystem.has(e)) ParticleSystem.deleteFrom(e)
  }
}

export function tickFireworkManager(phase: string): void {
  // Lazy discovery: keep trying until at least one Firework_ entity is found
  if (fireworkEntities.length === 0) findFireworks()

  if (prevPhase !== GameState.MatchEnd && phase === GameState.MatchEnd) {
    activateFireworks()
  } else if (prevPhase === GameState.MatchEnd && phase !== GameState.MatchEnd) {
    deactivateFireworks()
  }

  prevPhase = phase
}
