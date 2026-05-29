import countriesJson from '../data/countries.json'

const COUNTRY_ISOS: string[] = (countriesJson as { iso: string }[]).map((c) => c.iso.toLowerCase())
const VALID_ISOS = new Set(COUNTRY_ISOS)

export function pickRandomCountryIso(): string {
  if (!COUNTRY_ISOS.length) return ''
  return COUNTRY_ISOS[Math.floor(Math.random() * COUNTRY_ISOS.length)]!
}

/** Same seed → same country (for display when iso is still empty). */
export function countryIsoFromSeed(seed: string): string {
  if (!COUNTRY_ISOS.length) return ''
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  return COUNTRY_ISOS[Math.abs(h) % COUNTRY_ISOS.length]!
}

export function resolveCountryIso(iso: string, seed: string): string {
  const k = iso.trim().toLowerCase()
  if (k && VALID_ISOS.has(k)) return k
  if (seed) return countryIsoFromSeed(seed)
  return pickRandomCountryIso()
}
