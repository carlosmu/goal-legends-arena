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
  winnerSide: string
  spectatorWinnerName: string
  spectatorChallengeActive: number
  spectatorAcceptedAddr: string
  streakPromptAddr: string
  winnerStreakAddr: string
  leaderboardJson: string
  redCountry: string
  blueCountry: string
  playersInScene: number
  suddenDeath: number
  serverTickCounter: number
  lastServerEvent: string
  pveHumanIsRed: number
  inactivityDeadlineMs: number
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
  winnerSide: '',
  spectatorWinnerName: '',
  spectatorChallengeActive: 0,
  spectatorAcceptedAddr: '',
  streakPromptAddr: '',
  winnerStreakAddr: '',
  leaderboardJson: '{}',
  redCountry: '',
  blueCountry: '',
  playersInScene: 0,
  suddenDeath: 0,
  serverTickCounter: 0,
  lastServerEvent: '',
  pveHumanIsRed: 0,
  inactivityDeadlineMs: 0
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
    winnerSide: p.winnerSide,
    spectatorWinnerName: p.spectatorWinnerName,
    spectatorChallengeActive: p.spectatorChallengeActive,
    spectatorAcceptedAddr: p.spectatorAcceptedAddr,
    streakPromptAddr: p.streakPromptAddr,
    winnerStreakAddr: p.winnerStreakAddr,
    leaderboardJson: p.leaderboardJson,
    redCountry: p.redCountry,
    blueCountry: p.blueCountry,
    playersInScene: p.playersInScene,
    suddenDeath: p.suddenDeath,
    serverTickCounter: p.serverTickCounter,
    lastServerEvent: p.lastServerEvent,
    pveHumanIsRed: p.pveHumanIsRed,
    inactivityDeadlineMs: p.inactivityDeadlineMs
  }
  return clientSnapshot
}

export function penaltyStateEntityReady(): boolean {
  return penaltyStateEntity !== null && PenaltyMatchState.has(penaltyStateEntity)
}
