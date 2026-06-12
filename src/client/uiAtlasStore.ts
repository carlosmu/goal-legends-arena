import { Color4 } from '@dcl/sdk/math'

export const UI_ATLAS_SRC = 'assets/images/UI_atlas.png'
const UI_ATLAS_COLS = 8
const UI_ATLAS_ROWS = 16

/**
 * UI_atlas.png se referencia como un grid de 8 columnas (A–H) × 16 filas (1–16).
 * Conversión desde el viejo grid de 8 filas: una celda vieja de fila R ocupa las filas
 * 2R-1 (mitad superior) y 2R (mitad inferior) en este sistema de 16 filas.
 */

/** Splash logo sprite on UI_atlas.png (cells A1–D6). */
export const LOGO_COORD_FROM = 'A1'
export const LOGO_COORD_TO = 'D6'

function parseAtlasCell(coordinates: string): { col: number; row: number } | null {
  const m = /^([A-H])(1[0-6]|[1-9])$/i.exec(coordinates.trim())
  if (!m) return null
  return {
    col: m[1].toUpperCase().charCodeAt(0) - 65,
    row: parseInt(m[2], 10) - 1
  }
}

/** Inclusive range "A1".."D6" → UV quad (8×16 sheet, row 1 = top). */
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

/** Scoreboard panel background (UI_atlas A15–E16). */
export const SCOREBOARD_BG_FROM = 'A15'
export const SCOREBOARD_BG_TO = 'E16'

export function scoreboardBackground() {
  return uiAtlasRangeBackground(SCOREBOARD_BG_FROM, SCOREBOARD_BG_TO)
}

export const WELCOME_SPOT_OVERLAY_FROM = 'E3'
export const WELCOME_SPOT_OVERLAY_TO = 'H5'

/** Overlay centered over welcome banner (UI_atlas E3–H5). */
export function welcomeChooseSpotOverlayBackground() {
  return uiAtlasRangeBackground(WELCOME_SPOT_OVERLAY_FROM, WELCOME_SPOT_OVERLAY_TO)
}

/** Aspect (width / height) of the welcome "pick a spot" overlay, to size its box without stretch. */
export function welcomeChooseSpotOverlayAspect(): number {
  return uiAtlasRangeAspect(WELCOME_SPOT_OVERLAY_FROM, WELCOME_SPOT_OVERLAY_TO)
}

export function pickDirectionLeftBackground() {
  return uiAtlasRangeBackground('E1', 'E2')
}

export function pickDirectionCenterBackground() {
  return uiAtlasRangeBackground('F1', 'F2')
}

export function pickDirectionRightBackground() {
  return uiAtlasRangeBackground('G1', 'G2')
}

/** Selected-state sprites for the L/C/R buttons (E1–E2/F1–F2/G1–G2 → E7–E8/F7–F8/G7–G8). */
export function pickDirectionLeftSelectedBackground() {
  return uiAtlasRangeBackground('E7', 'E8')
}

export function pickDirectionCenterSelectedBackground() {
  return uiAtlasRangeBackground('F7', 'F8')
}

export function pickDirectionRightSelectedBackground() {
  return uiAtlasRangeBackground('G7', 'G8')
}

/** Pick title — DIVE on UI_atlas E11–H11, SHOOT on E12–H12. */
export const PICK_TITLE_DIVE_FROM = 'E11'
export const PICK_TITLE_DIVE_TO = 'H11'
export const PICK_TITLE_SHOOT_FROM = 'E12'
export const PICK_TITLE_SHOOT_TO = 'H12'

export function pickDirectionTitleDiveBackground() {
  return uiAtlasRangeBackground(PICK_TITLE_DIVE_FROM, PICK_TITLE_DIVE_TO)
}

export function pickDirectionTitleShootBackground() {
  return uiAtlasRangeBackground(PICK_TITLE_SHOOT_FROM, PICK_TITLE_SHOOT_TO)
}

/** Aspect (width / height) of the pick title sprites (DIVE and SHOOT share the same shape). */
export function pickDirectionTitleAspect(): number {
  return uiAtlasRangeAspect(PICK_TITLE_DIVE_FROM, PICK_TITLE_DIVE_TO)
}

/** “Waiting for opponent” title — UI_atlas A12–D12. */
export const WAITING_TITLE_FROM = 'A12'
export const WAITING_TITLE_TO = 'D12'

export function waitingOpponentTitleBackground() {
  return uiAtlasRangeBackground(WAITING_TITLE_FROM, WAITING_TITLE_TO)
}

/** Aspect (width / height) of the waiting title sprite, to size its box without stretch. */
export function waitingOpponentTitleAspect(): number {
  return uiAtlasRangeAspect(WAITING_TITLE_FROM, WAITING_TITLE_TO)
}

/** Waiting panel: PvE (single player) — UI_atlas E6–F6. */
export const WAITING_PVE_FROM = 'E6'
export const WAITING_PVE_TO = 'F6'

export function waitingOpponentPvEButtonBackground() {
  return uiAtlasRangeBackground(WAITING_PVE_FROM, WAITING_PVE_TO)
}

/** Waiting panel: Cancel — UI_atlas G6–H6. */
export function waitingOpponentCancelButtonBackground() {
  return uiAtlasRangeBackground('G6', 'H6')
}

/** Aspect (width / height) of the waiting panel buttons (both share the same shape). */
export function waitingOpponentButtonAspect(): number {
  return uiAtlasRangeAspect(WAITING_PVE_FROM, WAITING_PVE_TO)
}

/** Leaderboard title — UI_atlas A13–C13. */
export const LEADERBOARD_TITLE_FROM = 'A13'
export const LEADERBOARD_TITLE_TO = 'C13'

export function leaderboardTitleBackground() {
  return uiAtlasRangeBackground(LEADERBOARD_TITLE_FROM, LEADERBOARD_TITLE_TO)
}

/** Aspect (width / height) of the Leaderboard title sprite, to size its box without stretch. */
export function leaderboardTitleAspect(): number {
  return uiAtlasRangeAspect(LEADERBOARD_TITLE_FROM, LEADERBOARD_TITLE_TO)
}

/** 3D spot billboards (UI_atlas A7–A8). */
export const SPOT_BILLBOARD_FROM = 'A7'
export const SPOT_BILLBOARD_TO = 'A8'

export function spotBillboardPlaneUvs(): number[] {
  return uiAtlasRangeToUvs(SPOT_BILLBOARD_FROM, SPOT_BILLBOARD_TO)
}

const UI_ATLAS_PX = 1024
const HALF_TEXEL_U = 0.5 / UI_ATLAS_PX
const HALF_TEXEL_V = 0.5 / UI_ATLAS_PX

/** UVs for one ninth (3×3 grid) of an atlas range. Insets half-texel on internal edges. */
function uiAtlasRangeNinthUvs(from: string, to: string, ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9): number[] {
  const full = uiAtlasRangeToUvs(from, to)
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

/** One of nine slices from an atlas range: 1–3 top, 4–6 middle, 7–9 bottom. */
function atlasFrameSlice(from: string, to: string, ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return {
    textureMode: 'stretch' as const,
    texture: { src: UI_ATLAS_SRC },
    uvs: uiAtlasRangeNinthUvs(from, to, ninth),
    color: Color4.White()
  }
}

/** Backwards-compatible single-cell nine-slice. */
export function atlasCellFrameSliceBackground(cell: string, ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasFrameSlice(cell, cell, ninth)
}

/** Leaderboard panel frame: UI_atlas H1–H2, split 3×3 (1–9 row-major). */
export const LEADERBOARD_FRAME_FROM = 'H1'
export const LEADERBOARD_FRAME_TO = 'H2'

export function leaderboardFrameSliceBackground(ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasFrameSlice(LEADERBOARD_FRAME_FROM, LEADERBOARD_FRAME_TO, ninth)
}

/** Country picker panel frame: UI_atlas B7–B8. */
export const COUNTRY_PICKER_FRAME_FROM = 'B7'
export const COUNTRY_PICKER_FRAME_TO = 'B8'

export function countryPickerFrameSliceBackground(ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasFrameSlice(COUNTRY_PICKER_FRAME_FROM, COUNTRY_PICKER_FRAME_TO, ninth)
}

/** Width/height aspect of an atlas range, from its UVs (grid-agnostic). Use it to size a UI
 *  box to the sprite's real proportions so `stretch` doesn't distort it. */
export function uiAtlasRangeAspect(from: string, to: string): number {
  const uvs = uiAtlasRangeToUvs(from, to)
  const uW = uvs[4] - uvs[0]
  const vH = uvs[5] - uvs[1]
  // UI_atlas is square (1024×1024) so UV-space width/height equals pixel aspect.
  return vH === 0 ? 1 : uW / vH
}

/** Leave match dialog title — UI_atlas A14–C14. */
export const LEAVE_MATCH_TITLE_FROM = 'A14'
export const LEAVE_MATCH_TITLE_TO = 'C14'

export function leaveMatchTitleBackground() {
  return uiAtlasRangeBackground(LEAVE_MATCH_TITLE_FROM, LEAVE_MATCH_TITLE_TO)
}

/** Aspect (width / height) of the Leave Match title sprite, to size its box without stretch. */
export function leaveMatchTitleAspect(): number {
  return uiAtlasRangeAspect(LEAVE_MATCH_TITLE_FROM, LEAVE_MATCH_TITLE_TO)
}

/** Leave match: No — UI_atlas E10–F10. */
export const LEAVE_MATCH_NO_FROM = 'E10'
export const LEAVE_MATCH_NO_TO = 'F10'

export function leaveMatchNoButtonBackground() {
  return uiAtlasRangeBackground(LEAVE_MATCH_NO_FROM, LEAVE_MATCH_NO_TO)
}

/** Leave match: Yes — UI_atlas G10–H10. */
export function leaveMatchYesButtonBackground() {
  return uiAtlasRangeBackground('G10', 'H10')
}

/** Aspect (width / height) of the Leave Match Yes/No buttons (both share the same shape). */
export function leaveMatchButtonAspect(): number {
  return uiAtlasRangeAspect(LEAVE_MATCH_NO_FROM, LEAVE_MATCH_NO_TO)
}

/** Goal/Save result panel frame: UI_atlas C9–C10. */
export const GOAL_SAVE_FRAME_FROM = 'C9'
export const GOAL_SAVE_FRAME_TO = 'C10'

export function goalSaveFrameSliceBackground(ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasFrameSlice(GOAL_SAVE_FRAME_FROM, GOAL_SAVE_FRAME_TO, ninth)
}

/** Match-end "left the match" / timeout panel frame: UI_atlas D9–D10. */
export const MATCH_END_FRAME_FROM = 'D9'
export const MATCH_END_FRAME_TO = 'D10'

export function matchEndFrameSliceBackground(ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasFrameSlice(MATCH_END_FRAME_FROM, MATCH_END_FRAME_TO, ninth)
}

/** Inactivity-timeout countdown pill frame: UI_atlas D9–D10. */
export const TIMEOUT_FRAME_FROM = 'D9'
export const TIMEOUT_FRAME_TO = 'D10'

export function timeoutFrameSliceBackground(ninth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9) {
  return atlasFrameSlice(TIMEOUT_FRAME_FROM, TIMEOUT_FRAME_TO, ninth)
}

/** Flag selector nav — Prev on UI_atlas C8, Next on C9. */
export const PICKER_PREV_CELL = 'C8'
export const PICKER_NEXT_CELL = 'D8'

export function flagPickerPrevBackground() {
  return uiAtlasRangeBackground(PICKER_PREV_CELL, PICKER_PREV_CELL)
}

export function flagPickerNextBackground() {
  return uiAtlasRangeBackground(PICKER_NEXT_CELL, PICKER_NEXT_CELL)
}

/** Aspect (width / height) of the flag selector nav buttons (single cell, shared shape). */
export function flagPickerNavAspect(): number {
  return uiAtlasRangeAspect(PICKER_PREV_CELL, PICKER_PREV_CELL)
}

/** "World Cup 2026" subtitle — UI_atlas C7–D7. */
export const WORLD_CUP_FROM = 'C7'
export const WORLD_CUP_TO = 'D7'

export function worldCup2026Background() {
  return uiAtlasRangeBackground(WORLD_CUP_FROM, WORLD_CUP_TO)
}

export function worldCup2026Aspect(): number {
  return uiAtlasRangeAspect(WORLD_CUP_FROM, WORLD_CUP_TO)
}

/** "Select your flag" title — UI_atlas E13–H13. */
export const SELECT_FLAG_FROM = 'D13'
export const SELECT_FLAG_TO = 'G13'

export function selectYourFlagBackground() {
  return uiAtlasRangeBackground(SELECT_FLAG_FROM, SELECT_FLAG_TO)
}

export function selectYourFlagAspect(): number {
  return uiAtlasRangeAspect(SELECT_FLAG_FROM, SELECT_FLAG_TO)
}

/** Match-end (no winner: timeout / left / disconnect) message — UI_atlas D14–E14. */
export const MATCH_END_MSG_FROM = 'D14'
export const MATCH_END_MSG_TO = 'E14'

export function matchEndMessageBackground() {
  return uiAtlasRangeBackground(MATCH_END_MSG_FROM, MATCH_END_MSG_TO)
}

export function matchEndMessageAspect(): number {
  return uiAtlasRangeAspect(MATCH_END_MSG_FROM, MATCH_END_MSG_TO)
}

/** "Face the winner?" title — UI_atlas A11–D11. */
export const FACE_WINNER_FROM = 'A11'
export const FACE_WINNER_TO = 'D11'

export function faceTheWinnerBackground() {
  return uiAtlasRangeBackground(FACE_WINNER_FROM, FACE_WINNER_TO)
}

export function faceTheWinnerAspect(): number {
  return uiAtlasRangeAspect(FACE_WINNER_FROM, FACE_WINNER_TO)
}

/** "Stay on this spot?" title — UI_atlas A12–D12. */
export const STAY_ON_SPOT_FROM = 'A12'
export const STAY_ON_SPOT_TO = 'D12'

export function stayOnSpotBackground() {
  return uiAtlasRangeBackground(STAY_ON_SPOT_FROM, STAY_ON_SPOT_TO)
}

export function stayOnSpotAspect(): number {
  return uiAtlasRangeAspect(STAY_ON_SPOT_FROM, STAY_ON_SPOT_TO)
}

/** GOAL — UI_atlas A9–B9. */
export function goalSaveGoalBannerBackground() {
  return uiAtlasRangeBackground('A9', 'B9')
}

/** SAVE — UI_atlas A10–B10. */
export function goalSaveSaveBannerBackground() {
  return uiAtlasRangeBackground('A10', 'B10')
}

/** Aspect (width / height) of the scoreboard bg sprite (grid-agnostic). */
export function scoreboardAtlasAspect(): number {
  return uiAtlasRangeAspect(SCOREBOARD_BG_FROM, SCOREBOARD_BG_TO)
}
