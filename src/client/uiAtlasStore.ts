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
