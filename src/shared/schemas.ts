import { engine, Schemas } from '@dcl/sdk/ecs'
import { AUTH_SERVER_PEER_ID } from '@dcl/sdk/network/message-bus-sync'

/**
 * Authoritative match snapshot synced to all clients.
 * Strings use '' for empty; ints use 0/1 for booleans where noted.
 */
export const PenaltyMatchState = engine.defineComponent('gla:penalty-match-state', {
  phase: Schemas.String,
  mode: Schemas.String,
  /** 1 = global match in progress (welcome hidden for new entrants). */
  hasActiveMatch: Schemas.Int,
  redAddr: Schemas.String,
  blueAddr: Schemas.String,
  redName: Schemas.String,
  blueName: Schemas.String,
  waitEndMs: Schemas.Number,
  /** 0..9 regulation; 10+ sudden death extension. */
  shotIndex: Schemas.Int,
  /** Current round kicker is red if 1. */
  kickerIsRed: Schemas.Int,
  /** Who was kicker on shot 0. */
  firstKickerIsRed: Schemas.Int,
  redScore: Schemas.Int,
  blueScore: Schemas.Int,
  /** L | C | R | '' */
  kickerPick: Schemas.String,
  gkPick: Schemas.String,
  /** Full line for temporary result UI. */
  resultLine: Schemas.String,
  /** 1 goal, 0 save (after resolution). */
  lastRoundWasGoal: Schemas.Int,
  winnerSide: Schemas.String,
  winnerName: Schemas.String,
  loserAddr: Schemas.String,
  /** PvP match ended (used once for Storage). */
  pendingLeaderboardPvP: Schemas.Int,
  /** Name shown on spectator challenge popup. */
  spectatorWinnerName: Schemas.String,
  /** 1 = show spectator challenge UI. */
  spectatorChallengeActive: Schemas.Int,
  /** Wallet that should see “go take spot” (cleared quickly). */
  spectatorAcceptedAddr: Schemas.String,
  /** Address of player who sees winner YES/NO streak UI. */
  streakPromptAddr: Schemas.String,
  /** Stable until streak answered (same as winner wallet in PvP). */
  winnerStreakAddr: Schemas.String,
  /** JSON: { wins, sessionMax, names? } — names: addr → display name at last win */
  leaderboardJson: Schemas.String,
  /** Updated by server for cooldown rule (≤2 players → no ban). */
  playersInScene: Schemas.Int,
  /** 1 after regulation block finished still tied. */
  suddenDeath: Schemas.Int,
  /** Incremented when server wants clients to treat a field as fresh (optional). */
  stateEpoch: Schemas.Int,
  /** Generic timer for ResolvingRound / MatchEnd transitions. */
  phaseDeadlineMs: Schemas.Number,
  /** 1 = human plays red in PvE. */
  pveHumanIsRed: Schemas.Int,
  /** Debug: incrementa en cada `serverTick`; si en cliente sube → servidor vivo. */
  serverTickCounter: Schemas.Int,
  /** Debug: último evento recibido por el servidor (mensaje + ctx.from). */
  lastServerEvent: Schemas.String
})

PenaltyMatchState.validateBeforeChange((value) => value.senderAddress === AUTH_SERVER_PEER_ID)
