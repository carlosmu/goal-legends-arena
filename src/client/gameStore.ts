import { engine, Entity } from '@dcl/sdk/ecs'
import { PenaltyMatchState } from '../shared/schemas'
import { GameState } from '../shared/gameState'

export type ClientSnapshot = {
  phase: string
  mode: string
  hasActiveMatch: number
  redName: string
  blueName: string
  redAddr: string
  blueAddr: string
  waitEndMs: number
  shotIndex: number
  kickerIsRed: number
  redScore: number
  blueScore: number
  resultLine: string
  lastRoundWasGoal: number
  winnerName: string
  spectatorWinnerName: string
  spectatorChallengeActive: number
  spectatorAcceptedAddr: string
  streakPromptAddr: string
  winnerStreakAddr: string
  leaderboardJson: string
  playersInScene: number
  suddenDeath: number
}

export const defaultSnapshot: ClientSnapshot = {
  phase: GameState.LobbyIdle,
  mode: 'none',
  hasActiveMatch: 0,
  redName: '',
  blueName: '',
  redAddr: '',
  blueAddr: '',
  waitEndMs: 0,
  shotIndex: 0,
  kickerIsRed: 1,
  redScore: 0,
  blueScore: 0,
  resultLine: '',
  lastRoundWasGoal: 0,
  winnerName: '',
  spectatorWinnerName: '',
  spectatorChallengeActive: 0,
  spectatorAcceptedAddr: '',
  streakPromptAddr: '',
  winnerStreakAddr: '',
  leaderboardJson: '{}',
  playersInScene: 0,
  suddenDeath: 0
}

export let penaltyStateEntity: Entity | null = null
export let clientSnapshot: ClientSnapshot = defaultSnapshot

function findPenaltyStateEntity(): Entity | null {
  for (const [e] of engine.getEntitiesWith(PenaltyMatchState)) {
    return e
  }
  return null
}

export function readPenaltySnapshot(): ClientSnapshot {
  if (penaltyStateEntity !== null && !PenaltyMatchState.has(penaltyStateEntity)) {
    penaltyStateEntity = null
  }
  if (penaltyStateEntity === null) {
    penaltyStateEntity = findPenaltyStateEntity()
  }
  if (penaltyStateEntity === null || !PenaltyMatchState.has(penaltyStateEntity)) {
    return clientSnapshot
  }
  const p = PenaltyMatchState.get(penaltyStateEntity)
  clientSnapshot = {
    phase: p.phase,
    mode: p.mode,
    hasActiveMatch: p.hasActiveMatch,
    redName: p.redName,
    blueName: p.blueName,
    redAddr: p.redAddr,
    blueAddr: p.blueAddr,
    waitEndMs: p.waitEndMs,
    shotIndex: p.shotIndex,
    kickerIsRed: p.kickerIsRed,
    redScore: p.redScore,
    blueScore: p.blueScore,
    resultLine: p.resultLine,
    lastRoundWasGoal: p.lastRoundWasGoal,
    winnerName: p.winnerName,
    spectatorWinnerName: p.spectatorWinnerName,
    spectatorChallengeActive: p.spectatorChallengeActive,
    spectatorAcceptedAddr: p.spectatorAcceptedAddr,
    streakPromptAddr: p.streakPromptAddr,
    winnerStreakAddr: p.winnerStreakAddr,
    leaderboardJson: p.leaderboardJson,
    playersInScene: p.playersInScene,
    suddenDeath: p.suddenDeath
  }
  return clientSnapshot
}

export function penaltyStateEntityReady(): boolean {
  return penaltyStateEntity !== null && PenaltyMatchState.has(penaltyStateEntity)
}
