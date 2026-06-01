import { Color4 } from '@dcl/sdk/math'

export const UI_ATLAS_SRC = 'assets/images/UI_atlas.png'
const UI_ATLAS_COLS = 8
const UI_ATLAS_ROWS = 8

/** Splash logo sprite on UI_atlas.png (cells A1–D4). */
export const LOGO_COORD_FROM = 'A1'
export const LOGO_COORD_TO = 'D4'

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

/** “Choose a spot” lobby banner (UI_atlas E2–F2). */
export const WELCOME_SPOT_FROM = 'E2'
export const WELCOME_SPOT_TO = 'F2'
export const WELCOME_SPOT_OVERLAY_FROM = 'G2'
export const WELCOME_SPOT_OVERLAY_TO = 'H2'

export function welcomeChooseSpotBackground() {
  return uiAtlasRangeBackground(WELCOME_SPOT_FROM, WELCOME_SPOT_TO)
}

/** Overlay centered over welcome banner (UI_atlas G2–H2). */
export function welcomeChooseSpotOverlayBackground() {
  return uiAtlasRangeBackground(WELCOME_SPOT_OVERLAY_FROM, WELCOME_SPOT_OVERLAY_TO)
}

/** Pick panel background for Left/Center/Right selector (UI_atlas E2–F2). */
export function pickDirectionPanelBackground() {
  return uiAtlasRangeBackground(WELCOME_SPOT_FROM, WELCOME_SPOT_TO)
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

function pickDirectionTitleHalfBackground(useTopHalf: boolean) {
  const fullUvs = uiAtlasRangeToUvs('G3', 'H3')
  const u0 = fullUvs[0]
  const v0 = fullUvs[1]
  const u1 = fullUvs[4]
  const v1 = fullUvs[5]
  const vm = (v0 + v1) / 2
  return {
    textureMode: 'stretch' as const,
    texture: { src: UI_ATLAS_SRC },
    uvs: useTopHalf
      ? [u0, vm, u0, v1, u1, v1, u1, vm] // Top half: "where to dive"
      : [u0, v0, u0, vm, u1, vm, u1, v0], // Bottom half: "where to shoot"
    color: Color4.White()
  }
}

export function pickDirectionTitleDiveBackground() {
  return pickDirectionTitleHalfBackground(true)
}

export function pickDirectionTitleShootBackground() {
  return pickDirectionTitleHalfBackground(false)
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
