import countriesJson from '../data/countries.json'

const COUNTRY_ISOS: string[] = (countriesJson as { iso: string }[]).map((c) => c.iso.toLowerCase())
const VALID_ISOS = new Set(COUNTRY_ISOS)

export function isValidCountryIso(iso: string): boolean {
  const k = iso.trim().toLowerCase()
  return !!k && VALID_ISOS.has(k)
}

export function pickRandomCountryIso(): string {
  if (!COUNTRY_ISOS.length) return ''
  return COUNTRY_ISOS[Math.floor(Math.random() * COUNTRY_ISOS.length)]!
}
