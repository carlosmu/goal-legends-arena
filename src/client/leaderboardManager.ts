/** Which match type to rank by. */
export type LeaderboardMode = 'pvp' | 'pve'
/** Which win tally to rank by: cumulative ('all') or current daily bucket ('day'). */
export type LeaderboardPeriod = 'all' | 'day'

export type ParsedLeaderboard = {
  pvpWins: Record<string, number>
  pvpDayWins: Record<string, number>
  pveWins: Record<string, number>
  pveDayWins: Record<string, number>
  names: Record<string, string>
  countries: Record<string, string>
  /** Day key (YYYY-MM-DD, 09:00 UTC boundary) the `*DayWins` buckets belong to; '' if unset. */
  dayKey: string
}

/** One row for UI (rank 1-based, wallet key = `addr`). */
export type LeaderboardRow = {
  rank: number
  addr: string
  name: string
  wins: number
  country: string
}

export function parseLeaderboardJson(json: string): ParsedLeaderboard {
  try {
    const o = JSON.parse(json) as Record<string, unknown>
    const rec = (v: unknown): Record<string, number> =>
      v && typeof v === 'object' ? (v as Record<string, number>) : {}
    const recS = (v: unknown): Record<string, string> =>
      v && typeof v === 'object' ? (v as Record<string, string>) : {}
    return {
      // Fall back to the legacy `wins`/`dayWins` keys (pre-PvE leaderboard).
      pvpWins: rec(o.pvpWins ?? o.wins),
      pvpDayWins: rec(o.pvpDayWins ?? o.dayWins),
      pveWins: rec(o.pveWins),
      pveDayWins: rec(o.pveDayWins),
      names: recS(o.names),
      countries: recS(o.countries),
      dayKey: typeof o.dayKey === 'string' ? o.dayKey : ''
    }
  } catch {
    return { pvpWins: {}, pvpDayWins: {}, pveWins: {}, pveDayWins: {}, names: {}, countries: {}, dayKey: '' }
  }
}

function bucketFor(p: ParsedLeaderboard, mode: LeaderboardMode, period: LeaderboardPeriod): Record<string, number> {
  if (mode === 'pve') return period === 'day' ? p.pveDayWins : p.pveWins
  return period === 'day' ? p.pvpDayWins : p.pvpWins
}

export function getLeaderboardRows(
  json: string,
  maxLines: number,
  mode: LeaderboardMode = 'pvp',
  period: LeaderboardPeriod = 'all'
): LeaderboardRow[] {
  const parsed = parseLeaderboardJson(json)
  const { names, countries } = parsed
  const wins = bucketFor(parsed, mode, period)
  const sorted = Object.keys(wins).sort((a, b) => {
    const wDiff = (wins[b] || 0) - (wins[a] || 0)
    if (wDiff !== 0) return wDiff
    const na = ((names[a] && names[a].trim()) || a).toLowerCase()
    const nb = ((names[b] && names[b].trim()) || b).toLowerCase()
    return na.localeCompare(nb)
  })
  return sorted.slice(0, maxLines).map((addr, i) => {
    const w = wins[addr] || 0
    const name = (names[addr] && names[addr].trim()) || shortAddr(addr)
    const country = countries[addr] || ''
    return { rank: i + 1, addr, name, wins: w, country }
  })
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr || '?'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
