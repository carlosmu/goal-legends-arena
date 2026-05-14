/**
 * Single authoritative state machine for the penalty shootout minigame.
 * Server writes `phase` to the synced component; clients mirror for UI/audio.
 */
export enum GameState {
  /** No match; welcome allowed for newcomers. */
  LobbyIdle = 'LobbyIdle',
  /** A match is running; welcome hidden until match fully ends. */
  LobbyMatchActive = 'LobbyMatchActive',
  /** One player on a spot, 30s for rival or PvE. */
  WaitingOpponent = 'WaitingOpponent',
  /** Both sides must pick Left/Center/Right (kicker + goalkeeper). */
  SelectingDirections = 'SelectingDirections',
  /** Whistle + reveal GOAL/SAVE (timed). */
  ResolvingRound = 'ResolvingRound',
  /** Winner line, sounds, leaderboard write, bans. */
  MatchEnd = 'MatchEnd',
  /** Winner chooses YES/NO to keep streak on spot. */
  WinnerContinuePrompt = 'WinnerContinuePrompt',
  /** Spectators see challenge popup after a PvP win. */
  SpectatorChallenge = 'SpectatorChallenge'
}

export type MatchMode = 'none' | 'pvp' | 'pve'

export type AimDirection = 'L' | 'C' | 'R'

export function aimLabel(d: AimDirection): string {
  switch (d) {
    case 'L':
      return 'Left'
    case 'C':
      return 'Center'
    case 'R':
      return 'Right'
  }
}
