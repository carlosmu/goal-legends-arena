import { Color4 } from '@dcl/sdk/math'

export const UI_ATLAS_SRC = 'assets/images/UI_atlas.png'
const UI_ATLAS_COLS = 8
const UI_ATLAS_ROWS = 8

/** Splash logo sprite on UI_atlas.png (cells A1–D3). */
export const LOGO_COORD_FROM = 'A1'
export const LOGO_COORD_TO = 'D3'

function parseAtlasCell(coordinates: string): { col: number; row: number } | null {
  const m = /^([A-H])([1-8])$/i.exec(coordinates.trim())
  if (!m) return null
  return {
    col: m[1].toUpperCase().charCodeAt(0) - 65,
    row: parseInt(m[2], 10) - 1
  }
}

/** Inclusive range "A1".."D4" → UV quad (8×8 sheet, row 1 = top). */
export function uiAtlasRangeToUvs(from: string, to: string): number[] {
  const a = parseAtlasCell(from)
  const b = parseAtlasCell(to)
  if (!a || !b) return [0, 0, 0, 1, 1, 1, 1, 0]
  const col0 = Math.min(a.col, b.col)
  const col1 = Math.max(a.col, b.col)
  const row0 = Math.min(a.row, b.row)
  const row1 = Math.max(a.row, b.row)
  const u0 = col0 / UI_ATLAS_COLS
  const u1 = (col1 + 1) / UI_ATLAS_COLS
  const v0 = (UI_ATLAS_ROWS - row1 - 1) / UI_ATLAS_ROWS
  const v1 = (UI_ATLAS_ROWS - row0) / UI_ATLAS_ROWS
  return [u0, v0, u0, v1, u1, v1, u1, v0]
}

export function uiAtlasRangeBackground(from: string, to: string) {
  return {
    textureMode: 'stretch' as const,
    texture: { src: UI_ATLAS_SRC },
    uvs: uiAtlasRangeToUvs(from, to),
    color: Color4.White()
  }
}

export function logoBackground() {
  return uiAtlasRangeBackground(LOGO_COORD_FROM, LOGO_COORD_TO)
}

/** Scoreboard panel background (UI_atlas A8–F8). */
export const SCOREBOARD_BG_FROM = 'A8'
export const SCOREBOARD_BG_TO = 'E8'

export function scoreboardBackground() {
  return uiAtlasRangeBackground(SCOREBOARD_BG_FROM, SCOREBOARD_BG_TO)
}

export const WELCOME_SPOT_OVERLAY_FROM = 'G2'
export const WELCOME_SPOT_OVERLAY_TO = 'H2'

/** Overlay centered over welcome banner (UI_atlas G2–H2). */
export function welcomeChooseSpotOverlayBackground() {
  return uiAtlasRangeBackground(WELCOME_SPOT_OVERLAY_FROM, WELCOME_SPOT_OVERLAY_TO)
}

export function pickDirectionLeftBackground() {
  return uiAtlasRangeBackground('E1', 'E1')
}

export function pickDirectionCenterBackground() {
  return uiAtlasRangeBackground('F1', 'F1')
}

export function pickDirectionRightBackground() {
  return uiAtlasRangeBackground('G1', 'G1')
}

/** Selected-state sprites for the L/C/R buttons (E1/F1/G1 → E4/F4/G4). */
export function pickDirectionLeftSelectedBackground() {
  return uiAtlasRangeBackground('E4', 'E4')
}

export function pickDirectionCenterSelectedBackground() {
  return uiAtlasRangeBackground('F4', 'F4')
}

export function pickDirectionRightSelectedBackground() {
  return uiAtlasRangeBackground('G4', 'G4')
}

function uiAtlasRangeHalfBackground(from: string, to: string, useTopHalf: boolean) {
  const fullUvs = uiAtlasRangeToUvs(from, to)
  const u0 = fullUvs[0]
  const v0 = fullUvs[1]
  const u1 = fullUvs[4]
  const v1 = fullUvs[5]
  const vm = (v0 + v1) / 2
  return {
    textureMode: 'stretch' as const,
    texture: { src: UI_ATLAS_SRC },
    uvs: useTopHalf
      ? [u0, vm, u0, v1, u1, v1, u1, vm]
      : [u0, v0, u0, vm, u1, vm, u1, v0],
    color: Color4.White()
  }
}

function pickDirectionTitleHalfBackground(useTopHalf: boolean) {
  return uiAtlasRangeHalfBackground('G3', 'H3', useTopHalf)
}

export function pickDirectionTitleDiveBackground() {
  return pickDirectionTitleHalfBackground(true)
}

export function pickDirectionTitleShootBackground() {
  return pickDirectionTitleHalfBackground(false)
}

/** “Waiting for opponent” title — top half of UI_atlas E3–F3. */
export function waitingOpponentTitleBackground() {
  return uiAtlasRangeHalfBackground('E3', 'F3', true)
}

/** Waiting panel: PvE — bottom half of UI_atlas E3. */
export function waitingOpponentPvEButtonBackground() {
  return uiAtlasRangeHalfBackground('E3', 'E3', false)
}

/** Waiting panel: Cancel — bottom half of UI_atlas F3. */
export function waitingOpponentCancelButtonBackground() {
  return uiAtlasRangeHalfBackground('F3', 'F3', false)
}

/** Leaderboard title — top half of UI_atlas E2–F2. */
export function leaderboardTitleBackground() {
  return uiAtlasRangeHalfBackground('E2', 'F2', true)
}

/** 3D spot billboards (UI_atlas cell A4). */
export const SPOT_BILLBOARD_CELL = 'A4'

export function spotBillboardPlaneUvs(): number[] {
  return uiAtlasRangeToUvs(SPOT_BILLBOARD_CELL, SPOT_BILLBOARD_CELL)
}

/** Leaderboard panel frame: cell H1 of 8×8 UI_atlas, split 3×3 (1–9 row-major). */
export const LEADERBOARD_FRAME_CELL = 'H1'

const UI_ATLAS_PX = 1024
const HALF_TEXEL_U = 0.5 / UI_ATLAS_PX
const HALF_TEXEL_V = 0.5 / UI_ATLAS_PX

/** UVs for one ninth of an 8×8 atlas cell (3×3 grid). Insets half-texel on internal edges. */
function uiAtlasCellNinthUvs(cell: string, ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): number[] {
  const full = uiAtlasRangeToUvs(cell, cell)
  const u0 = full[0]
  const v0 = full[1]
  const u1 = full[4]
  const v1 = full[5]
  const col = (ninth - 1) % 3
  const row = Math.floor((ninth - 1) / 3)
  const du = (u1 - u0) / 3
  const dv = (v1 - v0) / 3
  let su0 = u0 + col * du
  let su1 = u0 + (col + 1) * du
  let sv1 = v1 - row * dv
  let sv0 = v1 - (row + 1) * dv
  if (col > 0) su0 += HALF_TEXEL_U
  if (col < 2) su1 -= HALF_TEXEL_U
  if (row > 0) sv1 -= HALF_TEXEL_V
  if (row < 2) sv0 += HALF_TEXEL_V
  return [su0, sv0, su0, sv1, su1, sv1, su1, sv0]
}

/** One of nine slices from any atlas cell: 1–3 top, 4–6 middle, 7–9 bottom. */
export function atlasCellFrameSliceBackground(
  cell: string,
  ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
) {
  return {
    textureMode: 'stretch' as const,
    texture: { src: UI_ATLAS_SRC },
    uvs: uiAtlasCellNinthUvs(cell, ninth),
    color: Color4.White()
  }
}

export function leaderboardFrameSliceBackground(ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasCellFrameSliceBackground(LEADERBOARD_FRAME_CELL, ninth)
}

/** Country picker panel frame: cell B4 of 8×8 UI_atlas. */
export const COUNTRY_PICKER_FRAME_CELL = 'B4'

export function countryPickerFrameSliceBackground(ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasCellFrameSliceBackground(COUNTRY_PICKER_FRAME_CELL, ninth)
}

/** Leave match dialog title — top half of UI_atlas C4–D4. */
export function leaveMatchTitleBackground() {
  return uiAtlasRangeHalfBackground('C4', 'D4', true)
}

/** Leave match: No — bottom half of UI_atlas C4. */
export function leaveMatchNoButtonBackground() {
  return uiAtlasRangeHalfBackground('C4', 'C4', false)
}

/** Leave match: Yes — bottom half of UI_atlas D4. */
export function leaveMatchYesButtonBackground() {
  return uiAtlasRangeHalfBackground('D4', 'D4', false)
}

/** Goal/Save result panel frame: cell C5 of 8×8 UI_atlas. */
export const GOAL_SAVE_FRAME_CELL = 'C5'

export function goalSaveFrameSliceBackground(ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasCellFrameSliceBackground(GOAL_SAVE_FRAME_CELL, ninth)
}

/** Match-end "left the match" / timeout panel frame: cell D5 of 8×8 UI_atlas. */
export const MATCH_END_FRAME_CELL = 'D5'

export function matchEndFrameSliceBackground(ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasCellFrameSliceBackground(MATCH_END_FRAME_CELL, ninth)
}

/** GOAL — top half of UI_atlas A5–B5. */
export function goalSaveGoalBannerBackground() {
  return uiAtlasRangeHalfBackground('A5', 'B5', true)
}

/** SAVE — bottom half of UI_atlas A5–B5. */
export function goalSaveSaveBannerBackground() {
  return uiAtlasRangeHalfBackground('A5', 'B5', false)
}

/** Width/height of the scoreboard bg sprite (A8–F8 = 6×1 cells). */
export function scoreboardAtlasAspect(): number {
  const a = parseAtlasCell(SCOREBOARD_BG_FROM)
  const b = parseAtlasCell(SCOREBOARD_BG_TO)
  if (!a || !b) return 3
  const cols = Math.abs(b.col - a.col) + 1
  const rows = Math.abs(b.row - a.row) + 1
  return cols / rows
}
