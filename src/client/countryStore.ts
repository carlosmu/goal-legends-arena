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
  localCountry = ''
  localRandomCountrySent = false
  displayIsoByAddr.clear()
}

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
/** Default avatar when profile face URL is unavailable (mobile, guest, fetch failed). */
export const DEFAULT_PROFILE_PIC_COORD = 'G7'
/** Extra badges on scoreboard player-B row (flags.png). */
export const SCOREBOARD_BADGE_F7 = 'F7'
export const SCOREBOARD_BADGE_E7 = 'E7'
/** Splash "Start" button on flags.png (normal / hover, row 8). */
export const SPLASH_START_NORMAL = ['A8', 'B8', 'C8'] as const
export const SPLASH_START_HOVER = ['D8', 'E8', 'F8'] as const

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
  return atlasCellBackground(DEFAULT_PROFILE_PIC_COORD)
}

/** Profile face from lambdas, or flags.png G7 if missing / loading / failed. */
export function facePicBackground(faceUrl: string | undefined) {
  if (faceUrl) {
    return {
      textureMode: 'stretch' as const,
      texture: { src: faceUrl },
      color: Color4.White()
    }
  }
  return defaultProfilePicBackground()
}

export function scoreboardBadgeF7Background() {
  return atlasCellBackground(SCOREBOARD_BADGE_F7)
}

export function scoreboardBadgeE7Background() {
  return atlasCellBackground(SCOREBOARD_BADGE_E7)
}

/** Splash Start: A8+B8+C8 normal, D8+E8+F8 hover (single texture, no Button children). */
export function splashStartButtonBackground(hover = false) {
  const coords = hover ? [...SPLASH_START_HOVER] : [...SPLASH_START_NORMAL]
  return atlasCellsHorizontalBackground(coords)
}

/** uiBackground for a country flag sprite (flags.png atlas). */
export function flagBackground(iso: string) {
  const country = getCountryByIso(iso)
  if (!country?.coordinates) {
    return { color: Color4.create(0, 0, 0, 0) }
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
