import { Color4 } from '@dcl/sdk/math'
import { room } from '../shared/messages'
import countriesJson from '../data/countries.json'

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

export function getLocalCountry(): string {
  return localCountry
}

export function isPickerOpen(): boolean {
  return pickerOpen
}

/** Called on first load to pre-populate from server snapshot. */
export function initLocalCountryFromSnapshot(iso: string) {
  if (!localCountry && iso) localCountry = iso
}

export function openPicker() {
  pickerOpen = true
}

export function closePicker() {
  pickerOpen = false
}

export function selectCountry(iso: string) {
  localCountry = iso
  pickerOpen = false
  room.send('setCountry', { iso })
}

/** Grid cell "A1".."H8" → UV quad for flags.png (8×8, row 1 = top). */
export function flagCoordinatesToUvs(coordinates: string): number[] {
  const m = /^([A-H])([1-8])$/i.exec(coordinates.trim())
  if (!m) return [0, 0, 0, 1, 1, 1, 1, 0]
  const col = m[1].toUpperCase().charCodeAt(0) - 65
  const row = parseInt(m[2], 10) - 1
  const u0 = col / FLAG_GRID_COLS
  const u1 = (col + 1) / FLAG_GRID_COLS
  const v0 = (FLAG_GRID_ROWS - row - 1) / FLAG_GRID_ROWS
  const v1 = (FLAG_GRID_ROWS - row) / FLAG_GRID_ROWS
  return [u0, v0, u0, v1, u1, v1, u1, v0]
}

export function getCountryByIso(iso: string): Country | undefined {
  const k = iso.toLowerCase()
  return COUNTRIES.find((c) => c.iso.toLowerCase() === k)
}

/** PvE training AI sprites on flags.png atlas. */
export const ENGINE_FLAG_COORD = 'A7'
export const ENGINE_PIC_COORD = 'B7'

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

/** uiBackground for a country flag sprite (flags.png atlas). */
export function flagBackground(iso: string) {
  const country = getCountryByIso(iso)
  if (!country?.coordinates) {
    return { color: Color4.create(0, 0, 0, 0) }
  }
  return atlasCellBackground(country.coordinates)
}
