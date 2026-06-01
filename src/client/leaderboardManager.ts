export type ParsedLeaderboard = {
  wins: Record<string, number>
  names: Record<string, string>
  countries: Record<string, string>
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
    const o = JSON.parse(json) as ParsedLeaderboard & { sessionMax?: Record<string, number> }
    return {
      wins: o.wins || {},
      names: o.names || {},
      countries: o.countries || {}
    }
  } catch {
    return { wins: {}, names: {}, countries: {} }
  }
}

export function getLeaderboardRows(json: string, maxLines: number): LeaderboardRow[] {
  const { wins, names, countries } = parseLeaderboardJson(json)
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
