import { engine, Entity, PlayerIdentityData, AvatarBase, Name, Transform } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { Vector3 } from '@dcl/sdk/math'
import { GameState, type MatchMode, aimLabel } from '../shared/gameState'
import { PenaltyMatchState } from '../shared/schemas'
import { room } from '../shared/messages'
import { DiscordWebhooks } from '../webhooks/discord-webhooks'
import { isBlockedPlayer } from '../webhooks/blocklist'
import {
  AIM_COLLIDERS,
  BAN_COOLDOWN_MS,
  GOAL_REVEAL_MS,
  LEADERBOARD_MATCH_END_MS,
  SPOT_PROMPT_DELAY_MS,
  MATCH_END_UI_MS,
  REGULATION_SHOTS,
  ROUND_RESULT_MS,
  SHOOT_TIMEOUT_MS,
  FIRST_SHOT_TIMEOUT_MS,
  STANDS_FALLBACK,
  SYNC_STATE_ENTITY_ENUM,
  WAIT_OPPONENT_MS,
  WINNER_STREAK_TIMEOUT_MS,
  getRandomExpulsionLocation,
  getSpawnLocation
} from '../shared/constants'
import { parseDir, randomDir, regulationEarlyWinner, suddenDeathWinner } from './matchHelpers'

const LB_KEY = 'gla_leaderboard_v1'

type LeaderboardFile = {
  /** PvP all-time wins (legacy key name kept for backward compat). */
  wins: Record<string, number>
  names?: Record<string, string>
  countries?: Record<string, string>
  /** Day key (YYYY-MM-DD, 09:00 UTC boundary) the `*dayWins` buckets belong to; '' if never set. */
  dayKey?: string
  /** PvP wins within the current daily bucket (legacy key name). */
  dayWins?: Record<string, number>
  /** PvE all-time wins. */
  pveWins?: Record<string, number>
  /** PvE wins within the current daily bucket. */
  pveDayWins?: Record<string, number>
}

let stateEntity: Entity = 0 as Entity

let lbWins: Record<string, number> = {}
let lbDisplayNames: Record<string, string> = {}
let lbCountries: Record<string, string> = {}
/** PvP daily bucket: wins for the current daily window only. */
let lbDayWins: Record<string, number> = {}
let lbDayKey = ''
/** PvE buckets (all-time + current daily window). */
let lbPveWins: Record<string, number> = {}
let lbPveDayWins: Record<string, number> = {}
/** True once the initial Storage load finished; gates tick writes to avoid a startup race. */
let lbLoaded = false

function nowMs(): number {
  return Date.now()
}

/** Daily bucket boundary: the day rolls over at this UTC hour (not midnight). */
const DAILY_RESET_HOUR_UTC = 9

/** Current "daily" day as `YYYY-MM-DD`, where each day runs 09:00 UTC → 09:00 UTC next day. */
function utcDayKey(t: number): string {
  // Shift back by the reset hour so the calendar-day rollover lands at 09:00 UTC.
  const d = new Date(t - DAILY_RESET_HOUR_UTC * 3_600_000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Reset the daily bucket when the UTC day changes. Returns true if it rolled over,
 * so callers can re-sync/persist. Called both on each win (lazy) and on the server
 * tick, so the bucket empties at UTC midnight even if nobody plays.
 */
function rolloverDailyIfNeeded(): boolean {
  const key = utcDayKey(nowMs())
  if (lbDayKey === key) return false
  lbDayKey = key
  lbDayWins = {}
  lbPveDayWins = {}
  return true
}

function mut() {
  return PenaltyMatchState.getMutable(stateEntity)
}

function bumpEpoch() {
  const m = mut()
  m.stateEpoch = (m.stateEpoch || 0) + 1
}

/** Only the top N entries of a wins bucket are synced to clients (the rest never display).
 *  Keeps the synced payload bounded regardless of how many total players exist. */
const LEADERBOARD_SYNC_TOP_N = 10

function topNWins(bucket: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  Object.keys(bucket)
    .sort((a, b) => (bucket[b] || 0) - (bucket[a] || 0))
    .slice(0, LEADERBOARD_SYNC_TOP_N)
    .forEach((addr) => { out[addr] = bucket[addr] })
  return out
}

function packLeaderboardJson(): string {
  const pvpWins = topNWins(lbWins)
  const pvpDayWins = topNWins(lbDayWins)
  const pveWins = topNWins(lbPveWins)
  const pveDayWins = topNWins(lbPveDayWins)

  // Ship names/countries only for the addresses that actually appear in a top-N bucket, so the
  // payload stays bounded (otherwise these maps would still grow with total player count).
  const shown = new Set<string>([
    ...Object.keys(pvpWins),
    ...Object.keys(pvpDayWins),
    ...Object.keys(pveWins),
    ...Object.keys(pveDayWins)
  ])
  const names: Record<string, string> = {}
  const countries: Record<string, string> = {}
  for (const addr of shown) {
    if (lbDisplayNames[addr]) names[addr] = lbDisplayNames[addr]
    const c = lbCountries[addr] || lbCountries[addr.toLowerCase()]
    if (c) countries[addr] = c
  }

  return JSON.stringify({ pvpWins, pvpDayWins, pveWins, pveDayWins, names, countries, dayKey: lbDayKey })
}

function syncLbToState() {
  const m = mut()
  m.leaderboardJson = packLeaderboardJson()
}

export async function loadPersistentLeaderboard() {
  try {
    const raw = await Storage.get<LeaderboardFile | string>(LB_KEY)
    if (!raw) {
      /* cold start */
    } else if (typeof raw === 'string') {
      try {
        const j = JSON.parse(raw) as LeaderboardFile
        lbWins = j.wins || {}
        lbDisplayNames = j.names || {}
        lbCountries = j.countries || {}
        lbDayKey = j.dayKey || ''
        lbDayWins = j.dayWins || {}
        lbPveWins = j.pveWins || {}
        lbPveDayWins = j.pveDayWins || {}
      } catch {
        lbWins = {}
        lbDisplayNames = {}
        lbCountries = {}
        lbDayKey = ''
        lbDayWins = {}
        lbPveWins = {}
        lbPveDayWins = {}
      }
    } else if (typeof raw === 'object' && raw.wins) {
      lbWins = raw.wins || {}
      lbDisplayNames = raw.names || {}
      lbCountries = raw.countries || {}
      lbDayKey = raw.dayKey || ''
      lbDayWins = raw.dayWins || {}
      lbPveWins = raw.pveWins || {}
      lbPveDayWins = raw.pveDayWins || {}
    }
  } catch (e) {
    console.log('[Server] leaderboard load failed', e)
  }
  // Drop a stale daily bucket if the server was offline across a UTC day boundary.
  rolloverDailyIfNeeded()
  lbLoaded = true
  syncLbToState()
}

async function persistWins() {
  try {
    await Storage.set(LB_KEY, {
      wins: lbWins,
      names: lbDisplayNames,
      countries: lbCountries,
      dayKey: lbDayKey,
      dayWins: lbDayWins,
      pveWins: lbPveWins,
      pveDayWins: lbPveDayWins
    })
  } catch (e) {
    console.log('[Server] leaderboard save failed', e)
  }
}

function displayNameFor(addr: string): string {
  const a = addr.toLowerCase()
  for (const [, id, base] of engine.getEntitiesWith(PlayerIdentityData, AvatarBase)) {
    if (id.address?.toLowerCase() === a) return base.name || shortAddr(addr)
  }
  return shortAddr(addr)
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr || '?'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

import { isValidCountryIso, pickRandomCountryIso } from '../shared/countryUtils'

const COUNTRY_KEY = 'gla_country'

async function getCountry(addr: string): Promise<string> {
  try {
    return (await Storage.player.get<string>(addr, COUNTRY_KEY)) || ''
  } catch {
    return ''
  }
}

async function saveCountry(addr: string, iso: string) {
  try {
    await Storage.player.set(addr, COUNTRY_KEY, iso)
  } catch (e) {
    console.log('[Server] country save failed', e)
  }
}

async function isBanned(addr: string): Promise<boolean> {
  try {
    const until = await Storage.player.get<string>(addr, 'gla_ban_until')
    if (!until) return false
    return Date.now() < parseInt(until, 10)
  } catch {
    return false
  }
}

async function setBan(addr: string, ms: number) {
  const until = String(Date.now() + ms)
  try {
    await Storage.player.set(addr, 'gla_ban_until', until)
  } catch (e) {
    console.log('[Server] ban write failed', e)
  }
}

function getPovTransformSafe(): { pos: Vector3; cam: Vector3 } {
  for (const [, nm, tr] of engine.getEntitiesWith(Name, Transform)) {
    if (nm.value === 'POV') {
      const p = tr.position
      return { pos: Vector3.create(p.x, p.y, p.z), cam: Vector3.create(16, 1, 16) }
    }
  }
  return { pos: STANDS_FALLBACK.pos, cam: STANDS_FALLBACK.cam }
}

export function createStateEntity(): Entity {
  stateEntity = engine.addEntity()
  PenaltyMatchState.create(stateEntity, {
    phase: GameState.LobbyIdle,
    mode: 'none',
    hasActiveMatch: 0,
    redAddr: '',
    blueAddr: '',
    redName: '',
    blueName: '',
    waitEndMs: 0,
    shotIndex: 0,
    kickerIsRed: 1,
    firstKickerIsRed: 1,
    redScore: 0,
    blueScore: 0,
    kickerPick: '',
    gkPick: '',
    resultLine: '',
    lastRoundWasGoal: 0,
    winnerSide: '',
    winnerName: '',
    loserAddr: '',
    pendingLeaderboardPvP: 0,
    spectatorWinnerName: '',
    spectatorChallengeActive: 0,
    spectatorAcceptedAddr: '',
    streakPromptAddr: '',
    winnerStreakAddr: '',
    winnerStreakDeadlineMs: 0,
    leaderboardJson: '{}',
    playersInScene: 0,
    suddenDeath: 0,
    stateEpoch: 0,
    phaseDeadlineMs: 0,
    revealAtMs: 0,
    inactivityDeadlineMs: 0,
    redCountry: '',
    blueCountry: '',
    pveHumanIsRed: 1,
    serverTickCounter: 0,
    serverNowMs: nowMs(),
    lastServerEvent: 'server-boot'
  })
  syncEntity(stateEntity, [PenaltyMatchState.componentId], SYNC_STATE_ENTITY_ENUM)
  return stateEntity
}

function sendTeleport(toAddr: string, pos: Vector3, cam: Vector3) {
  if (!toAddr) return
  room.send(
    'teleport',
    { x: pos.x, y: pos.y, z: pos.z, cx: cam.x, cy: cam.y, cz: cam.z },
    { to: [toAddr] }
  )
}

function roleForAddress(addr: string): 'red' | 'blue' | null {
  const m = PenaltyMatchState.get(stateEntity)
  if (m.redAddr && m.redAddr.toLowerCase() === addr.toLowerCase()) return 'red'
  if (m.blueAddr && m.blueAddr.toLowerCase() === addr.toLowerCase()) return 'blue'
  return null
}

function isAiKicker(): boolean {
  const m = PenaltyMatchState.get(stateEntity)
  if (m.mode !== 'pve') return false
  const humanRed = m.pveHumanIsRed === 1
  const kRed = m.kickerIsRed === 1
  return (humanRed && !kRed) || (!humanRed && kRed)
}

function isAiGk(): boolean {
  const m = PenaltyMatchState.get(stateEntity)
  if (m.mode !== 'pve') return false
  return !isAiKicker()
}

/** Inactivity grace for the round that's about to start. Each player's FIRST kick gets the
 *  longer window so newcomers can learn the mechanic: shotIndex 0 (player A kicks) and 1
 *  (player B kicks). From each player's second kick on (shotIndex ≥ 2, or sudden death) it's
 *  the regular 30s. */
function inactivityTimeoutMs(shotIndex: number, suddenDeath: number): number {
  return suddenDeath === 0 && shotIndex <= 1 ? FIRST_SHOT_TIMEOUT_MS : SHOOT_TIMEOUT_MS
}

function resetMatchForNewGame(mode: MatchMode, pveHumanIsRed: boolean) {
  const m = mut()
  m.mode = mode
  m.hasActiveMatch = 1
  m.shotIndex = 0
  m.redScore = 0
  m.blueScore = 0
  m.kickerPick = ''
  m.gkPick = ''
  m.suddenDeath = 0
  m.resultLine = ''
  m.winnerSide = ''
  m.winnerName = ''
  m.loserAddr = ''
  m.pendingLeaderboardPvP = 0
  m.spectatorChallengeActive = 0
  m.spectatorWinnerName = ''
  m.streakPromptAddr = ''
  m.winnerStreakAddr = ''
  m.winnerStreakDeadlineMs = 0
  m.pveHumanIsRed = pveHumanIsRed ? 1 : 0
  m.firstKickerIsRed = Math.random() < 0.5 ? 1 : 0
  m.kickerIsRed = m.firstKickerIsRed
  m.phase = GameState.SelectingDirections
  m.phaseDeadlineMs = 0
  // Arm the inactivity timer for shot 0 (60s — first kick of the match).
  m.inactivityDeadlineMs = nowMs() + inactivityTimeoutMs(m.shotIndex, m.suddenDeath)
  if (isAiKicker()) {
    m.kickerPick = randomDir()
    m.gkPick = ''
  }
  bumpEpoch()
}

function startPvPFromWaiting() {
  const m = PenaltyMatchState.get(stateEntity)
  if (!m.redAddr || !m.blueAddr) return
  const x = mut()
  x.redName = displayNameFor(m.redAddr)
  x.blueName = displayNameFor(m.blueAddr)
  x.winnerStreakDeadlineMs = 0
  resetMatchForNewGame('pvp', true)
}

function startPvEFromWaiting(humanIsRed: boolean) {
  const m = mut()
  const humanAddr = humanIsRed ? m.redAddr : m.blueAddr
  const humanName = displayNameFor(humanAddr)
  if (humanIsRed) {
    m.redName = humanName
    m.blueName = 'GL-Bot'
    m.blueAddr = ''
  } else {
    m.blueName = humanName
    m.redName = 'GL-Bot'
    m.redAddr = ''
  }
  m.winnerStreakDeadlineMs = 0
  resetMatchForNewGame('pve', humanIsRed)
}

function maybeFillAiGk() {
  const m = mut()
  if (m.mode !== 'pve' || !isAiGk() || m.gkPick) return
  if (!m.kickerPick) return
  m.gkPick = randomDir()
}

/** Hold in SelectingDirections this long after BOTH directions are in, so the chosen button
 *  stays visible (especially for whoever picked second) before the shoot animation runs. */
const PICK_REVEAL_HOLD_MS = 1000
let pendingResolveAtMs = 0

function tryEnterResolving() {
  const m = mut()
  if (m.phase !== GameState.SelectingDirections) return
  maybeFillAiGk()
  if (!m.kickerPick || !m.gkPick) return
  if (pendingResolveAtMs > 0) return // hold already scheduled

  // Both picked: stay in SelectingDirections briefly (button-reveal hold), then resolve.
  pendingResolveAtMs = nowMs() + PICK_REVEAL_HOLD_MS
  m.inactivityDeadlineMs = 0 // both acted; don't let the inactivity timer fire during the hold
  bumpEpoch()
}

/** Transition into ResolvingRound (starts the shoot animation). The score bump + result banner
 *  are deferred GOAL_REVEAL_MS in (see revealRoundResult) so the UI doesn't spoil it at frame 0. */
function enterResolvingRound() {
  const m = mut()
  if (m.phase !== GameState.SelectingDirections || !m.kickerPick || !m.gkPick) return
  const goal = m.kickerPick !== m.gkPick
  m.lastRoundWasGoal = goal ? 1 : 0
  m.resultLine = ''
  m.phase = GameState.ResolvingRound
  const t = nowMs()
  m.revealAtMs = t + GOAL_REVEAL_MS
  m.phaseDeadlineMs = t + ROUND_RESULT_MS
  bumpEpoch()
}

/** Applies the deferred round outcome: bumps the score and fills the result banner. */
function revealRoundResult() {
  const m = mut()
  if (m.revealAtMs === 0) return
  m.revealAtMs = 0
  const goal = m.lastRoundWasGoal === 1
  if (goal) {
    if (m.kickerIsRed === 1) m.redScore++
    else m.blueScore++
  }
  const kLab = aimLabel(m.kickerPick as 'L' | 'C' | 'R')
  const gLab = aimLabel(m.gkPick as 'L' | 'C' | 'R')
  const kickerName = m.kickerIsRed === 1 ? m.redName : m.blueName
  const gkName = m.kickerIsRed === 1 ? m.blueName : m.redName
  m.resultLine = `${goal ? 'GOAL!' : 'SAVE!'}\n${kickerName} chose ${kLab}\n${gkName} chose ${gLab}`
  bumpEpoch()
}

function finishMatch(side: 'red' | 'blue') {
  const m = mut()
  m.winnerSide = side
  const winAddr = side === 'red' ? m.redAddr : m.blueAddr
  const loseAddr = side === 'red' ? m.blueAddr : m.redAddr
  const winName = side === 'red' ? m.redName : m.blueName
  m.winnerName = winName
  m.loserAddr = m.mode === 'pvp' ? loseAddr : ''
  m.phase = GameState.MatchEnd
  m.phaseDeadlineMs = nowMs() + MATCH_END_UI_MS
  m.pendingLeaderboardPvP = m.mode === 'pvp' ? 1 : 0

  if (m.mode === 'pvp') {
    m.spectatorWinnerName = winName
    m.spectatorChallengeActive = 1
    if (winAddr) {
      rolloverDailyIfNeeded()
      lbWins[winAddr] = (lbWins[winAddr] || 0) + 1
      lbDayWins[winAddr] = (lbDayWins[winAddr] || 0) + 1
      lbDisplayNames[winAddr] = (winName && winName.trim()) || displayNameFor(winAddr)
      const winCountry = (side === 'red' ? m.redCountry : m.blueCountry) || ''
      if (winCountry) lbCountries[winAddr.toLowerCase()] = winCountry
      void persistWins()
    }
  } else if (m.mode === 'pve') {
    // Only the human's win counts (the GL-Bot slot has no address → winAddr is empty).
    if (winAddr) {
      rolloverDailyIfNeeded()
      lbPveWins[winAddr] = (lbPveWins[winAddr] || 0) + 1
      lbPveDayWins[winAddr] = (lbPveDayWins[winAddr] || 0) + 1
      lbDisplayNames[winAddr] = (winName && winName.trim()) || displayNameFor(winAddr)
      const winCountry = (side === 'red' ? m.redCountry : m.blueCountry) || ''
      if (winCountry) lbCountries[winAddr.toLowerCase()] = winCountry
      void persistWins()
    }
  }

  syncLbToState()

  if (loseAddr) {
    // Ban cooldown is PvP-only (and only when there are others waiting).
    if (m.mode === 'pvp' && m.playersInScene > 2) {
      void setBan(loseAddr, BAN_COOLDOWN_MS)
    }
    const spawn = getSpawnLocation()
    sendTeleport(loseAddr, spawn.pos, spawn.cam)
  }

  if (m.mode === 'pvp' && winAddr) {
    m.streakPromptAddr = winAddr
    m.winnerStreakAddr = winAddr
  }

  bumpEpoch()
}

function endMatchNoWinner(message: string) {
  const m = mut()
  m.winnerName = message
  m.winnerSide = ''
  m.phase = GameState.MatchEnd
  m.phaseDeadlineMs = nowMs() + MATCH_END_UI_MS

  const redAddr = m.redAddr
  const blueAddr = m.blueAddr
  clearAllSpots()

  if (redAddr) {
    const expulsion = getRandomExpulsionLocation()
    sendTeleport(redAddr, expulsion.pos, expulsion.cam)
  }
  if (blueAddr) {
    const expulsion = getRandomExpulsionLocation()
    sendTeleport(blueAddr, expulsion.pos, expulsion.cam)
  }

  bumpEpoch()
}

function finishMatchTimeout() {
  endMatchNoWinner('Timeout')
}

function clearSpotsLoserOnly(side: 'red' | 'blue') {
  const m = mut()
  if (side === 'red') {
    m.redAddr = ''
    m.redName = ''
  } else {
    m.blueAddr = ''
    m.blueName = ''
  }
}

function clearAllSpots() {
  const m = mut()
  m.redAddr = ''
  m.blueAddr = ''
  m.redName = ''
  m.blueName = ''
  m.redCountry = ''
  m.blueCountry = ''
}

function goLobbyIdle() {
  const m = mut()
  m.phase = GameState.LobbyIdle
  m.mode = 'none'
  m.hasActiveMatch = 0
  clearAllSpots()
  m.streakPromptAddr = ''
  m.winnerStreakAddr = ''
  m.spectatorChallengeActive = 0
  m.spectatorWinnerName = ''
  bumpEpoch()
}

function applyEarlyOrContinueAfterRound(): boolean {
  const m = mut()
  const fk = m.firstKickerIsRed
  const nextIdx = m.shotIndex + 1

  if (m.suddenDeath === 0 && nextIdx < REGULATION_SHOTS) {
    const early = regulationEarlyWinner(m.redScore, m.blueScore, nextIdx, fk)
    if (early) {
      finishMatch(early)
      return true
    }
  }

  if (m.suddenDeath === 0 && nextIdx === REGULATION_SHOTS) {
    if (m.redScore === m.blueScore) {
      m.shotIndex = nextIdx
      m.suddenDeath = 1
      m.kickerPick = ''
      m.gkPick = ''
      m.kickerIsRed = m.shotIndex % 2 === 0 ? fk : fk === 1 ? 0 : 1
      m.phase = GameState.SelectingDirections
      m.phaseDeadlineMs = 0
      m.inactivityDeadlineMs = nowMs() + inactivityTimeoutMs(m.shotIndex, m.suddenDeath)
      if (isAiKicker()) m.kickerPick = randomDir()
      bumpEpoch()
      return true
    }
    finishMatch(m.redScore > m.blueScore ? 'red' : 'blue')
    return true
  }

  if (m.suddenDeath === 1) {
    // A sudden-death round only resolves once BOTH players have kicked. By convention an even
    // shotIndex is the first kicker of the round and an odd one is the second, so the round is
    // complete (and a winner can be decided) only when the just-finished shot had an odd index.
    // Otherwise the first kicker scoring would end the match before the other gets their attempt.
    const roundComplete = m.shotIndex % 2 === 1
    if (roundComplete) {
      const sd = suddenDeathWinner(m.redScore, m.blueScore)
      if (sd) {
        finishMatch(sd)
        return true
      }
    }
  }

  m.shotIndex = nextIdx
  m.kickerPick = ''
  m.gkPick = ''
  m.kickerIsRed = m.shotIndex % 2 === 0 ? fk : fk === 1 ? 0 : 1
  m.phase = GameState.SelectingDirections
  m.phaseDeadlineMs = 0
  m.inactivityDeadlineMs = nowMs() + inactivityTimeoutMs(m.shotIndex, m.suddenDeath)
  if (isAiKicker()) m.kickerPick = randomDir()
  bumpEpoch()
  return true
}

// Participant addresses we've confirmed present in-scene this match, plus when each one
// first went missing. Lets us tell a real disconnect (was here, now gone) from an id that
// never appeared, and adds a short grace so a one-frame blip doesn't end the match.
const seenPresentAddrs = new Set<string>()
const participantMissingSince = new Map<string, number>()
const DISCONNECT_GRACE_MS = 1500

/** Closing the client (desktop or mobile) drops the player's PlayerIdentityData entity.
 *  If a participant we'd seen present vanishes mid-match, end it exactly like a manual
 *  leave ("@name left the match") instead of letting the match hang until a timeout. */
function checkParticipantDisconnects() {
  const m = mut()
  if (m.phase === GameState.LobbyIdle || m.phase === GameState.MatchEnd) {
    seenPresentAddrs.clear()
    participantMissingSince.clear()
    return
  }

  const present = new Set<string>()
  for (const [, id] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (id.address) present.add(id.address.toLowerCase())
  }

  const t = nowMs()
  const participants: Array<readonly [string, string]> = [
    [m.redAddr, m.redName],
    [m.blueAddr, m.blueName]
  ]
  for (const [addr, name] of participants) {
    if (!addr) continue // empty = AI/bot slot, nothing to disconnect
    const a = addr.toLowerCase()
    if (present.has(a)) {
      seenPresentAddrs.add(a)
      participantMissingSince.delete(a)
      continue
    }
    if (!seenPresentAddrs.has(a)) continue // never showed up (e.g. synthetic id); ignore
    const since = participantMissingSince.get(a)
    if (since === undefined) {
      participantMissingSince.set(a, t)
    } else if (t - since >= DISCONNECT_GRACE_MS) {
      m.lastServerEvent = `disconnect from=${addr}`
      console.log(`[Server] participant disconnected mid-match: ${addr}`)
      endMatchNoWinner(`@${name}\nleft the match`)
      seenPresentAddrs.clear()
      participantMissingSince.clear()
      return
    }
  }
}

export function serverTick() {
  const m = mut()
  const t = nowMs()
  m.serverTickCounter = (m.serverTickCounter || 0) + 1
  m.serverNowMs = t

  // Clear the daily bucket at the 09:00 UTC rollover even with no matches, so clients
  // never see yesterday's wins labelled as today's. Gated on the initial load so a
  // first-frame rollover can't persist an empty bucket over real stored data.
  if (lbLoaded && rolloverDailyIfNeeded()) {
    syncLbToState()
    void persistWins()
  }

  checkParticipantDisconnects()

  // Button-reveal hold: both picked, wait PICK_REVEAL_HOLD_MS, then start the shot. Clears
  // itself if the round ended some other way (e.g. abandonment) during the hold.
  if (pendingResolveAtMs > 0) {
    if (m.phase !== GameState.SelectingDirections) {
      pendingResolveAtMs = 0
    } else if (t >= pendingResolveAtMs) {
      pendingResolveAtMs = 0
      enterResolvingRound()
    }
  }

  if (m.phase === GameState.WaitingOpponent && m.waitEndMs > 0 && t >= m.waitEndMs) {
    const hasRed = !!m.redAddr
    const hasBlue = !!m.blueAddr
    if (hasRed !== hasBlue) {
      startPvEFromWaiting(hasRed)
      m.waitEndMs = 0
    }
  }

  // Winner timed out: either sat on the "Keep playing?" prompt unchallenged, or chose to
  // continue and then no opponent joined within 30s. Either way, expel them to the lobby.
  if (
    (m.phase === GameState.WaitingOpponent || m.phase === GameState.WinnerContinuePrompt) &&
    m.winnerStreakAddr &&
    m.winnerStreakDeadlineMs > 0 &&
    t >= m.winnerStreakDeadlineMs
  ) {
    const winnerAddr = m.winnerStreakAddr
    const expulsion = getRandomExpulsionLocation()
    sendTeleport(winnerAddr, expulsion.pos, expulsion.cam)
    m.winnerStreakAddr = ''
    m.winnerStreakDeadlineMs = 0
    goLobbyIdle()
    bumpEpoch()
    return
  }

  // Check for shoot inactivity timeout (no player interaction for SHOOT_TIMEOUT_MS).
  // Uses inactivityDeadlineMs so phaseDeadlineMs can stay dedicated to animation timers.
  if (
    m.phase === GameState.SelectingDirections &&
    m.inactivityDeadlineMs > 0 &&
    t >= m.inactivityDeadlineMs
  ) {
    m.inactivityDeadlineMs = 0
    finishMatchTimeout()
    return
  }

  // Reveal the deferred goal/save result partway through the shoot animation.
  if (m.phase === GameState.ResolvingRound && m.revealAtMs > 0 && t >= m.revealAtMs) {
    revealRoundResult()
  }

  if (
    (m.phase === GameState.ResolvingRound || m.phase === GameState.MatchEnd) &&
    m.phaseDeadlineMs > 0 &&
    t >= m.phaseDeadlineMs
  ) {
    if (m.phase === GameState.ResolvingRound) {
      // Safety: if the deadline somehow arrives before the reveal fired, apply it now
      // so the score is final before win conditions are evaluated.
      if (m.revealAtMs > 0) revealRoundResult()
      applyEarlyOrContinueAfterRound()
    } else if (m.phase === GameState.MatchEnd) {
      if (m.mode === 'pvp' && m.winnerSide) {
        const loseSide = m.winnerSide === 'red' ? 'blue' : 'red'
        clearSpotsLoserOnly(loseSide as 'red' | 'blue')
        m.phase = GameState.WinnerContinuePrompt
        m.phaseDeadlineMs = 0
        // Limit how long the winner can sit on the "Keep playing?" prompt unchallenged.
        // The prompt only appears after the match-end leaderboard, so add that window to the
        // 30s the winner actually gets (keeps it aligned with the client countdown).
        m.winnerStreakDeadlineMs =
          nowMs() + LEADERBOARD_MATCH_END_MS + SPOT_PROMPT_DELAY_MS + WINNER_STREAK_TIMEOUT_MS
      } else {
        goLobbyIdle()
      }
      bumpEpoch()
    }
  }
}

export function refreshPlayerCount() {
  const m = mut()
  m.playersInScene = Array.from(engine.getEntitiesWith(PlayerIdentityData)).length
  checkPlayerJoins()
}

// Addresses currently present in-scene, as of the last tick. Diffed each tick so a
// rejoin after leaving fires a new webhook instead of being suppressed forever.
const knownPlayerAddrs = new Set<string>()

function checkPlayerJoins() {
  const present = new Set<string>()
  for (const [, id, base] of engine.getEntitiesWith(PlayerIdentityData, AvatarBase)) {
    if (!id.address) continue
    const a = id.address.toLowerCase()
    present.add(a)
    if (!knownPlayerAddrs.has(a) && !isBlockedPlayer(a)) {
      DiscordWebhooks.newPlayer(base.name || shortAddr(id.address), id.address)
    }
  }
  knownPlayerAddrs.clear()
  for (const a of present) knownPlayerAddrs.add(a)
}

export function registerServerMessages() {
  room.onMessage('setCountry', (data, ctx) => {
    if (!ctx?.from) return
    const iso = (data.iso || '').toLowerCase().trim()
    if (!isValidCountryIso(iso)) return
    void saveCountry(ctx.from, iso)
    lbCountries[ctx.from.toLowerCase()] = iso
    const m = mut()
    if (m.redAddr.toLowerCase() === ctx.from.toLowerCase()) m.redCountry = iso
    else if (m.blueAddr.toLowerCase() === ctx.from.toLowerCase()) m.blueCountry = iso
    m.leaderboardJson = packLeaderboardJson()
  })

  room.onMessage('clientReadyPing', () => {})

  room.onMessage('occupySpot', async (data, ctx) => {
    const addrRaw = ctx?.from ?? ''
    const mDbg = mut()
    mDbg.lastServerEvent = `occupySpot team=${data.team} from=${addrRaw || '(empty)'}`
    console.log(`[Server] occupySpot team=${data.team} from=${addrRaw || '(empty)'}`)

    if (addrRaw && (await isBanned(addrRaw))) {
      console.log(`[Server] banned player tried spot: ${addrRaw}`)
      return
    }
    const team = data.team === 'red' ? 'red' : data.team === 'blue' ? 'blue' : null
    if (!team) return

    const m = mut()

    let addr = addrRaw
    if (!addr) {
      const slotAddr = team === 'red' ? m.redAddr : m.blueAddr
      if (slotAddr && !slotAddr.startsWith('0x')) addr = slotAddr
      else addr = `guest-${Math.random().toString(36).slice(2, 8)}`
    }

    const savedCountry = addrRaw ? await getCountry(addrRaw) : ''
    const slotCountry = team === 'red' ? m.redCountry : m.blueCountry
    const sameInSlot =
      !!(team === 'red' ? m.redAddr : m.blueAddr) &&
      (team === 'red' ? m.redAddr : m.blueAddr)!.toLowerCase() === addr.toLowerCase()

    let country = isValidCountryIso(savedCountry)
      ? savedCountry
      : sameInSlot && isValidCountryIso(slotCountry)
        ? slotCountry
        : pickRandomCountryIso()
    if (addrRaw && isValidCountryIso(country) && !isValidCountryIso(savedCountry)) {
      void saveCountry(addrRaw, country)
    }

    if (m.phase === GameState.ResolvingRound) {
      return
    }

    // Don't let anyone grab a spot during the brief match-end banner: an abandoned/finished
    // match is still cleaning up (goLobbyIdle resets hasActiveMatch after MATCH_END_UI_MS).
    // Occupying here flips the phase to WaitingOpponent, so that cleanup never fires and
    // hasActiveMatch stays stuck at 1 — leaving the next player camera-locked. Wait for LobbyIdle.
    if (m.phase === GameState.MatchEnd) {
      return
    }

    const pveClaimFreeSlotDuringSelect =
      m.mode === 'pve' &&
      m.phase === GameState.SelectingDirections &&
      ((team === 'blue' && !m.blueAddr) || (team === 'red' && !m.redAddr))

    if (m.phase === GameState.SelectingDirections && !pveClaimFreeSlotDuringSelect) {
      return
    }

    if (team === 'red' && m.blueAddr && m.blueAddr.toLowerCase() === addr.toLowerCase()) return
    if (team === 'blue' && m.redAddr && m.redAddr.toLowerCase() === addr.toLowerCase()) return

    if (team === 'red') {
      if (m.redAddr && m.redAddr.toLowerCase() !== addr.toLowerCase()) return
      m.redAddr = addr
      m.redName = displayNameFor(addr)
      m.redCountry = country
      if (addrRaw) lbCountries[addrRaw.toLowerCase()] = country
    } else {
      if (m.blueAddr && m.blueAddr.toLowerCase() !== addr.toLowerCase()) return
      m.blueAddr = addr
      m.blueName = displayNameFor(addr)
      m.blueCountry = country
      if (addrRaw) lbCountries[addrRaw.toLowerCase()] = country
    }

    const hasR = !!m.redAddr
    const hasB = !!m.blueAddr
    const bothHumans = !!(m.redAddr && m.blueAddr && m.redAddr.toLowerCase() !== m.blueAddr.toLowerCase())

    if (bothHumans) {
      startPvPFromWaiting()
      m.waitEndMs = 0
    } else if (hasR || hasB) {
      m.phase = GameState.WaitingOpponent
      m.waitEndMs = nowMs() + WAIT_OPPONENT_MS
    }

    bumpEpoch()
  })

  room.onMessage('submitDirection', (data, ctx) => {
    if (!ctx) return
    const addr = ctx.from
    const dir = parseDir(data.dir)
    if (!dir) return
    const m = mut()
    if (m.phase !== GameState.SelectingDirections) return
    if (pendingResolveAtMs > 0) return // both already committed; locked during the reveal hold

    const role = roleForAddress(addr)
    if (!role) return
    const kickerRed = m.kickerIsRed === 1
    const isKicker = (kickerRed && role === 'red') || (!kickerRed && role === 'blue')
    if (isKicker) {
      if (m.mode === 'pve' && isAiKicker()) return
      m.kickerPick = dir
    } else {
      if (m.mode === 'pve' && isAiGk()) return
      m.gkPick = dir
    }

    // Note: the inactivity timer is armed once per round (see inactivityTimeoutMs), not
    // reset on each pick — so the round counts down cleanly from its 60s/30s budget.
    maybeFillAiGk()
    tryEnterResolving()
    bumpEpoch()
  })

  room.onMessage('streakDecision', (data, ctx) => {
    if (!ctx) return
    const m = mut()
    if (m.phase !== GameState.WinnerContinuePrompt) return
    if (m.winnerStreakAddr.toLowerCase() !== ctx.from.toLowerCase()) return
    if (data.continue === 1) {
      m.phase = GameState.WaitingOpponent
      m.waitEndMs = nowMs() + WAIT_OPPONENT_MS
      m.winnerStreakDeadlineMs = nowMs() + WINNER_STREAK_TIMEOUT_MS
      m.streakPromptAddr = ''
      m.winnerStreakAddr = ctx.from
      m.mode = 'none'
      m.redScore = 0
      m.blueScore = 0
    } else {
      const expulsion = getRandomExpulsionLocation()
      sendTeleport(ctx.from, expulsion.pos, expulsion.cam)
      m.streakPromptAddr = ''
      m.winnerStreakAddr = ''
      m.winnerStreakDeadlineMs = 0
      goLobbyIdle()
    }
    bumpEpoch()
  })

  room.onMessage('leaveMatch', (_data, ctx) => {
    const m = mut()
    const addrRaw = ctx?.from ?? ''
    m.lastServerEvent = `leaveMatch from=${addrRaw}`
    if (!ctx || !addrRaw) return
    if (m.phase === GameState.LobbyIdle || m.phase === GameState.MatchEnd) return
    const addr = addrRaw.toLowerCase()
    let leaverName = ''
    if (m.redAddr?.toLowerCase() === addr) leaverName = m.redName
    else if (m.blueAddr?.toLowerCase() === addr) leaverName = m.blueName
    else return
    endMatchNoWinner(`@${leaverName}\nleft the match`)
  })

  // Cancel puro durante WaitingOpponent: limpia el spot del jugador, vuelve al lobby
  // y lo teleporta. Sin "abandoned", sin leaderboard, sin puntos al otro.
  room.onMessage('cancelWaiting', (_data, ctx) => {
    const m = mut()
    const addrRaw = ctx?.from ?? ''
    m.lastServerEvent = `cancelWaiting from=${addrRaw}`
    if (!ctx || !addrRaw) return
    if (m.phase !== GameState.WaitingOpponent) return
    const addr = addrRaw.toLowerCase()
    const isRed = m.redAddr?.toLowerCase() === addr
    const isBlue = m.blueAddr?.toLowerCase() === addr
    if (!isRed && !isBlue) return
    goLobbyIdle()
    const expulsion = getRandomExpulsionLocation()
    sendTeleport(addrRaw, expulsion.pos, expulsion.cam)
    bumpEpoch()
  })

  room.onMessage('startPvE', (_data, ctx) => {
    const m = mut()
    const addrRaw = ctx?.from ?? ''
    m.lastServerEvent = `startPvE from=${addrRaw} phase=${m.phase} red=${m.redAddr} blue=${m.blueAddr}`
    console.log(`[Server] startPvE from=${addrRaw} phase=${m.phase} red=${m.redAddr} blue=${m.blueAddr}`)
    if (!ctx) return
    if (m.phase !== GameState.WaitingOpponent) return
    const addr = addrRaw.toLowerCase()
    const humanIsRed = m.redAddr?.toLowerCase() === addr
    const humanIsBlue = m.blueAddr?.toLowerCase() === addr
    if (!humanIsRed && !humanIsBlue) return
    if (m.redAddr && m.blueAddr) return
    startPvEFromWaiting(humanIsRed)
    bumpEpoch()
  })

  room.onMessage('spectatorChallenge', (data, ctx) => {
    if (!ctx) return
    const m = mut()
    if (!m.spectatorChallengeActive) return
    if (data.accept !== 1) return
    m.spectatorAcceptedAddr = ctx.from
    m.spectatorChallengeActive = 0
    m.spectatorWinnerName = ''
    bumpEpoch()
  })
}

export { AIM_COLLIDERS }
