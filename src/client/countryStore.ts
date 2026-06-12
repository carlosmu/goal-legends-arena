import { Color4 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import { isValidCountryIso, pickRandomCountryIso } from '../shared/countryUtils'
import countriesJson from '../data/countries.json'

export { pickRandomCountryIso }

export const FLAGS_SHEET_SRC = 'assets/images/flags.png'
const FLAG_GRID_COLS = 8
const FLAG_GRID_ROWS = 8

export type Country = {
  name: string
  code: string
  iso: string
  group: string
  flag: string
  coordinates: string
}

export const COUNTRIES: Country[] = countriesJson as Country[]

/** iso of the local player's selected country (empty = not chosen yet). */
let localCountry = ''
/** true = show country picker UI */
let pickerOpen = false
/** Local-only “Selected country” overlay until this timestamp (ms). */
let countryConfirmUntilMs = 0
const COUNTRY_CONFIRM_MS = 2000
/** true after we sent a one-time random country for this session. */
let localRandomCountrySent = false
/** Display-only fallback per addr when server iso not synced yet (never re-rolled). */
const displayIsoByAddr = new Map<string, string>()

export function getLocalCountry(): string {
  return localCountry
}

export function isPickerOpen(): boolean {
  return pickerOpen
}

export function isCountryConfirmVisible(): boolean {
  return Date.now() < countryConfirmUntilMs
}

/** Called on first load to pre-populate from server snapshot. */
export function initLocalCountryFromSnapshot(iso: string) {
  if (!iso || !isValidCountryIso(iso)) return
  localCountry = iso
  localRandomCountrySent = true
}

export function openPicker() {
  pickerOpen = true
}

export function closePicker() {
  pickerOpen = false
}

export function resetCountryPicker(): void {
  pickerOpen = false
  countryConfirmUntilMs = 0
  localCountry = ''
  localRandomCountrySent = false
  displayIsoByAddr.clear()
}

/** Picker click: sync + 2s local confirmation overlay. */
export function selectCountryFromPicker(iso: string) {
  if (!isValidCountryIso(iso)) return
  localCountry = iso
  localRandomCountrySent = true
  pickerOpen = false
  countryConfirmUntilMs = Date.now() + COUNTRY_CONFIRM_MS
  room.send('setCountry', { iso })
}

/** Silent set (random assign, etc.) — no confirmation overlay. */
export function selectCountry(iso: string) {
  if (!isValidCountryIso(iso)) return
  localCountry = iso
  localRandomCountrySent = true
  pickerOpen = false
  room.send('setCountry', { iso })
}

/**
 * If the local player is in a spot but has no country in state, pick one random
 * and sync once (until they change it in the picker).
 */
/** One-time random + setCountry when server snapshot has no flag yet. */
export function assignRandomCountryIfNeeded(snapshotIso: string) {
  if (isValidCountryIso(snapshotIso) || isValidCountryIso(localCountry) || localRandomCountrySent) return
  localRandomCountrySent = true
  selectCountry(pickRandomCountryIso())
}

function parseAtlasCell(coordinates: string): { col: number; row: number } | null {
  const m = /^([A-H])([1-8])$/i.exec(coordinates.trim())
  if (!m) return null
  return { col: m[1].toUpperCase().charCodeAt(0) - 65, row: parseInt(m[2], 10) - 1 }
}

/** Grid cell "A1".."H8" → UV quad for flags.png (8×8, row 1 = top). */
export function flagCoordinatesToUvs(coordinates: string): number[] {
  const cell = parseAtlasCell(coordinates)
  if (!cell) return [0, 0, 0, 1, 1, 1, 1, 0]
  const u0 = cell.col / FLAG_GRID_COLS
  const u1 = (cell.col + 1) / FLAG_GRID_COLS
  const v0 = (FLAG_GRID_ROWS - cell.row - 1) / FLAG_GRID_ROWS
  const v1 = (FLAG_GRID_ROWS - cell.row) / FLAG_GRID_ROWS
  return [u0, v0, u0, v1, u1, v1, u1, v0]
}

/** Adjacent cells on the same row (e.g. A8+B8+C8) as one wide sprite. */
export function atlasCellsHorizontalBackground(coords: string[]) {
  if (!coords.length) {
    return { color: Color4.create(0, 0, 0, 0) }
  }
  const cells = coords.map(parseAtlasCell).filter((c): c is { col: number; row: number } => c !== null)
  if (!cells.length) return atlasCellBackground(coords[0]!)
  const row = cells[0]!.row
  if (!cells.every((c) => c.row === row)) return atlasCellBackground(coords[0]!)
  const minCol = Math.min(...cells.map((c) => c.col))
  const maxCol = Math.max(...cells.map((c) => c.col))
  const u0 = minCol / FLAG_GRID_COLS
  const u1 = (maxCol + 1) / FLAG_GRID_COLS
  const v0 = (FLAG_GRID_ROWS - row - 1) / FLAG_GRID_ROWS
  const v1 = (FLAG_GRID_ROWS - row) / FLAG_GRID_ROWS
  return {
    textureMode: 'stretch' as const,
    texture: { src: FLAGS_SHEET_SRC },
    uvs: [u0, v0, u0, v1, u1, v1, u1, v0],
    color: Color4.White()
  }
}

export function getCountryByIso(iso: string): Country | undefined {
  const k = iso.toLowerCase()
  return COUNTRIES.find((c) => c.iso.toLowerCase() === k)
}

/** PvE / team sprites on flags.png atlas. */
export const ENGINE_FLAG_COORD = 'A7'
export const ENGINE_PIC_COORD = 'B7'
export const BLUE_PIC_BG_COORD = 'C7'
export const RED_PIC_BG_COORD = 'D7'
/**
 * Default avatar when profile face URL is unavailable (mobile, guest, fetch failed).
 * Standalone full-size image — NOT an atlas cell. Using a dedicated texture with a
 * full quad UV avoids the React-ECS reconciler bug where swapping a face texture for
 * an atlas cell kept the old full-quad UVs and showed the whole sheet.
 */
export const FALLBACK_PROFILE_PIC_SRC = 'assets/images/fallback_profile_pic.png'
/** Fallback flag when a player's country is unknown/cleared (e.g. after they leave). */
export const FALLBACK_FLAG_COORD = 'G8'
/** Extra badges on scoreboard player-B row (flags.png). */
export const SCOREBOARD_BADGE_F7 = 'F7'
export const SCOREBOARD_BADGE_H7 = 'H7'
export const SCOREBOARD_BADGE_E7 = 'E7'
/**
 * Splash "Start" button on flags.png row 8 — 2.5 cells per state (saves atlas space):
 * normal = A8 + B8 + left half of C8 (cols 0→2.5); hover = right half of C8 + D8 + E8 (cols 2.5→5).
 */
const SPLASH_START_ROW = 8
const SPLASH_START_NORMAL_COLS: [number, number] = [0, 2.5]
const SPLASH_START_HOVER_COLS: [number, number] = [2.5, 5]

/** uiBackground for a cell on flags.png (e.g. "A7"). */
export function atlasCellBackground(coordinates: string) {
  return {
    textureMode: 'stretch' as const,
    texture: { src: FLAGS_SHEET_SRC },
    uvs: flagCoordinatesToUvs(coordinates),
    color: Color4.White()
  }
}

export function engineFlagBackground() {
  return atlasCellBackground(ENGINE_FLAG_COORD)
}

export function enginePicBackground() {
  return atlasCellBackground(ENGINE_PIC_COORD)
}

export function bluePicBgBackground() {
  return atlasCellBackground(BLUE_PIC_BG_COORD)
}

export function redPicBgBackground() {
  return atlasCellBackground(RED_PIC_BG_COORD)
}

export function defaultProfilePicBackground() {
  return {
    textureMode: 'stretch' as const,
    texture: { src: FALLBACK_PROFILE_PIC_SRC },
    uvs: [0, 0, 0, 1, 1, 1, 1, 0],
    color: Color4.White()
  }
}

/** Profile face from lambdas, or the standalone fallback image if missing / loading / failed. */
export function facePicBackground(faceUrl: string | undefined) {
  if (faceUrl) {
    return {
      textureMode: 'stretch' as const,
      texture: { src: faceUrl },
      // Full quad UVs. The fallback also uses a standalone full-size texture with the same
      // full quad UVs, so both states are identical except for `src`. Even if React-ECS
      // reuses a slot and keeps stale UVs when swapping textures, the image still renders
      // correctly (the whole texture IS the picture) — no atlas bleed possible.
      uvs: [0, 0, 0, 1, 1, 1, 1, 0],
      color: Color4.White()
    }
  }
  return defaultProfilePicBackground()
}

export function scoreboardBadgeF7Background() {
  return atlasCellBackground(SCOREBOARD_BADGE_F7)
}

export function scoreboardBadgeH7Background() {
  return atlasCellBackground(SCOREBOARD_BADGE_H7)
}

export function scoreboardBadgeE7Background() {
  return atlasCellBackground(SCOREBOARD_BADGE_E7)
}

/** flags.png background for a fractional column span on a given row (cols may be half-cells). */
function flagsRowSpanBackground(rowOneBased: number, colStart: number, colEnd: number) {
  const row = rowOneBased - 1
  const u0 = colStart / FLAG_GRID_COLS
  const u1 = colEnd / FLAG_GRID_COLS
  const v0 = (FLAG_GRID_ROWS - row - 1) / FLAG_GRID_ROWS
  const v1 = (FLAG_GRID_ROWS - row) / FLAG_GRID_ROWS
  return {
    textureMode: 'stretch' as const,
    texture: { src: FLAGS_SHEET_SRC },
    uvs: [u0, v0, u0, v1, u1, v1, u1, v0],
    color: Color4.White()
  }
}

/** Splash Start: 2.5 cells per state (single texture, no Button children). */
export function splashStartButtonBackground(hover = false) {
  const [c0, c1] = hover ? SPLASH_START_HOVER_COLS : SPLASH_START_NORMAL_COLS
  return flagsRowSpanBackground(SPLASH_START_ROW, c0, c1)
}

/** Aspect (width / height) of the splash Start button sprite (2.5 cols × 1 square row). */
export function splashStartButtonAspect(): number {
  return SPLASH_START_NORMAL_COLS[1] - SPLASH_START_NORMAL_COLS[0]
}

/** uiBackground for a country flag sprite (flags.png atlas). */
export function flagBackground(iso: string) {
  const country = getCountryByIso(iso)
  if (!country?.coordinates) {
    return atlasCellBackground(FALLBACK_FLAG_COORD)
  }
  return atlasCellBackground(country.coordinates)
}

function displayIsoForPlayer(iso: string, addr: string): string {
  if (isValidCountryIso(iso)) return iso.trim().toLowerCase()
  const key = addr.trim().toLowerCase()
  if (!key) return ''
  const cached = displayIsoByAddr.get(key)
  if (cached) return cached
  const picked = pickRandomCountryIso()
  if (picked) displayIsoByAddr.set(key, picked)
  return picked
}

/** Flag for a player; uses server iso, or one cached random per addr until synced. */
export function flagBackgroundForPlayer(iso: string, addr: string) {
  return flagBackground(displayIsoForPlayer(iso, addr))
}
