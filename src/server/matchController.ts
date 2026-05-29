import { engine, Entity, PlayerIdentityData, AvatarBase, Name, Transform } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { Storage } from '@dcl/sdk/server'
import { Vector3 } from '@dcl/sdk/math'
import { GameState, type MatchMode, aimLabel } from '../shared/gameState'
import { PenaltyMatchState } from '../shared/schemas'
import { room } from '../shared/messages'
import {
  AIM_COLLIDERS,
  BAN_COOLDOWN_MS,
  MATCH_END_UI_MS,
  REGULATION_SHOTS,
  ROUND_RESULT_MS,
  SHOOT_TIMEOUT_MS,
  STANDS_FALLBACK,
  SYNC_STATE_ENTITY_ENUM,
  WAIT_OPPONENT_MS,
  WINNER_STREAK_TIMEOUT_MS,
  getRandomExpulsionLocation
} from '../shared/constants'
import { parseDir, randomDir, regulationEarlyWinner, suddenDeathWinner } from './matchHelpers'

const LB_KEY = 'gla_leaderboard_v1'

type LeaderboardFile = {
  wins: Record<string, number>
  names?: Record<string, string>
  countries?: Record<string, string>
}

let stateEntity: Entity = 0 as Entity

const sessionStreak = new Map<string, number>()
const sessionMaxStreak = new Map<string, number>()

let lbWins: Record<string, number> = {}
let lbDisplayNames: Record<string, string> = {}
let lbCountries: Record<string, string> = {}

function nowMs(): number {
  return Date.now()
}

function mut() {
  return PenaltyMatchState.getMutable(stateEntity)
}

function bumpEpoch() {
  const m = mut()
  m.stateEpoch = (m.stateEpoch || 0) + 1
}

function packLeaderboardJson(): string {
  const sessionMax: Record<string, number> = {}
  for (const [k, v] of sessionMaxStreak.entries()) sessionMax[k] = v
  return JSON.stringify({ wins: lbWins, sessionMax, names: lbDisplayNames, countries: lbCountries })
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
      } catch {
        lbWins = {}
        lbDisplayNames = {}
        lbCountries = {}
      }
    } else if (typeof raw === 'object' && raw.wins) {
      lbWins = raw.wins || {}
      lbDisplayNames = raw.names || {}
      lbCountries = raw.countries || {}
    }
  } catch (e) {
    console.log('[Server] leaderboard load failed', e)
  }
  syncLbToState()
}

async function persistWins() {
  try {
    await Storage.set(LB_KEY, { wins: lbWins, names: lbDisplayNames, countries: lbCountries })
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

import { pickRandomCountryIso } from '../shared/countryUtils'

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
  m.inactivityDeadlineMs = 0
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
    m.blueName = 'Engine'
    m.blueAddr = ''
  } else {
    m.blueName = humanName
    m.redName = 'Engine'
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

function tryEnterResolving() {
  const m = mut()
  if (m.phase !== GameState.SelectingDirections) return
  maybeFillAiGk()
  if (!m.kickerPick || !m.gkPick) return

  const goal = m.kickerPick !== m.gkPick
  m.lastRoundWasGoal = goal ? 1 : 0
  if (goal) {
    if (m.kickerIsRed === 1) m.redScore++
    else m.blueScore++
  }
  const kLab = aimLabel(m.kickerPick as 'L' | 'C' | 'R')
  const gLab = aimLabel(m.gkPick as 'L' | 'C' | 'R')
  const kickerName = m.kickerIsRed === 1 ? m.redName : m.blueName
  const gkName = m.kickerIsRed === 1 ? m.blueName : m.redName
  m.resultLine = `${goal ? 'GOAL!' : 'SAVE!'}\n${kickerName} chose ${kLab}\n${gkName} chose ${gLab}`
  m.phase = GameState.ResolvingRound
  m.phaseDeadlineMs = nowMs() + ROUND_RESULT_MS
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
      if (loseAddr) sessionStreak.set(loseAddr, 0)
      const cur = (sessionStreak.get(winAddr) || 0) + 1
      sessionStreak.set(winAddr, cur)
      sessionMaxStreak.set(winAddr, Math.max(sessionMaxStreak.get(winAddr) || 0, cur))
      lbWins[winAddr] = (lbWins[winAddr] || 0) + 1
      lbDisplayNames[winAddr] = (winName && winName.trim()) || displayNameFor(winAddr)
      const winCountry = (side === 'red' ? m.redCountry : m.blueCountry) || ''
      if (winCountry) lbCountries[winAddr.toLowerCase()] = winCountry
      void persistWins()
    }
  }

  syncLbToState()

  if (m.mode === 'pvp' && loseAddr) {
    if (m.playersInScene > 2) {
      void setBan(loseAddr, BAN_COOLDOWN_MS)
    }
    const expulsion = getRandomExpulsionLocation()
    sendTeleport(loseAddr, expulsion.pos, expulsion.cam)
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
      m.inactivityDeadlineMs = nowMs() + SHOOT_TIMEOUT_MS
      if (isAiKicker()) m.kickerPick = randomDir()
      bumpEpoch()
      return true
    }
    finishMatch(m.redScore > m.blueScore ? 'red' : 'blue')
    return true
  }

  if (m.suddenDeath === 1) {
    const sd = suddenDeathWinner(m.redScore, m.blueScore)
    if (sd) {
      finishMatch(sd)
      return true
    }
  }

  m.shotIndex = nextIdx
  m.kickerPick = ''
  m.gkPick = ''
  m.kickerIsRed = m.shotIndex % 2 === 0 ? fk : fk === 1 ? 0 : 1
  m.phase = GameState.SelectingDirections
  m.phaseDeadlineMs = 0
  m.inactivityDeadlineMs = nowMs() + SHOOT_TIMEOUT_MS
  if (isAiKicker()) m.kickerPick = randomDir()
  bumpEpoch()
  return true
}

export function serverTick() {
  const m = mut()
  const t = nowMs()
  m.serverTickCounter = (m.serverTickCounter || 0) + 1
  m.serverNowMs = t

  if (m.phase === GameState.WaitingOpponent && m.waitEndMs > 0 && t >= m.waitEndMs) {
    const hasRed = !!m.redAddr
    const hasBlue = !!m.blueAddr
    if (hasRed !== hasBlue) {
      startPvEFromWaiting(hasRed)
      m.waitEndMs = 0
    }
  }

  // Check if winner waiting for streak timed out (didn't play another match within 30s)
  if (
    m.phase === GameState.WaitingOpponent &&
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

  if (
    (m.phase === GameState.ResolvingRound || m.phase === GameState.MatchEnd) &&
    m.phaseDeadlineMs > 0 &&
    t >= m.phaseDeadlineMs
  ) {
    if (m.phase === GameState.ResolvingRound) {
      applyEarlyOrContinueAfterRound()
    } else if (m.phase === GameState.MatchEnd) {
      if (m.mode === 'pvp' && m.winnerSide) {
        const loseSide = m.winnerSide === 'red' ? 'blue' : 'red'
        clearSpotsLoserOnly(loseSide as 'red' | 'blue')
        m.phase = GameState.WinnerContinuePrompt
        m.phaseDeadlineMs = 0
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
}

export function registerServerMessages() {
  room.onMessage('setCountry', (data, ctx) => {
    if (!ctx?.from) return
    const iso = (data.iso || '').toLowerCase().trim()
    if (!iso) return
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
    const addr = addrRaw || `guest-${Math.random().toString(36).slice(2, 8)}`
    const mDbg = mut()
    mDbg.lastServerEvent = `occupySpot team=${data.team} from=${addrRaw || '(empty)'}`
    console.log(`[Server] occupySpot team=${data.team} from=${addrRaw || '(empty)'}`)

    const savedCountry = addrRaw ? await getCountry(addrRaw) : ''
    let country = savedCountry
    if (!country) {
      country = pickRandomCountryIso()
      if (addrRaw) void saveCountry(addrRaw, country)
    }

    if (addrRaw && (await isBanned(addrRaw))) {
      console.log(`[Server] banned player tried spot: ${addrRaw}`)
      return
    }
    const team = data.team === 'red' ? 'red' : data.team === 'blue' ? 'blue' : null
    if (!team) return

    const m = mut()

    if (m.phase === GameState.ResolvingRound) {
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

    // Reset inactivity timer on every player action
    m.inactivityDeadlineMs = nowMs() + SHOOT_TIMEOUT_MS

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
    endMatchNoWinner(`@${leaverName} abandoned the match`)
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
