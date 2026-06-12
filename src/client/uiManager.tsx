import ReactEcs, { Button, Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { isMobile } from '@dcl/sdk/platform'
import { Color4 } from '@dcl/sdk/math'
import { isStateSyncronized } from '@dcl/sdk/network'
import { getPlayer } from '@dcl/sdk/src/players'
import { readPenaltySnapshot, clientSnapshot, penaltyStateEntityReady } from './gameStore'
import { getLeaderboardRows } from './leaderboardManager'
import { getLeaderboardFaceUrl, prefetchLeaderboardFaces } from './leaderboardProfileCache'
import { room } from '../shared/messages'
import { GameState } from '../shared/gameState'
import { FIRST_SHOT_TIMEOUT_MS, SHOOT_TIMEOUT_MS, LEADERBOARD_MATCH_END_MS, SPOT_PROMPT_DELAY_MS } from '../shared/constants'
import { setSpectatorCameraMode, getSpectatorCameraMode } from './gameplayCamera'
import {
  COUNTRIES,
  getLocalCountry,
  getCountryByIso,
  initLocalCountryFromSnapshot,
  assignRandomCountryIfNeeded,
  isPickerOpen,
  isCountryConfirmVisible,
  openPicker,
  closePicker,
  selectCountryFromPicker,
  flagBackground,
  flagBackgroundForPlayer,
  engineFlagBackground,
  enginePicBackground,
  bluePicBgBackground,
  redPicBgBackground,
  facePicBackground,
  scoreboardBadgeF7Background,
  scoreboardBadgeH7Background,
  scoreboardBadgeE7Background,
  splashStartButtonBackground,
  splashStartButtonAspect,
  atlasCellBackground
} from './countryStore'
import {
  logoBackground,
  scoreboardBackground,
  welcomeChooseSpotOverlayBackground,
  welcomeChooseSpotOverlayAspect,
  pickDirectionTitleDiveBackground,
  pickDirectionTitleShootBackground,
  pickDirectionTitleAspect,
  pickDirectionLeftBackground,
  pickDirectionCenterBackground,
  pickDirectionRightBackground,
  pickDirectionLeftSelectedBackground,
  pickDirectionCenterSelectedBackground,
  pickDirectionRightSelectedBackground,
  waitingOpponentTitleBackground,
  waitingOpponentTitleAspect,
  waitingOpponentPvEButtonBackground,
  waitingOpponentCancelButtonBackground,
  waitingOpponentButtonAspect,
  leaderboardFrameSliceBackground,
  leaderboardTitleBackground,
  leaderboardTitleAspect,
  countryPickerFrameSliceBackground,
  leaveMatchTitleBackground,
  leaveMatchTitleAspect,
  leaveMatchNoButtonBackground,
  leaveMatchYesButtonBackground,
  leaveMatchButtonAspect,
  goalSaveFrameSliceBackground,
  goalSaveGoalBannerBackground,
  goalSaveSaveBannerBackground,
  matchEndFrameSliceBackground,
  matchEndMessageBackground,
  matchEndMessageAspect,
  timeoutFrameSliceBackground,
  selectYourFlagBackground,
  selectYourFlagAspect,
  worldCup2026Background,
  worldCup2026Aspect,
  flagPickerPrevBackground,
  flagPickerNextBackground,
  flagPickerNavAspect,
  faceTheWinnerBackground,
  faceTheWinnerAspect,
  stayOnSpotBackground,
  stayOnSpotAspect,
  promptYesBackground,
  promptNoBackground,
  promptButtonAspect
} from './uiAtlasStore'

/**
 * React-ECS ya re-renderiza el árbol cada frame (`@dcl/react-ecs` lo registra como un system).
 * Por eso `RootUi` se ejecuta cada tick sin necesidad de `useState`/`useEffect`. Forzar setState
 * cada frame descuadra el reconciler y produce errores tipo `parent ... do not have
 * $UITransformComponent`.
 */
export function setupUi() {
  ReactEcsRenderer.setUiRenderer(RootUi, { virtualWidth: 1920, virtualHeight: 1080 })
}

/** Partida en curso (no waiting/lobby). */
function isScoreboardMatchPhase(phase: string): boolean {
  return (
    phase === GameState.SelectingDirections ||
    phase === GameState.ResolvingRound ||
    phase === GameState.MatchEnd ||
    phase === GameState.WinnerContinuePrompt
  )
}

function mySide(s: typeof clientSnapshot, me: string): 'red' | 'blue' | null {
  if (!me) return null
  if (s.redAddr && me.toLowerCase() === s.redAddr.toLowerCase()) return 'red'
  if (s.blueAddr && me.toLowerCase() === s.blueAddr.toLowerCase()) return 'blue'
  return null
}

function isKickerView(s: typeof clientSnapshot, side: 'red' | 'blue' | null): boolean {
  if (!side) return false
  const kr = s.kickerIsRed === 1
  return (kr && side === 'red') || (!kr && side === 'blue')
}

function fs(size: number): number {
  return isMobile() ? Math.ceil(size * 1.5) : size
}

/**
 * Truncate text with a trailing "..." so it fits on a single line of `widthPx`
 * at `fontSizePx`. Char width is approximated (proportional font), so we stay a
 * touch conservative to avoid overflowing the container on mobile.
 */
function ellipsize(text: string, widthPx: number, fontSizePx: number): string {
  const charW = fontSizePx * 0.58
  const maxChars = Math.floor(widthPx / charW)
  if (text.length <= maxChars) return text
  const keep = Math.max(1, maxChars - 2)
  return text.slice(0, keep).trimEnd() + '...'
}

type NinthSlice = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
type SliceBg = (ninth: NinthSlice) => ReturnType<typeof countryPickerFrameSliceBackground>

/** Generic nine-slice frame from any atlas cell helper, filling its relative parent. */
function nineSliceFrame(sliceBg: SliceBg, slicePx: number, inset: number) {
  return (
    <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0, right: 0, bottom: 0 }, zIndex: 0 }}>
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: slicePx, height: slicePx }} uiBackground={sliceBg(1)} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: slicePx, height: slicePx }} uiBackground={sliceBg(3)} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 0, left: 0 }, width: slicePx, height: slicePx }} uiBackground={sliceBg(7)} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 0, right: 0 }, width: slicePx, height: slicePx }} uiBackground={sliceBg(9)} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: inset, right: inset }, height: slicePx }} uiBackground={sliceBg(2)} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 0, left: inset, right: inset }, height: slicePx }} uiBackground={sliceBg(8)} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: inset, bottom: inset, left: 0 }, width: slicePx }} uiBackground={sliceBg(4)} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: inset, bottom: inset, right: 0 }, width: slicePx }} uiBackground={sliceBg(6)} />
      <UiEntity uiTransform={{ positionType: 'absolute', position: { top: inset, bottom: inset, left: inset, right: inset } }} uiBackground={sliceBg(5)} />
    </UiEntity>
  )
}

/** Nine-slice frame from the flag-selector atlas cell (B4), filling its relative parent. */
function cpNineSliceFrame(slicePx: number, inset: number) {
  return nineSliceFrame(countryPickerFrameSliceBackground, slicePx, inset)
}

/** Scoreboard pic/flag sizes in px; ×1.5 on mobile (same factor as fs). */
function sbPx(size: number): number {
  return isMobile() ? Math.ceil(size * 1.5) : size
}

/** Profile pic (SB_PIC, ×1.5 en mobile). */
function sbProfileSize(): number {
  return sbPx(SB_PIC)
}

/** F7/E7: profile pic size; +25% extra en mobile. */
function sbActionBtnSize(): number {
  const base = sbProfileSize()
  return isMobile() ? Math.ceil(base * 1.2) : base
}

function vw(size: number): `${number}vw` {
  return (isMobile() ? `${size * 1.5}vw` : `${size}vw`) as `${number}vw`
}

/** Fondo verde pantalla completa (splash, confirmación). */
function welcomeScreenOverlayBackground() {
  return { color: Color4.create(0.03, 0.2, 0.05, isMobile() ? 0.7 : 0.88) }
}

/** Selector de banderas — negro, alpha un poco mayor en desktop. */
function countryPickerOverlayBackground() {
  return { color: Color4.create(0, 0, 0, isMobile() ? 0.7 : 0.98) }
}

/** Splash logo (UI_atlas A1–D3 = 4×3 celdas → 4:3). */
function splashLogoSize(): { width: number; height: number } {
  const width = isMobile() ? 480 : 540
  return { width, height: Math.floor((width * 3) / 4) }
}

function scoreboardLayout(): { width: `${number}vw`; height: `${number}vw` } {
  if (isMobile()) {
    return { width: '65vw', height: '13vw' }
  }
  return { width: '35vw', height: '7vw' }
}

/** Nombre visible en UI; normaliza legacy "Training Mode" y fuerza "GL-Bot" en PvE. */
function scoreboardSideName(name: string, fallback: string, isEngineSide: boolean): string {
  if (isEngineSide) return 'GL-Bot'
  if (name === 'Training Mode' || name === 'Training AI' || name === 'Engine') return 'GL-Bot'
  return (name && name.trim()) || fallback
}

/** Ancho útil del nombre en la columna 37.5% (virtual 1920, menos bandera + gap). */
function scoreboardNameLabelWidth(): number {
  const panelVw = isMobile() ? 0.6 : 0.3
  const colPx = Math.floor(1920 * panelVw * 0.375)
  return Math.max(48, colPx - sbPx(SB_FLAG_W) - sbPx(6))
}

function scoreboardDisplayName(name: string, fallback: string, isEngineSide: boolean): string {
  const raw = scoreboardSideName(name, fallback, isEngineSide)
  const charW = Math.max(7, Math.floor(fs(18) * 0.55))
  const maxChars = Math.max(4, Math.floor(scoreboardNameLabelWidth() / charW))
  return truncateName(raw, maxChars)
}

function scoreboardPlayerPicBackground(isEngine: boolean, addr: string) {
  if (isEngine) return enginePicBackground()
  return facePicBackground(getLeaderboardFaceUrl(addr))
}

const SB_FLAG_W = 112
const SB_FLAG_H = 84
const SB_PIC = 64

/** F7 = country, H7 = leaderboard (siempre visibles). E7 = leave match (solo en partida). */
const ScoreboardGlobalActions = () => {
  const sz = sbActionBtnSize()
  const gap = sbPx(6)
  return (
    <UiEntity
      uiTransform={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}
    >
      <Button
        value=""
        uiTransform={{ width: sz, height: sz, margin: { right: gap } }}
        uiBackground={scoreboardBadgeF7Background()}
        onMouseDown={() => openPicker()}
      />
      <Button
        value=""
        uiTransform={{ width: sz, height: sz }}
        uiBackground={scoreboardBadgeH7Background()}
        onMouseDown={() => openLeaderboard()}
      />
    </UiEntity>
  )
}

function executeLeaveMatch(): void {
  const snap = readPenaltySnapshot()
  leaveMatchConfirmOpen = false
  if (isScoreboardMatchPhase(snap.phase)) hideScoreboardAfterLeave = true
  room.send('leaveMatch', {})
}

const ScoreboardLeaveButton = () => {
  const sz = sbActionBtnSize()
  const gap = sbPx(6)
  return (
    <Button
      value=""
      uiTransform={{ width: sz, height: sz, margin: { left: gap } }}
      uiBackground={scoreboardBadgeE7Background()}
      onMouseDown={() => {
        const snap = readPenaltySnapshot()
        if (snap.hasActiveMatch !== 1) return
        leaveMatchConfirmOpen = true
      }}
    />
  )
}

const LEADERBOARD_PANEL_WIDTH_VW = 30
const LEADERBOARD_PANEL_WIDTH_MOBILE_VW = 45

// UI_choose.png is 1024x1024; each DIVE/SHOOT slice is half height => aspect 2:1 (w:h)
// Pick sizes use isMobile() inside RootUi only — not at module load (Creator Hub loads as desktop).
const PICK_BTN_TINT_IDLE = 0.72
const PICK_BTN_TINT_HOVER = 1
/** flags.png atlas cell for the "selected" badge drawn over the chosen L/C/R button. */
const PICK_SELECTED_BADGE_COORD = 'H8'

let lbShowUntilMs = 0
const LEADERBOARD_TOP_N = 10
const LEADERBOARD_UI_MS = 30_000
/** Earliest time the "face the winner" / "keep playing" prompts may show. */
let promptsShowAfterMs = 0

export function openLeaderboard(): void {
  lbShowUntilMs = Date.now() + LEADERBOARD_UI_MS
  prefetchLeaderboardFaces(
    getLeaderboardRows(readPenaltySnapshot().leaderboardJson, LEADERBOARD_TOP_N).map((r) => r.addr)
  )
}

export function closeLeaderboard(): void {
  lbShowUntilMs = 0
}

let prevPhase = ''

/**
 * Per-kick result history for the scoreboard ball icons (goal=1 / save=0), in shot order per side.
 * Filled client-side when each shot's result is revealed (≈ when the Goal/Save screen shows);
 * "no absolute sync" by design. Reset when a new match/game starts.
 */
let shotResultsRed: number[] = []
let shotResultsBlue: number[] = []
let lastRecordedShotIndex = -1
let prevShotIndexForBalls = 0
let prevHadActiveMatchForBalls = false

/** Local countdown for the inactivity timeout: re-anchored at the start of every pick round
 *  (rising edge of SelectingDirections). Counting down with the local clock from a fixed
 *  per-shot budget sidesteps clock skew / sync lag and resets cleanly each shot. */
let prevPickRoundActive = false
let timeoutEndsAtLocalMs = 0
let pickerPage = 0
let prevPickerOpen = false
let splashDismissed = false
/** "Pick a spot" banner cerrado esta sesión; se resetea en reload (resetSplashUi). */
let welcomeChooseSpotDismissed = false
let hoverPickL = false
let hoverPickC = false
let hoverPickR = false
/** Direction the local player picked this round; null until clicked. Drives the H8
 *  "selected" badge drawn over the chosen L/C/R button. Reset each round. */
let selectedPickDir: 'L' | 'C' | 'R' | null = null
let hoverWaitPvE = false
let hoverWaitCancel = false
let hoverSplashStart = false
/** Offset entre reloj servidor y cliente, cacheado al primer snapshot válido (solo para debug). */
let serverClockOffset: number | null = null
/** Timestamp local del último click a un spot. Garantiza que el UI de "Waiting" aparezca incluso si
 * el servidor salta WaitingOpponent (e.g. cuando ya había alguien esperando y el match arranca al instante). */
let lastSpotClickAt = 0
const LOCAL_WAIT_MIN_MS = 3000
/** Ancla local del countdown cosmético de waiting. Arranca cuando la UI se vuelve visible y baja 30→0. */
let waitDisplayAnchorMs = 0
const WAIT_DISPLAY_TOTAL_S = 30
/** Ancla local del countdown del cartel "Keep playing?" (mismo estilo que waiting, 30→0). */
let streakDisplayAnchorMs = 0
/** Oculta scoreboard local tras abandonar; se resetea cuando no hay partida activa. */
let hideScoreboardAfterLeave = false
let leaveMatchConfirmOpen = false
/** Panel de debug (state, sync, timeout…) abierto con el botón "i". */
let debugInfoOpen = false

/** Local "NO" dismissal of the current "Face the winner" challenge (per winner). */
let spectatorChallengeDismissedFor = ''

/** setup.ts registra aquí cómo ocupar un spot + mover al jugador (evita import circular). */
let takeSpotHandler: ((team: 'red' | 'blue') => void) | null = null
export function registerTakeSpotHandler(fn: (team: 'red' | 'blue') => void): void {
  takeSpotHandler = fn
}

export function markSpotClickedLocally(): void {
  lastSpotClickAt = Date.now()
}

export function dismissSplash(): void {
  splashDismissed = true
}

export function dismissWelcomeChooseSpot(): void {
  welcomeChooseSpotDismissed = true
}

export function resetSplashUi(): void {
  splashDismissed = false
  welcomeChooseSpotDismissed = false
  hideScoreboardAfterLeave = false
  leaveMatchConfirmOpen = false
  debugInfoOpen = false
  hoverSplashStart = false
}

const RootUi = () => {
  readPenaltySnapshot()
  const s = clientSnapshot
  const me = getPlayer()?.userId || ''
  const myName = getPlayer()?.name || me
  const side = mySide(s, me)
  const kicker = isKickerView(s, side)

  // Para el debug "Timeout in" (inactivityDeadlineMs) usamos offset cacheado.
  if (serverClockOffset === null && s.serverNowMs > 0) {
    serverClockOffset = s.serverNowMs - Date.now()
  }
  const serverApproxNow = Date.now() + (serverClockOffset ?? 0)

const lbRows = getLeaderboardRows(s.leaderboardJson, LEADERBOARD_TOP_N)

  if (prevPhase !== GameState.MatchEnd && s.phase === GameState.MatchEnd) {
    // Block the spot prompts while the winner banner + match-end leaderboard show.
    promptsShowAfterMs = Number.MAX_SAFE_INTEGER
  }
  if (prevPhase === GameState.MatchEnd && s.phase !== GameState.MatchEnd) {
    lbShowUntilMs = Date.now() + LEADERBOARD_MATCH_END_MS
    // Reveal the prompts a beat after the leaderboard auto-hides.
    promptsShowAfterMs = lbShowUntilMs + SPOT_PROMPT_DELAY_MS
  }
  // Clear the picked direction when the pick window closes, so the badge only shows
  // on the chosen button during SelectingDirections and resets each round.
  if (s.phase !== GameState.SelectingDirections) selectedPickDir = null
  // ── Scoreboard shot history (goal/save per kick) ──────────────────────────────
  // Reset on a fresh match (hasActiveMatch rising edge) or a new game (shotIndex back to 0).
  if ((s.hasActiveMatch === 1 && !prevHadActiveMatchForBalls) || s.shotIndex < prevShotIndexForBalls) {
    shotResultsRed = []
    shotResultsBlue = []
    lastRecordedShotIndex = -1
  }
  // Record each shot's outcome once, when its result is revealed (Goal/Save screen appears).
  if (s.phase === GameState.ResolvingRound && !!s.resultLine && s.shotIndex !== lastRecordedShotIndex) {
    lastRecordedShotIndex = s.shotIndex
    const goal = s.lastRoundWasGoal === 1 ? 1 : 0
    if (s.kickerIsRed === 1) shotResultsRed.push(goal)
    else shotResultsBlue.push(goal)
  }
  prevShotIndexForBalls = s.shotIndex
  prevHadActiveMatchForBalls = s.hasActiveMatch === 1

  prevPhase = s.phase
  const showLeaderboard = Date.now() < lbShowUntilMs
  const showCountryPicker = isPickerOpen()
  const showCountryConfirm = splashDismissed && isCountryConfirmVisible()

  // Determine if engine is red or blue in PvE
  const isPvE = s.mode === 'pve'
  const engineIsRed = isPvE && s.pveHumanIsRed === 0
  const engineIsBlue = isPvE && s.pveHumanIsRed === 1
  const winnerEngineSide =
    isPvE &&
    !!s.winnerSide &&
    ((s.winnerSide === 'red' && engineIsRed) || (s.winnerSide === 'blue' && engineIsBlue))

  /** Partida en curso (oculta welcome para nuevos hasta que termine). No incluye solo “esperando rival”. */
  const showWelcome =
    splashDismissed &&
    !welcomeChooseSpotDismissed &&
    !showLeaderboard &&
    !showCountryConfirm &&
    s.hasActiveMatch === 0 &&
    s.phase === GameState.LobbyIdle
  // Limpiar la bandera local cuando la partida ya está corriendo (no estamos esperando más).
  if (lastSpotClickAt > 0 && s.phase !== GameState.WaitingOpponent && s.phase !== GameState.LobbyIdle) {
    lastSpotClickAt = 0
  }
  const localWaitVisible = lastSpotClickAt > 0 && (Date.now() - lastSpotClickAt) < LOCAL_WAIT_MIN_MS
  const showWaiting =
    splashDismissed &&
    (localWaitVisible || (side && s.phase === GameState.WaitingOpponent && !(s.redAddr && s.blueAddr && s.mode !== 'pve')))
  // Ancla el countdown cosmético: arranca en 30 cuando la UI pasa de oculta a visible.
  if (showWaiting) {
    if (waitDisplayAnchorMs === 0) waitDisplayAnchorMs = Date.now()
  } else {
    waitDisplayAnchorMs = 0
  }
  const waitDisplayLeft = waitDisplayAnchorMs > 0
    ? Math.max(0, WAIT_DISPLAY_TOTAL_S - Math.floor((Date.now() - waitDisplayAnchorMs) / 1000))
    : WAIT_DISPLAY_TOTAL_S
  const showPick =
    splashDismissed && s.phase === GameState.SelectingDirections && side && (s.mode === 'pvp' || (s.mode === 'pve' && !!side))

  // Inactivity countdown above the pick panel. Reset to the FULL budget at the start of
  // every pick round (rising edge of SelectingDirections) and count down with the local
  // clock — each shot starts fresh at 60s (shots 0/1) or 30s (shot 2+), leftover ignored.
  const pickRoundActive = s.phase === GameState.SelectingDirections
  if (pickRoundActive && !prevPickRoundActive) {
    const budgetMs = s.suddenDeath === 0 && s.shotIndex <= 1 ? FIRST_SHOT_TIMEOUT_MS : SHOOT_TIMEOUT_MS
    timeoutEndsAtLocalMs = Date.now() + budgetMs
  }
  prevPickRoundActive = pickRoundActive
  const timeoutRemainingSec =
    pickRoundActive && timeoutEndsAtLocalMs > 0
      ? Math.max(0, Math.ceil((timeoutEndsAtLocalMs - Date.now()) / 1000))
      : -1
  // Surface it for the last 20s in every case (both the 60s and 30s budgets).
  const showTimeoutCountdown = showPick && timeoutRemainingSec >= 0 && timeoutRemainingSec <= 20
  // In the last 10s it blinks once per second (700ms at full, 300ms dimmed to 50%).
  // opacity on a UiTransform accumulates across children, so it dims the frame + text together.
  const timeoutBlink = timeoutRemainingSec >= 0 && timeoutRemainingSec <= 10
  const timeoutOpacity = timeoutBlink && Date.now() % 1000 >= 700 ? 0.5 : 1

  // Spectators (in scene but not playing) get a camera toggle, but only while the match is
  // actually being played. It hides the moment the match ends (winner or abandonment, both
  // → MatchEnd) and comes back when the next match's first pick round starts.
  const matchInPlay = s.phase === GameState.SelectingDirections || s.phase === GameState.ResolvingRound
  const showCameraSelector = splashDismissed && matchInPlay && !side
  const cameraMode = getSpectatorCameraMode()

  const pickMobile = isMobile()
  const pickPanelWidth = pickMobile ? '40vw' : '25vw'
  const pickPanelWidthPx = Math.floor(1920 * (pickMobile ? 0.4 : 0.25))
  const pickBtnWidthCap = Math.floor((pickPanelWidthPx * 0.9) / 3)
  const pickBtnWidth = Math.min(pickMobile ? 169 : 130, pickBtnWidthCap)
  const pickBtnHeight = pickBtnWidth
  const pickLcrRowWidthPx = Math.floor(pickPanelWidthPx * 0.9)
  const pickTitleWidth = Math.min(pickBtnWidth * 3, pickLcrRowWidthPx)
  // Alto derivado del aspect real del sprite para no estirarlo.
  const pickTitleHeight = Math.floor(pickTitleWidth / pickDirectionTitleAspect())
  const pickPanelPadPx = pickMobile ? 14 : 10
  const pickTitleMarginTopPx = pickMobile ? 16 : 12
  /** Respiro arriba/abajo del título DIVE/SHOOT (más arriba que abajo). */
  const pickTitleMarginTopY = pickMobile ? 30 : 21
  const pickTitleMarginBottomY = pickMobile ? 20 : 14
  const pickPanelGapPx = pickMobile ? -20 : -20
  /** Margin inferior del panel dive/shoot — distancia al borde de pantalla. */
  const pickPanelMarginBottom = pickMobile ? '1vh' : '3vh'
  /** Solo baja el fondo nine-slice; título y picker (L/C/R) no se mueven. */
  const pickPanelBgShiftDownPx = pickMobile ? 32 : 24
  /** Alto del contenido (título + picker). */
  const pickPanelContentHeightPx =
    pickPanelPadPx * 2 +
    pickTitleMarginTopPx +
    pickTitleMarginTopY +
    pickTitleMarginBottomY +
    pickTitleHeight +
    pickPanelGapPx +
    pickBtnHeight
  const pickPanelOuterHeightPx = pickPanelContentHeightPx + pickPanelBgShiftDownPx

  // "Selected" badge (flags.png H8) drawn as a child of the chosen L/C/R button.
  // For now: centered on X, anchored to the button's bottom (bottom: 0). Tweak here.
  const pickBadgeSize = Math.floor(pickBtnWidth * 0.45)
  const pickSelectedBadge = () => (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        position: { bottom: 0, left: Math.floor((pickBtnWidth - pickBadgeSize) / 2) },
        width: pickBadgeSize,
        height: pickBadgeSize
      }}
      uiBackground={atlasCellBackground(PICK_SELECTED_BADGE_COORD)}
    />
  )

  const pickDirectionPanel = (titleBg: ReturnType<typeof pickDirectionTitleDiveBackground>) => (
    <UiEntity
      uiTransform={{
        width: pickPanelWidth,
        height: pickPanelOuterHeightPx,
        margin: { bottom: pickPanelMarginBottom },
        positionType: 'relative'
      }}
    >
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: pickPanelBgShiftDownPx, left: 0 },
          width: '100%',
          height: pickPanelContentHeightPx,
          zIndex: 0
        }}
      >
        {cpNineSliceFrame(cpSlicePx, cpInset)}
      </UiEntity>
      <UiEntity
        uiTransform={{
          positionType: 'relative',
          width: '100%',
          height: pickPanelContentHeightPx,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: { top: pickPanelPadPx, bottom: pickPanelPadPx },
          zIndex: 1
        }}
      >
      <UiEntity
        uiTransform={{
          width: '100%',
          margin: { top: pickTitleMarginTopPx },
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center'
        }}
      >
        <UiEntity
          uiTransform={{ width: pickTitleWidth, height: pickTitleHeight, margin: { top: pickTitleMarginTopY, bottom: pickTitleMarginBottomY } }}
          uiBackground={titleBg}
        />
      </UiEntity>
      <UiEntity uiTransform={{ width: 1, height: pickPanelGapPx }} />
      <UiEntity
        uiTransform={{
          width: '90%',
          maxWidth: '90%',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <UiEntity
          uiTransform={{ width: pickBtnWidth, height: pickBtnHeight, positionType: 'relative' }}
          uiBackground={{
            ...(selectedPickDir === 'L' ? pickDirectionLeftSelectedBackground() : pickDirectionLeftBackground()),
            color: Color4.create(1, 1, 1, hoverPickL ? PICK_BTN_TINT_HOVER : PICK_BTN_TINT_IDLE)
          }}
          onMouseDown={() => { selectedPickDir = 'L'; room.send('submitDirection', { dir: 'L' }) }}
          onMouseEnter={() => { hoverPickL = true }}
          onMouseLeave={() => { hoverPickL = false }}
        >
          {selectedPickDir === 'L' && pickSelectedBadge()}
        </UiEntity>
        <UiEntity
          uiTransform={{ width: pickBtnWidth, height: pickBtnHeight, positionType: 'relative' }}
          uiBackground={{
            ...(selectedPickDir === 'C' ? pickDirectionCenterSelectedBackground() : pickDirectionCenterBackground()),
            color: Color4.create(1, 1, 1, hoverPickC ? PICK_BTN_TINT_HOVER : PICK_BTN_TINT_IDLE)
          }}
          onMouseDown={() => { selectedPickDir = 'C'; room.send('submitDirection', { dir: 'C' }) }}
          onMouseEnter={() => { hoverPickC = true }}
          onMouseLeave={() => { hoverPickC = false }}
        >
          {selectedPickDir === 'C' && pickSelectedBadge()}
        </UiEntity>
        <UiEntity
          uiTransform={{ width: pickBtnWidth, height: pickBtnHeight, positionType: 'relative' }}
          uiBackground={{
            ...(selectedPickDir === 'R' ? pickDirectionRightSelectedBackground() : pickDirectionRightBackground()),
            color: Color4.create(1, 1, 1, hoverPickR ? PICK_BTN_TINT_HOVER : PICK_BTN_TINT_IDLE)
          }}
          onMouseDown={() => { selectedPickDir = 'R'; room.send('submitDirection', { dir: 'R' }) }}
          onMouseEnter={() => { hoverPickR = true }}
          onMouseLeave={() => { hoverPickR = false }}
        >
          {selectedPickDir === 'R' && pickSelectedBadge()}
        </UiEntity>
      </UiEntity>
      </UiEntity>
    </UiEntity>
  )
  const showResult = splashDismissed && s.phase === GameState.ResolvingRound && !!s.resultLine
  const showMatchEnd = splashDismissed && s.phase === GameState.MatchEnd && !!s.winnerName
  // Spot prompts wait until the match-end leaderboard has hidden (+ a small delay).
  const spotPromptsReady = Date.now() >= promptsShowAfterMs
  const showStreak =
    splashDismissed &&
    spotPromptsReady &&
    s.phase === GameState.WinnerContinuePrompt &&
    !!me &&
    !!s.winnerStreakAddr &&
    me.toLowerCase() === s.winnerStreakAddr.toLowerCase()
  // Cosmetic 30→0 countdown for the "Keep playing?" prompt, anchored when it appears
  // (same style as the waiting countdown). The server enforces the matching 30s limit.
  if (showStreak) {
    if (streakDisplayAnchorMs === 0) streakDisplayAnchorMs = Date.now()
  } else {
    streakDisplayAnchorMs = 0
  }
  const streakDisplayLeft = streakDisplayAnchorMs > 0
    ? Math.max(0, WAIT_DISPLAY_TOTAL_S - Math.floor((Date.now() - streakDisplayAnchorMs) / 1000))
    : WAIT_DISPLAY_TOTAL_S
  // The match loser is on cooldown only when others are waiting (>2 in scene): they
  // don't get to challenge. With just 2 players, the loser may rematch immediately.
  const meIsLoser = !!me && !!s.loserAddr && me.toLowerCase() === s.loserAddr.toLowerCase()
  const loserOnCooldown = meIsLoser && s.playersInScene > 2
  const showSpectatorChallenge =
    splashDismissed &&
    spotPromptsReady &&
    s.spectatorChallengeActive === 1 &&
    !!me &&
    !!s.winnerStreakAddr &&
    me.toLowerCase() !== s.winnerStreakAddr.toLowerCase() &&
    !loserOnCooldown &&
    spectatorChallengeDismissedFor !== s.winnerStreakAddr.toLowerCase()

  // Prefetch scoreboard faces whenever active players change
  if (s.hasActiveMatch === 1) prefetchLeaderboardFaces([s.redAddr, s.blueAddr].filter(Boolean))
  if (showMatchEnd && s.winnerSide && !winnerEngineSide) {
    const winAddr = s.winnerSide === 'red' ? s.redAddr : s.blueAddr
    if (winAddr) prefetchLeaderboardFaces([winAddr])
  }
  const winnerWinAddr = s.winnerSide === 'red' ? s.redAddr : s.blueAddr
  const winnerFaceUrl = winnerEngineSide ? undefined : getLeaderboardFaceUrl(winnerWinAddr)

  // Seed local country from server snapshot (first time only)
  const myCountryInSnapshot = side === 'red' ? s.redCountry : side === 'blue' ? s.blueCountry : ''
  initLocalCountryFromSnapshot(myCountryInSnapshot)
  if (side) assignRandomCountryIfNeeded(myCountryInSnapshot)

  if (s.phase === GameState.LobbyIdle || s.phase === GameState.WaitingOpponent) {
    hideScoreboardAfterLeave = false
    leaveMatchConfirmOpen = false
  } else if (isScoreboardMatchPhase(s.phase) && !isScoreboardMatchPhase(prevPhase)) {
    hideScoreboardAfterLeave = false
  }
  if (s.hasActiveMatch !== 1) leaveMatchConfirmOpen = false
  const showScoreboard = splashDismissed && isScoreboardMatchPhase(s.phase) && !hideScoreboardAfterLeave

  if (showCountryPicker && !prevPickerOpen) pickerPage = 0
  prevPickerOpen = showCountryPicker
  const FLAGS_PER_ROW = 6
  const FLAG_ROWS = 2
  const FLAG_PICKER_BTN_W = 168
  const FLAG_PICKER_BTN_H = 126
  const FLAG_PICKER_CELL_MARGIN_X = 8
  const pickerGridWidthPx = FLAGS_PER_ROW * (FLAG_PICKER_BTN_W + FLAG_PICKER_CELL_MARGIN_X)
  const cpSlicePx = isMobile() ? 34 : 28
  const cpSliceOverlap = 1
  const cpInset = cpSlicePx - cpSliceOverlap
  // "timeout in Ns" countdown pill (D5 nine-slice), anchored just under the scoreboard.
  const timeoutFsPx = Math.floor(fs(24) * 1.2)
  const timeoutSlicePx = Math.floor((cpSlicePx / 2) * 1.2)
  const timeoutInset = timeoutSlicePx - cpSliceOverlap
  const timeoutPadX = 4 // L/R padding inside the frame (half of the previous 8/side)
  const timeoutBoxW = Math.floor(14 * timeoutFsPx * 0.6) + 2 * timeoutSlicePx + 2 * timeoutPadX
  const timeoutBoxH = timeoutSlicePx * 2 + timeoutFsPx + 10
  // Sits right below the scoreboard (height 7vw desktop / 13vw mobile) with a small gap.
  const timeoutTopMargin = (isMobile() ? '14vw' : '7.6vw') as `${number}vw`
  const cpPanelWidthPx = pickerGridWidthPx + 2 * (cpSlicePx + 16)
  const PICKER_PAGE_BTN_W = 140
  const PICKER_PAGE_BTN_H = 88
  // Botones prev/next 50% más grandes; alto derivado del aspect real del sprite para no estirarlo.
  const pickerNavBtnW = Math.floor(PICKER_PAGE_BTN_W * 1.5)
  const pickerNavBtnH = Math.floor(pickerNavBtnW / flagPickerNavAspect())
  const PICKER_ACCENT = Color4.create(0.898, 0.333, 0.98, 1)
  const leaveConfirmBtnW = Math.floor(PICKER_PAGE_BTN_W * 1.3 * 1.2)
  // Alto derivado del aspect real del sprite para no estirarlo.
  const leaveConfirmBtnH = Math.floor(leaveConfirmBtnW / leaveMatchButtonAspect())
  // Gap negativo entre Yes/No — los sprites ya traen espacio vacío a los lados.
  const leaveConfirmBtnGapPx = -Math.floor(leaveConfirmBtnW * 0.14)
  // Botones Yes/No de los prompts (Face the winner / Keep playing), +20% desktop / +40% mobile.
  const promptBtnW = Math.floor(fs(170) * (isMobile() ? 1.4 : 1.2))
  const promptBtnH = Math.floor(promptBtnW / promptButtonAspect())
  // Gap negativo entre Yes/No — los sprites ya traen espacio vacío a los lados.
  const promptBtnGapPx = -Math.floor(promptBtnW * 0.14)
  const leaveConfirmPanelW = leaveConfirmBtnW * 2 + 96
  const leaveConfirmTitleW = Math.floor(leaveConfirmPanelW * 0.9)
  // Alto derivado del aspect real del sprite para no estirarlo.
  const leaveConfirmTitleH = Math.floor(leaveConfirmTitleW / leaveMatchTitleAspect())
  const leaveConfirmPadY = cpSlicePx + 8
  const leaveConfirmPadX = cpSlicePx + 36
  const resultIsGoal = s.resultLine.startsWith('GOAL')
  const resultSlicePx = Math.floor(cpSlicePx / 2)
  const resultInset = resultSlicePx - cpSliceOverlap
  const resultBannerW = isMobile() ? 240 : 280
  const resultBannerH = Math.floor(resultBannerW / 4)
  const resultPadY = Math.floor((cpSlicePx + 12) / 2)
  const resultPadX = Math.floor((cpSlicePx + 28) / 2)
  const resultPanelW = resultBannerW + 2 * resultPadX
  const countryConfirmFlagW = FLAG_PICKER_BTN_W * 2
  const countryConfirmFlagH = FLAG_PICKER_BTN_H * 2
  const cfPanelWidthPx = countryConfirmFlagW + 2 * (cpSlicePx + 40)
  const countryConfirmCountry = showCountryConfirm ? getCountryByIso(getLocalCountry()) : undefined
  const PAGE_SIZE = FLAGS_PER_ROW * FLAG_ROWS
  const TOTAL_PAGES = Math.ceil(COUNTRIES.length / PAGE_SIZE)
  const visibleCountries = COUNTRIES.slice(pickerPage * PAGE_SIZE, (pickerPage + 1) * PAGE_SIZE)
  const pickerSelectedName = getCountryByIso(getLocalCountry())?.name ?? '—'

  const cameraBtnW = pickMobile ? 180 : 140
  const cameraBtnH = pickMobile ? 96 : 72
  const cameraPanelPadY = cpSlicePx + 12
  const cameraPanelPadX = cpSlicePx + 18
  const cameraBtnActive = Color4.create(0.2, 0.55, 0.9, 1)
  const cameraBtnIdle = Color4.create(0.28, 0.28, 0.34, 1)
  // Shrink the panel to its content (widest of the title or the two buttons) + padding,
  // instead of a fixed 25vw/40vw.
  const cameraTitle = 'Point of View'
  const cameraLabelW = Math.ceil(cameraTitle.length * fs(40) * 0.6)
  const cameraContentW = Math.max(cameraLabelW, cameraBtnW * 2 + 10)
  const cameraPanelW = cameraContentW + 2 * cameraPanelPadX
  const cameraSelectorPanel = (
    <UiEntity
      uiTransform={{
        width: cameraPanelW,
        margin: { bottom: pickPanelMarginBottom },
        positionType: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch'
      }}
    >
      {/* Nine-slice frame from the flag selector cell (B4) — no green fill. */}
      {cpNineSliceFrame(cpSlicePx, cpInset)}
      <UiEntity
        uiTransform={{
          positionType: 'relative',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: { top: cameraPanelPadY, bottom: cameraPanelPadY, left: cameraPanelPadX, right: cameraPanelPadX },
          zIndex: 1
        }}
      >
        <Label value={cameraTitle} fontSize={fs(40)} color={Color4.White()} textAlign="middle-center" uiTransform={{ margin: { bottom: 10 } }} />
        <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', justifyContent: 'center' }}>
          <Button
            value="Match"
            fontSize={fs(28)}
            color={Color4.White()}
            uiTransform={{ width: cameraBtnW, height: cameraBtnH, margin: { right: 10 } }}
            uiBackground={{ color: cameraMode === 'match' ? cameraBtnActive : cameraBtnIdle }}
            onMouseDown={() => setSpectatorCameraMode('match')}
          />
          <Button
            value="Player"
            fontSize={fs(28)}
            color={Color4.White()}
            uiTransform={{ width: cameraBtnW, height: cameraBtnH }}
            uiBackground={{ color: cameraMode === 'free' ? cameraBtnActive : cameraBtnIdle }}
            onMouseDown={() => setSpectatorCameraMode('free')}
          />
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )

  const sb = scoreboardLayout()
  const sbPic = sbProfileSize()
  const sbFlagW = sbPx(SB_FLAG_W)
  const sbFlagH = sbPx(SB_FLAG_H)
  const sbRowH = Math.max(sbPic, sbFlagH)
  const sbNameH = Math.ceil(fs(18) * 1.2)
  const sbNameW = scoreboardNameLabelWidth()

  // Shots indicator: one sprite per kick under each name — F8 (goal) or G7 (save). Each appears
  // when that shot's result is revealed (≈ when the Goal/Save screen shows). History is tracked
  // client-side above (shotResultsRed/Blue), in shot order, and grows through sudden death.
  const sbBall = isMobile() ? 26 : 16
  const sbBallGap = sbPx(3)
  // reverse=true (blue, right-aligned): row-reverse lays shot 1 on the right and grows each new
  // shot toward the left → reads 5,4,3,2,1. (Array stays in natural order to keep keys stable.)
  const shotBallsRow = (results: number[], reverse = false) => (
    <UiEntity
      uiTransform={{ display: 'flex', flexDirection: reverse ? 'row-reverse' : 'row', alignItems: 'center' }}
    >
      {results.map((r, i) => (
        <UiEntity
          key={i}
          uiTransform={{
            width: sbBall,
            height: sbBall,
            // Gap entre ítems: del lado opuesto al avance según la dirección.
            margin: reverse ? { right: i === 0 ? 0 : sbBallGap } : { left: i === 0 ? 0 : sbBallGap }
          }}
          uiBackground={atlasCellBackground(r === 1 ? 'F8' : 'G7')}
        />
      ))}
    </UiEntity>
  )

  const waitPanelW = Math.floor((isMobile() ? 820 : 480) * 1.2)
  const waitPanelH = Math.floor(waitPanelW / 2)
  const waitTitleWidth = Math.floor(waitPanelW * 0.85)
  // Alto derivado del aspect real del sprite para no estirarlo.
  const waitTitleHeight = Math.floor(waitTitleWidth / waitingOpponentTitleAspect())

  // Welcome "pick a spot": overlay con aspect real centrado, panel un poco más alto para
  // dejar padding arriba/abajo (si solo achicara el overlay se estiraría).
  const welcomePanelW = isMobile() ? 800 : 480
  const welcomeOverlayW = Math.floor(welcomePanelW * 0.8)
  const welcomeOverlayH = Math.floor(welcomeOverlayW / welcomeChooseSpotOverlayAspect())
  const welcomePanelPadY = isMobile() ? 70 : 44
  const welcomePanelH = welcomeOverlayH + welcomePanelPadY * 2
  const waitBtnW = Math.floor((isMobile() ? 220 * 1.3 * 1.4 : 180) * 1.2)
  // Alto derivado del aspect real del sprite para no estirarlo.
  const waitBtnH = Math.floor(waitBtnW / waitingOpponentButtonAspect())
  // Gap horizontal entre los 2 botones — negativo porque los sprites traen espacio vacío a los lados.
  const waitBtnGapPx = -Math.floor(waitBtnW * 0.14)

  const lbPanelWidthPx = Math.floor(1920 * ((isMobile() ? LEADERBOARD_PANEL_WIDTH_MOBILE_VW : LEADERBOARD_PANEL_WIDTH_VW) / 100))
  const lbSlicePx = isMobile() ? 34 : 28
  /** 1px overlap between H1 ninths to hide sub-pixel seams. */
  const lbSliceOverlap = 1
  const lbInset = lbSlicePx - lbSliceOverlap
  const lbRowH = vw(2)
  const lbFaceSz = vw(2)
  const lbColGap = 5
  const lbRankW = vw(2)
  const lbFlagColW = vw(3)
  const lbNameW = vw(10)
  const lbWinsW = vw(5)
  const lbWinsTextColor = Color4.create(1, 0.9, 0.3, 1)
  const lbRowOddBg = { color: Color4.create(1, 0.9, 0.3, 0.03) }
  const lbContentWidthPx = lbPanelWidthPx - 2 * (lbSlicePx + 10)
  const lbTitleWidth = Math.floor(lbContentWidthPx * 0.6)
  // Alto derivado del aspect real del sprite para no estirarlo.
  const lbTitleHeight = Math.floor(lbTitleWidth / leaderboardTitleAspect())

  return (
    <UiEntity
      uiTransform={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start'
      }}
    >
      {/* ========== SCOREBOARD ========== */}
      {showScoreboard && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            zIndex: 55
          }}
        >
          <UiEntity
            uiTransform={{
              width: sb.width,
              height: sb.height
            }}
          >
          <UiEntity
            uiTransform={{
              width: '100%',
              height: '100%',
              padding: isMobile()
                ? { top: 8, left: 12, right: 12, bottom: 8 }
                : { top: 0, left: 12, right: 12, bottom: 6 },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              positionType: 'relative'
            }}
          >
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 0, left: 0 },
                width: '100%',
                height: '100%',
                zIndex: 0
              }}
              uiBackground={scoreboardBackground()}
            />
            <UiEntity
              uiTransform={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                positionType: 'relative',
                zIndex: 1
              }}
            >
            {/* Fila 1: banderas, avatares y marcador */}
            <UiEntity
              uiTransform={{
                width: '100%',
                height: sbRowH,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center'
              }}
            >
              <UiEntity
                uiTransform={{
                  width: '37.5%',
                  height: sbRowH,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-end'
                }}
              >
                {engineIsBlue ? (
                  <Button
                    value=""
                    uiTransform={{ width: sbFlagW, height: sbFlagH, margin: { right: sbPx(6) } }}
                    uiBackground={engineFlagBackground()}
                  />
                ) : (
                  <Button
                    value=""
                    uiTransform={{ width: sbFlagW, height: sbFlagH, margin: { right: sbPx(6) } }}
                    uiBackground={flagBackgroundForPlayer(s.blueCountry, s.blueAddr)}
                    onMouseDown={() => { if (side === 'blue') openPicker() }}
                  />
                )}
                <UiEntity uiTransform={{ width: sbPic, height: sbPic }} uiBackground={bluePicBgBackground()}>
                  <UiEntity
                    uiTransform={{ width: sbPic, height: sbPic }}
                    uiBackground={scoreboardPlayerPicBackground(engineIsBlue, s.blueAddr)}
                  />
                </UiEntity>
              </UiEntity>

              <UiEntity
                uiTransform={{
                  width: '25%',
                  height: sbRowH,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Label
                  value={`${s.blueScore} - ${s.redScore}`}
                  fontSize={fs(45)}
                  color={Color4.White()}
                  textAlign="middle-center"
                />
              </UiEntity>

              <UiEntity
                uiTransform={{
                  width: '37.5%',
                  height: sbRowH,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start'
                }}
              >
                <UiEntity uiTransform={{ width: sbPic, height: sbPic, margin: { right: sbPx(6) } }} uiBackground={redPicBgBackground()}>
                  <UiEntity
                    uiTransform={{ width: sbPic, height: sbPic }}
                    uiBackground={scoreboardPlayerPicBackground(engineIsRed, s.redAddr)}
                  />
                </UiEntity>
                {engineIsRed ? (
                  <Button
                    value=""
                    uiTransform={{ width: sbFlagW, height: sbFlagH }}
                    uiBackground={engineFlagBackground()}
                  />
                ) : (
                  <Button
                    value=""
                    uiTransform={{ width: sbFlagW, height: sbFlagH }}
                    uiBackground={flagBackgroundForPlayer(s.redCountry, s.redAddr)}
                    onMouseDown={() => { if (side === 'red') openPicker() }}
                  />
                )}
              </UiEntity>
            </UiEntity>

            {/* Fila 2: nombres bajo avatar (misma huella que fila 1: bandera + gap + pic) */}
            <UiEntity
              uiTransform={{
                width: '100%',
                height: sbNameH,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                margin: { top: sbPx(4) }
              }}
            >
              <UiEntity
                uiTransform={{
                  width: '37.5%',
                  height: sbNameH,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-end'
                }}
              >
                <UiEntity uiTransform={{ width: sbFlagW, height: sbNameH, margin: { right: sbPx(6) } }} />
                <Label
                  value={scoreboardDisplayName(s.blueName, 'Blue', engineIsBlue)}
                  fontSize={fs(18)}
                  color={Color4.White()}
                  textAlign="middle-right"
                  textWrap="nowrap"
                  uiTransform={{ width: sbNameW, height: sbNameH }}
                />
              </UiEntity>

              <UiEntity uiTransform={{ width: '25%', height: sbNameH }} />

              <UiEntity
                uiTransform={{
                  width: '37.5%',
                  height: sbNameH,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start'
                }}
              >
                <Label
                  value={scoreboardDisplayName(s.redName, 'Red', engineIsRed)}
                  fontSize={fs(18)}
                  color={Color4.White()}
                  textAlign="middle-left"
                  textWrap="nowrap"
                  uiTransform={{ width: sbNameW, height: sbNameH }}
                />
                <UiEntity uiTransform={{ width: sbPx(6), height: sbNameH }} />
                <UiEntity uiTransform={{ width: sbFlagW, height: sbNameH }} />
              </UiEntity>
            </UiEntity>

            {/* Fila 3: pelotitas por tiro tomado, misma alineación que los nombres
                (blue a la derecha, red a la izquierda). */}
            <UiEntity
              uiTransform={{
                width: '100%',
                height: sbBall,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                margin: { top: sbPx(4) }
              }}
            >
              <UiEntity
                uiTransform={{
                  width: '37.5%',
                  height: sbBall,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-end'
                }}
              >
                {shotBallsRow(shotResultsBlue, true)}
              </UiEntity>
              <UiEntity uiTransform={{ width: '25%', height: sbBall }} />
              <UiEntity
                uiTransform={{
                  width: '37.5%',
                  height: sbBall,
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start'
                }}
              >
                {shotBallsRow(shotResultsRed)}
              </UiEntity>
            </UiEntity>
          </UiEntity>
          </UiEntity>
          </UiEntity>
        </UiEntity>
      )}
      {/* ========== fin SCOREBOARD ========== */}

      {/* ========== GLOBAL ACTIONS (F7 / H7) + leave (E7) — esquina superior derecha ========== */}
      {splashDismissed && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, right: 0 },
            width: '30%',
            height: sbRowH,
            padding: isMobile()
              ? { top: 8, left: 12, right: 12 }
              : { top: 0, left: 12, right: 12 },
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-start',
            zIndex: 56
          }}
        >
          <ScoreboardGlobalActions />
          {!!side && s.hasActiveMatch === 1 && <ScoreboardLeaveButton />}
        </UiEntity>
      )}
      {/* ========== fin GLOBAL ACTIONS ========== */}

      {/* ========== LEAVE MATCH CONFIRM ========== */}
      {splashDismissed && leaveMatchConfirmOpen && s.hasActiveMatch === 1 && !!side && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1003,
            pointerFilter: 'none'
          }}
        >
          <UiEntity
            uiTransform={{
              positionType: 'relative',
              width: leaveConfirmPanelW
            }}
          >
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 0, left: 0, right: 0, bottom: 0 },
                zIndex: 0
              }}
            >
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: cpInset, bottom: cpInset, left: cpInset, right: cpInset }
                }}
                uiBackground={countryPickerFrameSliceBackground(5)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(1)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(3)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { bottom: 0, left: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(7)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { bottom: 0, right: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(9)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: 0, left: cpInset, right: cpInset },
                  height: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(2)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { bottom: 0, left: cpInset, right: cpInset },
                  height: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(8)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: cpInset, bottom: cpInset, left: 0 },
                  width: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(4)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: cpInset, bottom: cpInset, right: 0 },
                  width: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(6)}
              />
            </UiEntity>
            <UiEntity
              uiTransform={{
                positionType: 'relative',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: {
                  top: leaveConfirmPadY,
                  bottom: leaveConfirmPadY,
                  left: leaveConfirmPadX,
                  right: leaveConfirmPadX
                },
                zIndex: 1
              }}
            >
              <UiEntity
                uiTransform={{
                  width: leaveConfirmTitleW,
                  height: leaveConfirmTitleH,
                  margin: { bottom: 20 }
                }}
                uiBackground={leaveMatchTitleBackground()}
              />
              <UiEntity
                uiTransform={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <Button
                  value=""
                  uiTransform={{ width: leaveConfirmBtnW, height: leaveConfirmBtnH, margin: { right: leaveConfirmBtnGapPx } }}
                  uiBackground={leaveMatchNoButtonBackground()}
                  onMouseDown={() => { leaveMatchConfirmOpen = false }}
                />
                <Button
                  value=""
                  uiTransform={{ width: leaveConfirmBtnW, height: leaveConfirmBtnH }}
                  uiBackground={leaveMatchYesButtonBackground()}
                  onMouseDown={() => executeLeaveMatch()}
                />
              </UiEntity>
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}
      {/* ========== fin LEAVE MATCH CONFIRM ========== */}

      {/* ========== UI: LEADERBOARD (centrado en pantalla) ========== */}
      {splashDismissed && showLeaderboard && <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 0, left: 0, right: 0, bottom: 0 },
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          pointerFilter: 'none'
        }}
      >
        {/* Panel visible del leaderboard (H1 → 9 slices, UI_atlas 8×8) */}
        <UiEntity
          uiTransform={{
            positionType: 'relative',
            width: lbPanelWidthPx,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch'
          }}
        >
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: 0, left: 0, right: 0, bottom: 0 },
              zIndex: 0
            }}
          >
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: lbSlicePx, height: lbSlicePx }}
            uiBackground={leaderboardFrameSliceBackground(1)}
          />
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: lbSlicePx, height: lbSlicePx }}
            uiBackground={leaderboardFrameSliceBackground(3)}
          />
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { bottom: 0, left: 0 }, width: lbSlicePx, height: lbSlicePx }}
            uiBackground={leaderboardFrameSliceBackground(7)}
          />
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { bottom: 0, right: 0 }, width: lbSlicePx, height: lbSlicePx }}
            uiBackground={leaderboardFrameSliceBackground(9)}
          />
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: 0, left: lbInset, right: lbInset },
              height: lbSlicePx
            }}
            uiBackground={leaderboardFrameSliceBackground(2)}
          />
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { bottom: 0, left: lbInset, right: lbInset },
              height: lbSlicePx
            }}
            uiBackground={leaderboardFrameSliceBackground(8)}
          />
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: lbInset, bottom: lbInset, left: 0 },
              width: lbSlicePx
            }}
            uiBackground={leaderboardFrameSliceBackground(4)}
          />
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: lbInset, bottom: lbInset, right: 0 },
              width: lbSlicePx
            }}
            uiBackground={leaderboardFrameSliceBackground(6)}
          />
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { top: lbInset, bottom: lbInset, left: lbInset, right: lbInset }
            }}
            uiBackground={leaderboardFrameSliceBackground(5)}
          />
          </UiEntity>
          <Button
            value=""
            uiTransform={{
              positionType: 'absolute',
              position: { top: -12, right: -12 },
              width: sbActionBtnSize(),
              height: sbActionBtnSize(),
              zIndex: 2
            }}
            uiBackground={scoreboardBadgeE7Background()}
            onMouseDown={() => closeLeaderboard()}
          />
          <UiEntity
            uiTransform={{
              positionType: 'relative',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: {
                top: lbSlicePx + 10,
                bottom: lbSlicePx + 10,
                left: lbSlicePx + 10,
                right: lbSlicePx + 10
              },
              zIndex: 1
            }}
          >
          <UiEntity
            uiTransform={{
              width: '100%',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              margin: { bottom: -20 }
            }}
          >
            <UiEntity
              uiTransform={{ width: lbTitleWidth, height: lbTitleHeight }}
              uiBackground={leaderboardTitleBackground()}
            />
          </UiEntity>
          {lbRows.length === 0 ? (
            <Label
              value="(no wins yet)"
              fontSize={fs(20)}
              color={Color4.create(0.9, 0.95, 1, 1)}
              uiTransform={{ margin: { top: 6 } }}
            />
          ) : (
            <UiEntity uiTransform={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {/* Header row — mismas columnas que las filas de jugadores */}
              <UiEntity
                uiTransform={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  height: lbRowH,
                  margin: { bottom: 2 }
                }}
              >
                <UiEntity
                  uiTransform={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}
                >
                  <UiEntity uiTransform={{ width: lbRankW, height: lbRowH, margin: { right: lbColGap } }} />
                  <UiEntity uiTransform={{ width: lbFaceSz, height: lbRowH, margin: { right: lbColGap } }} />
                  <UiEntity uiTransform={{ width: lbFlagColW, height: lbRowH, margin: { right: lbColGap } }} />
                  <UiEntity uiTransform={{ width: lbNameW, height: lbRowH }} />
                </UiEntity>
                <UiEntity uiTransform={{ width: lbWinsW, height: lbRowH }}>
                  <Label
                    value="wins"
                    fontSize={fs(20)}
                    color={lbWinsTextColor}
                    textAlign="middle-center"
                    uiTransform={{ width: '100%', height: lbRowH }}
                  />
                </UiEntity>
              </UiEntity>
            {lbRows.map((row) => {
              const face = getLeaderboardFaceUrl(row.addr)
              return (
                <UiEntity
                  key={row.addr}
                  uiTransform={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    height: lbRowH,
                    margin: { top: isMobile() ? 5 : 3, bottom: isMobile() ? 5 : 0 }
                  }}
                  uiBackground={row.rank % 2 === 1 ? lbRowOddBg : undefined}
                >
                  <UiEntity
                    uiTransform={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}
                  >
                    <UiEntity
                      uiTransform={{ width: lbRankW, height: lbRowH, margin: { right: lbColGap } }}
                    >
                      <Label value={`${row.rank}.`} fontSize={fs(20)} color={Color4.White()} textAlign="middle-right" uiTransform={{ width: '100%', height: lbRowH }} />
                    </UiEntity>
                    <UiEntity
                      uiTransform={{ width: lbFaceSz, height: lbRowH, margin: { right: lbColGap } }}
                      uiBackground={facePicBackground(face)}
                    />
                    <UiEntity
                      uiTransform={{ width: lbFlagColW, height: lbRowH, margin: { right: lbColGap } }}
                      uiBackground={flagBackgroundForPlayer(row.country, row.addr)}
                    />
                    <UiEntity uiTransform={{ width: lbNameW, height: lbRowH }}>
                      <Label value={truncateName(row.name)} fontSize={fs(20)} color={Color4.create(0.9, 0.95, 1, 1)} textAlign="middle-left" uiTransform={{ width: '100%', height: lbRowH }} />
                    </UiEntity>
                  </UiEntity>
                  <UiEntity uiTransform={{ width: lbWinsW, height: lbRowH }}>
                    <Label value={`${row.wins}`} fontSize={fs(20)} color={lbWinsTextColor} textAlign="middle-center" uiTransform={{ width: '100%', height: lbRowH }} />
                  </UiEntity>
                </UiEntity>
              )
            })}
            </UiEntity>
          )}
          <Label
            value="*Only Player vs Player matches count."
            fontSize={Math.round(fs(14) * (isMobile() ? 1.5 : 1.2))}
            color={Color4.create(0.7, 0.75, 0.85, 1)}
            textAlign="middle-center"
            uiTransform={{ margin: { top: 10 } }}
          />
          </UiEntity>
        </UiEntity>
      </UiEntity>
      }
      {/* ========== fin UI LEADERBOARD ========== */}

      {/* ========== COUNTRY PICKER ========== */}
      {splashDismissed && showCountryPicker && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001
          }}
          uiBackground={countryPickerOverlayBackground()}
        >
          <UiEntity
            uiTransform={{
              positionType: 'relative',
              width: cpPanelWidthPx,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch'
            }}
          >
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 0, left: 0, right: 0, bottom: 0 },
                zIndex: 0
              }}
            >
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(1)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(3)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { bottom: 0, left: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(7)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { bottom: 0, right: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(9)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: 0, left: cpInset, right: cpInset },
                  height: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(2)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { bottom: 0, left: cpInset, right: cpInset },
                  height: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(8)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: cpInset, bottom: cpInset, left: 0 },
                  width: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(4)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: cpInset, bottom: cpInset, right: 0 },
                  width: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(6)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: cpInset, bottom: cpInset, left: cpInset, right: cpInset }
                }}
                uiBackground={countryPickerFrameSliceBackground(5)}
              />
            </UiEntity>
            <Button
              value=""
              uiTransform={{
                positionType: 'absolute',
                position: { top: -12, right: -12 },
                width: sbActionBtnSize(),
                height: sbActionBtnSize(),
                zIndex: 2
              }}
              uiBackground={scoreboardBadgeE7Background()}
              onMouseDown={() => closePicker()}
            />
            <UiEntity
              uiTransform={{
                positionType: 'relative',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: {
                  top: cpSlicePx + 16,
                  bottom: cpSlicePx + 16,
                  left: cpSlicePx + 16,
                  right: cpSlicePx + 16
                },
                zIndex: 1
              }}
            >
          <UiEntity
            uiTransform={{
              width: fs(520),
              height: Math.floor(fs(520) / selectYourFlagAspect()),
              margin: { bottom: 4 }
            }}
            uiBackground={selectYourFlagBackground()}
          />
          <UiEntity
            uiTransform={{
              width: fs(220),
              height: Math.floor(fs(220) / worldCup2026Aspect()),
              margin: { bottom: 20 }
            }}
            uiBackground={worldCup2026Background()}
          />
          <UiEntity
            uiTransform={{
              width: pickerGridWidthPx,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch'
            }}
          >
            <UiEntity
              uiTransform={{
                width: '100%',
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                margin: { bottom: 16 }
              }}
            >
              <Label
                value="48 teams"
                fontSize={fs(30)}
                color={Color4.White()}
                textAlign="middle-left"
              />
              <Label
                value={`Selected: ${pickerSelectedName}`}
                fontSize={fs(30)}
                color={Color4.White()}
                textAlign="middle-right"
              />
            </UiEntity>
            <UiEntity
              uiTransform={{
                width: '100%',
                height: 1,
                margin: { bottom: 16 }
              }}
              uiBackground={{ color: PICKER_ACCENT }}
            />
            {/* Flag grid: 6 per row, 2 rows */}
            {Array.from({ length: FLAG_ROWS }, (_, row) => (
              <UiEntity
                key={`row-${row}`}
                uiTransform={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'flex-start',
                  alignItems: 'flex-start'
                }}
              >
                {visibleCountries.slice(row * FLAGS_PER_ROW, (row + 1) * FLAGS_PER_ROW).map((c) => (
                  <UiEntity
                    key={c.iso}
                    uiTransform={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      margin: { left: 4, right: 4, bottom: '3vw' }
                    }}
                  >
                    <Button
                      value=""
                      uiTransform={{ width: FLAG_PICKER_BTN_W, height: 126 }}
                      uiBackground={flagBackground(c.iso)}
                        onMouseDown={() => selectCountryFromPicker(c.iso)}
                    />
                    <Label
                      value={ellipsize(c.name, FLAG_PICKER_BTN_W, fs(20))}
                      fontSize={fs(20)}
                      color={Color4.White()}
                      textAlign="middle-center"
                      textWrap="nowrap"
                      uiTransform={{ width: FLAG_PICKER_BTN_W }}
                    />
                  </UiEntity>
                ))}
              </UiEntity>
            ))}
          </UiEntity>
          {/* Pagination */}
          <UiEntity
            uiTransform={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              margin: { top: 16 }
            }}
          >
            {pickerPage > 0 ? (
              <Button
                value=""
                uiTransform={{ width: pickerNavBtnW, height: pickerNavBtnH }}
                uiBackground={flagPickerPrevBackground()}
                onMouseDown={() => { pickerPage-- }}
              />
            ) : (
              <UiEntity uiTransform={{ width: pickerNavBtnW, height: pickerNavBtnH }} />
            )}
            <Label
              value={`${pickerPage + 1} / ${TOTAL_PAGES}`}
              fontSize={fs(20)}
              color={Color4.White()}
              textAlign="middle-center"
              uiTransform={{ width: PICKER_PAGE_BTN_W, height: PICKER_PAGE_BTN_H }}
            />
            {pickerPage < TOTAL_PAGES - 1 ? (
              <Button
                value=""
                uiTransform={{ width: pickerNavBtnW, height: pickerNavBtnH }}
                uiBackground={flagPickerNextBackground()}
                onMouseDown={() => { pickerPage++ }}
              />
            ) : (
              <UiEntity uiTransform={{ width: pickerNavBtnW, height: pickerNavBtnH }} />
            )}
          </UiEntity>
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}
      {/* ========== fin COUNTRY PICKER ========== */}

      {showCountryConfirm && countryConfirmCountry && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1002
          }}
          uiBackground={welcomeScreenOverlayBackground()}
        >
          <UiEntity
            uiTransform={{
              positionType: 'relative',
              width: cfPanelWidthPx,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch'
            }}
          >
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 0, left: 0, right: 0, bottom: 0 },
                zIndex: 0
              }}
            >
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(1)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(3)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { bottom: 0, left: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(7)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { bottom: 0, right: 0 }, width: cpSlicePx, height: cpSlicePx }}
                uiBackground={countryPickerFrameSliceBackground(9)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: 0, left: cpInset, right: cpInset },
                  height: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(2)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { bottom: 0, left: cpInset, right: cpInset },
                  height: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(8)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: cpInset, bottom: cpInset, left: 0 },
                  width: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(4)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: cpInset, bottom: cpInset, right: 0 },
                  width: cpSlicePx
                }}
                uiBackground={countryPickerFrameSliceBackground(6)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: cpInset, bottom: cpInset, left: cpInset, right: cpInset }
                }}
                uiBackground={countryPickerFrameSliceBackground(5)}
              />
            </UiEntity>
            <UiEntity
              uiTransform={{
                positionType: 'relative',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: {
                  top: cpSlicePx + 24,
                  bottom: cpSlicePx + 24,
                  left: cpSlicePx + 24,
                  right: cpSlicePx + 24
                },
                zIndex: 1
              }}
            >
          <UiEntity
            uiTransform={{ width: countryConfirmFlagW, height: countryConfirmFlagH, margin: { bottom: 10 } }}
            uiBackground={flagBackground(getLocalCountry())}
          />
          <Label
            value={countryConfirmCountry.name}
            fontSize={fs(isMobile() ? 40 : 48)}
            color={Color4.White()}
            textAlign="middle-center"
            uiTransform={{ margin: { bottom: 2 } }}
          />
          <Label
            value="selected!"
            fontSize={fs(isMobile() ? 28 : 34)}
            color={Color4.White()}
            textAlign="middle-center"
          />
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}

      {showWelcome && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 48,
            pointerFilter: 'none'
          }}
        >
          <UiEntity
            uiTransform={{
              width: welcomePanelW,
              height: welcomePanelH,
              positionType: 'relative'
            }}
          >
            {cpNineSliceFrame(cpSlicePx, cpInset)}
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 0, left: 0 },
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <UiEntity
                uiTransform={{ width: welcomeOverlayW, height: welcomeOverlayH }}
                uiBackground={welcomeChooseSpotOverlayBackground()}
              />
            </UiEntity>
            <Button
              value=""
              uiTransform={{
                positionType: 'absolute',
                position: { top: -12, right: -12 },
                width: sbActionBtnSize(),
                height: sbActionBtnSize()
              }}
              uiBackground={scoreboardBadgeE7Background()}
              onMouseDown={() => dismissWelcomeChooseSpot()}
            />
          </UiEntity>
        </UiEntity>
      )}

      {showWaiting && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: '17vh', left: 0 },
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            zIndex: 48
          }}
        >
          <UiEntity
            uiTransform={{
              width: waitPanelW,
              height: waitPanelH,
              positionType: 'relative'
            }}
          >
            {cpNineSliceFrame(cpSlicePx, cpInset)}
            <UiEntity
              uiTransform={{
                positionType: 'relative',
                width: '100%',
                height: '100%',
                padding: { top: 22, bottom: 28, left: 34, right: 34 },
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1
              }}
            >
          <UiEntity
            uiTransform={{
              width: '100%',
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'center'
            }}
          >
            <UiEntity
              uiTransform={{ width: waitTitleWidth, height: waitTitleHeight }}
              uiBackground={waitingOpponentTitleBackground()}
            />
          </UiEntity>
          <Label
            value={`${waitDisplayLeft}s`}
            fontSize={fs(30)}
            color={Color4.create(1, 0.85, 0.2, 1)}
            uiTransform={{ margin: { top: 4 } }}
          />
          <UiEntity
            uiTransform={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              margin: { top: isMobile() ? 44 : 16 }
            }}
          >
            <Button
              value=""
              uiTransform={{ width: waitBtnW, height: waitBtnH, margin: { right: waitBtnGapPx } }}
              uiBackground={{
                ...waitingOpponentPvEButtonBackground(),
                color: Color4.create(1, 1, 1, hoverWaitPvE ? 1 : 0.92)
              }}
              onMouseDown={() => room.send('startPvE', {})}
              onMouseEnter={() => { hoverWaitPvE = true }}
              onMouseLeave={() => { hoverWaitPvE = false }}
            />
            <Button
              value=""
              uiTransform={{ width: waitBtnW, height: waitBtnH }}
              uiBackground={{
                ...waitingOpponentCancelButtonBackground(),
                color: Color4.create(1, 1, 1, hoverWaitCancel ? 1 : 0.92)
              }}
              onMouseDown={() => room.send('cancelWaiting', {})}
              onMouseEnter={() => { hoverWaitCancel = true }}
              onMouseLeave={() => { hoverWaitCancel = false }}
            />
          </UiEntity>
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}

      {/* Inactivity countdown pill, anchored just under the scoreboard. */}
      {showTimeoutCountdown && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            zIndex: 56
          }}
        >
          <UiEntity
            uiTransform={{
              width: timeoutBoxW,
              height: timeoutBoxH,
              positionType: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: { top: timeoutTopMargin },
              opacity: timeoutOpacity
            }}
          >
            {nineSliceFrame(timeoutFrameSliceBackground, timeoutSlicePx, timeoutInset)}
            <Label
              value={`timeout in ${timeoutRemainingSec}s`}
              fontSize={timeoutFsPx}
              color={Color4.White()}
              textAlign="middle-center"
              uiTransform={{ width: '100%', height: '100%', zIndex: 1 }}
            />
          </UiEntity>
        </UiEntity>
      )}

      {/* DIVE / SHOOT panels: centrado en pantalla */}
      {showPick && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0, right: 0, bottom: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            pointerFilter: 'none',
            zIndex: 1000
          }}
        >
          {!kicker && pickDirectionPanel(pickDirectionTitleDiveBackground())}
          {kicker && pickDirectionPanel(pickDirectionTitleShootBackground())}
        </UiEntity>
      )}

      {/* CAMERA selector: spectators only, same spot as the L/C/R picker */}
      {showCameraSelector && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0, right: 0, bottom: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
            pointerFilter: 'none',
            zIndex: 1000
          }}
        >
          {cameraSelectorPanel}
        </UiEntity>
      )}

      {showResult && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'none',
            zIndex: 62
          }}
        >
          <UiEntity
            uiTransform={{
              positionType: 'relative',
              width: resultPanelW
            }}
          >
            <UiEntity
              uiTransform={{
                positionType: 'absolute',
                position: { top: 0, left: 0, right: 0, bottom: 0 },
                zIndex: 0
              }}
            >
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: resultInset, bottom: resultInset, left: resultInset, right: resultInset }
                }}
                uiBackground={goalSaveFrameSliceBackground(5)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: resultSlicePx, height: resultSlicePx }}
                uiBackground={goalSaveFrameSliceBackground(1)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { top: 0, right: 0 }, width: resultSlicePx, height: resultSlicePx }}
                uiBackground={goalSaveFrameSliceBackground(3)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { bottom: 0, left: 0 }, width: resultSlicePx, height: resultSlicePx }}
                uiBackground={goalSaveFrameSliceBackground(7)}
              />
              <UiEntity
                uiTransform={{ positionType: 'absolute', position: { bottom: 0, right: 0 }, width: resultSlicePx, height: resultSlicePx }}
                uiBackground={goalSaveFrameSliceBackground(9)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: 0, left: resultInset, right: resultInset },
                  height: resultSlicePx
                }}
                uiBackground={goalSaveFrameSliceBackground(2)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { bottom: 0, left: resultInset, right: resultInset },
                  height: resultSlicePx
                }}
                uiBackground={goalSaveFrameSliceBackground(8)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: resultInset, bottom: resultInset, left: 0 },
                  width: resultSlicePx
                }}
                uiBackground={goalSaveFrameSliceBackground(4)}
              />
              <UiEntity
                uiTransform={{
                  positionType: 'absolute',
                  position: { top: resultInset, bottom: resultInset, right: 0 },
                  width: resultSlicePx
                }}
                uiBackground={goalSaveFrameSliceBackground(6)}
              />
            </UiEntity>
            <UiEntity
              uiTransform={{
                positionType: 'relative',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: {
                  top: resultPadY,
                  bottom: resultPadY,
                  left: resultPadX,
                  right: resultPadX
                },
                zIndex: 1
              }}
            >
              <UiEntity
                uiTransform={{ width: resultBannerW, height: resultBannerH }}
                uiBackground={resultIsGoal ? goalSaveGoalBannerBackground() : goalSaveSaveBannerBackground()}
              />
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}

      {showMatchEnd && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0, right: 0, bottom: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            pointerFilter: 'none',
            zIndex: 70
          }}
        >
          {s.winnerSide ? (
            <UiEntity
              uiTransform={{
                positionType: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch'
              }}
            >
              {nineSliceFrame(leaderboardFrameSliceBackground, cpSlicePx, cpInset)}
              <UiEntity
                uiTransform={{
                  positionType: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: {
                    top: Math.floor((cpSlicePx + 28) / 2),
                    bottom: Math.floor((cpSlicePx + 28) / 2),
                    left: Math.floor((cpSlicePx + 44) / 2),
                    right: Math.floor((cpSlicePx + 44) / 2)
                  },
                  zIndex: 1
                }}
              >
              <UiEntity
                uiTransform={{ width: 256, height: 256, margin: { bottom: 16 } }}
                uiBackground={
                  winnerEngineSide ? enginePicBackground() : facePicBackground(winnerFaceUrl)
                }
              />
              <Label
                value={`${scoreboardSideName(s.winnerName, '', winnerEngineSide)} wins!`}
                fontSize={fs(50)}
                color={Color4.create(1, 0.92, 0.35, 1)}
                textAlign="middle-center"
              />
              {winnerEngineSide ? (
                <UiEntity
                  uiTransform={{ width: 96, height: 72, margin: { top: 16 } }}
                  uiBackground={engineFlagBackground()}
                />
              ) : (
                <UiEntity
                  uiTransform={{ width: 96, height: 72, margin: { top: 16 } }}
                  uiBackground={flagBackgroundForPlayer(
                    s.winnerSide === 'red' ? s.redCountry : s.blueCountry,
                    winnerWinAddr
                  )}
                />
              )}
              </UiEntity>
            </UiEntity>
          ) : (
            <UiEntity
              uiTransform={{
                positionType: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch'
              }}
            >
              {nineSliceFrame(matchEndFrameSliceBackground, cpSlicePx, cpInset)}
              <UiEntity
                uiTransform={{
                  positionType: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: {
                    top: cpSlicePx + 14,
                    bottom: cpSlicePx + 2,
                    left: cpSlicePx + 30,
                    right: cpSlicePx + 30
                  },
                  zIndex: 1
                }}
              >
                {s.winnerName === 'Timeout' ? (
                  <UiEntity
                    uiTransform={{ width: fs(300), height: Math.floor(fs(300) / matchEndMessageAspect()) }}
                    uiBackground={matchEndMessageBackground()}
                  />
                ) : (
                  <Label
                    value={s.winnerName}
                    fontSize={fs(40)}
                    color={Color4.White()}
                    textAlign="middle-center"
                  />
                )}
              </UiEntity>
            </UiEntity>
          )}
        </UiEntity>
      )}

      {showStreak && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0, right: 0, bottom: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none',
            zIndex: 80
          }}
        >
          <UiEntity
            uiTransform={{
              positionType: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            {cpNineSliceFrame(cpSlicePx, cpInset)}
            <UiEntity
              uiTransform={{
                positionType: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: {
                  top: cpSlicePx + 20,
                  bottom: cpSlicePx + 12,
                  left: cpSlicePx + 32,
                  right: cpSlicePx + 32
                },
                zIndex: 1
              }}
            >
              <UiEntity
                uiTransform={{ width: fs(320), height: Math.floor(fs(320) / stayOnSpotAspect()) }}
                uiBackground={stayOnSpotBackground()}
              />
              <Label
                value={`${streakDisplayLeft}s`}
                fontSize={fs(30)}
                color={Color4.create(1, 0.85, 0.2, 1)}
                textAlign="middle-center"
                uiTransform={{ margin: { top: 6 } }}
              />
              <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { top: 14 } }}>
                <Button
                  value=""
                  uiTransform={{ width: promptBtnW, height: promptBtnH, margin: { right: promptBtnGapPx } }}
                  uiBackground={promptYesBackground()}
                  onMouseDown={() => room.send('streakDecision', { continue: 1 })}
                />
                <Button
                  value=""
                  uiTransform={{ width: promptBtnW, height: promptBtnH }}
                  uiBackground={promptNoBackground()}
                  onMouseDown={() => room.send('streakDecision', { continue: 0 })}
                />
              </UiEntity>
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}

      {showSpectatorChallenge && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0, right: 0, bottom: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerFilter: 'none',
            zIndex: 80
          }}
        >
          <UiEntity
            uiTransform={{
              positionType: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}
          >
            {cpNineSliceFrame(cpSlicePx, cpInset)}
            <UiEntity
              uiTransform={{
                positionType: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: {
                  top: cpSlicePx + 20,
                  bottom: cpSlicePx + 20,
                  left: cpSlicePx + 32,
                  right: cpSlicePx + 32
                },
                zIndex: 1
              }}
            >
              <UiEntity
                uiTransform={{ width: fs(384), height: Math.floor((fs(384) / faceTheWinnerAspect()) * 1.2) }}
                uiBackground={faceTheWinnerBackground()}
              />
              <UiEntity uiTransform={{ display: 'flex', flexDirection: 'row', margin: { top: 14 } }}>
                <Button
                  value=""
                  uiTransform={{ width: promptBtnW, height: promptBtnH, margin: { right: promptBtnGapPx } }}
                  uiBackground={promptYesBackground()}
                  onMouseDown={() => {
                    // Claim the spot the loser just vacated (opposite of the winner's side).
                    const freeTeam = s.winnerSide === 'red' ? 'blue' : 'red'
                    takeSpotHandler?.(freeTeam)
                  }}
                />
                <Button
                  value=""
                  uiTransform={{ width: promptBtnW, height: promptBtnH }}
                  uiBackground={promptNoBackground()}
                  onMouseDown={() => {
                    spectatorChallengeDismissedFor = s.winnerStreakAddr.toLowerCase()
                  }}
                />
              </UiEntity>
            </UiEntity>
          </UiEntity>
        </UiEntity>
      )}

      {/* ========== SPLASH / WELCOME SCREEN ========== */}
      {!splashDismissed && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { top: 0, left: 0 },
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
          uiBackground={welcomeScreenOverlayBackground()}
        >
          <UiEntity
            uiTransform={{
              width: splashLogoSize().width,
              height: splashLogoSize().height,
              margin: { bottom: '5vh' },
              pointerFilter: 'none',
            }}
            uiBackground={logoBackground()}
          />
          <UiEntity
            uiTransform={{
              width: isMobile() ? 330 : 240,
              // Alto derivado del aspect real del sprite (2.5:1) para no estirarlo.
              height: Math.floor((isMobile() ? 330 : 240) / splashStartButtonAspect()),
              positionType: 'relative',
              zIndex: 1,
            }}
          >
            <Button
              value=""
              uiTransform={{ width: '100%', height: '100%' }}
              uiBackground={splashStartButtonBackground(hoverSplashStart && !isMobile())}
              onMouseDown={() => { dismissSplash() }}
              onMouseEnter={() => { if (!isMobile()) hoverSplashStart = true }}
              onMouseLeave={() => { if (!isMobile()) hoverSplashStart = false }}
            />
          </UiEntity>
        </UiEntity>
      )}
      {/* ========== fin SPLASH ========== */}

      {splashDismissed && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: 12, right: 12 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            zIndex: 40
          }}
        >
          {debugInfoOpen && (
            <UiEntity
              uiTransform={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: { top: 8, bottom: 8, left: 12, right: 12 },
                // Ancho mínimo para que entre "server tick: " + 12 dígitos (≈25 chars); de ahí
                // en más se adapta al contenido hasta maxWidth.
                minWidth: Math.ceil(('server tick: '.length + 12) * fs(14) * 0.6) + 24,
                maxWidth: isMobile() ? 340 : 720,
                margin: { bottom: 8 }
              }}
              uiBackground={{ color: Color4.create(0, 0, 0, 0.92) }}
            >
              <Label
                value={`state: ${s.phase}`}
                fontSize={fs(14)}
                color={Color4.create(0.75, 1, 0.8, 1)}
              />
              <Label
                value={`side: ${side ?? '(none)'} | red: ${s.redName || '—'} | blue: ${s.blueName || '—'}`}
                fontSize={fs(14)}
                color={Color4.create(0.85, 0.9, 1, 1)}
                uiTransform={{ display: 'none', margin: { top: 4 } }}
              />
              <Label
                value={`server tick: ${s.serverTickCounter}`}
                fontSize={fs(14)}
                color={Color4.create(1, 0.7, 0.7, 1)}
                uiTransform={{ margin: { top: 4 } }}
              />
              <Label
                value={`last server event: ${resolveEventAddrs(s.lastServerEvent, s.redAddr, s.redName, s.blueAddr, s.blueName) || '(none)'}`}
                fontSize={fs(14)}
                color={Color4.create(1, 0.9, 0.6, 1)}
                uiTransform={{ display: 'none', margin: { top: 4 } }}
              />
            </UiEntity>
          )}
          <Button
            value="i"
            fontSize={fs(isMobile() ? 18 : 16)}
            color={Color4.White()}
            uiTransform={{ width: isMobile() ? 36 : 32, height: isMobile() ? 36 : 32 }}
            uiBackground={{ color: Color4.create(0.1, 0.15, 0.2, 0.9) }}
            onMouseDown={() => { debugInfoOpen = !debugInfoOpen }}
          />
        </UiEntity>
      )}
    </UiEntity>
  )
}

function shortAddr(addr: string): string {
  if (!addr) return '—'
  if (addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function truncateName(name: string, maxChars: number = 13): string {
  if (name.length <= maxChars) return name
  return name.slice(0, maxChars) + '...'
}

function resolveEventAddrs(event: string, redAddr: string, redName: string, blueAddr: string, blueName: string): string {
  let s = event
  if (redAddr) s = s.replace(new RegExp(redAddr, 'gi'), redName || redAddr)
  if (blueAddr) s = s.replace(new RegExp(blueAddr, 'gi'), blueName || blueAddr)
  return s
}
