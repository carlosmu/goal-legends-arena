import { room } from '../shared/messages'
import countriesJson from '../data/countries.json'

export type Country = {
  name: string
  code: string
  iso: string
  flag: string
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

export function flagSrc(iso: string): string {
  return `assets/images/flags/${iso}.png`
}
