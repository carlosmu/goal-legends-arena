export type ParsedLeaderboard = {
  wins: Record<string, number>
  sessionMax: Record<string, number>
  names: Record<string, string>
  countries: Record<string, string>
}

/** One row for UI (rank 1-based, wallet key = `addr`). */
export type LeaderboardRow = {
  rank: number
  addr: string
  name: string
  wins: number
  streak: number
  country: string
}

export function parseLeaderboardJson(json: string): ParsedLeaderboard {
  try {
    const o = JSON.parse(json) as ParsedLeaderboard
    return {
      wins: o.wins || {},
      sessionMax: o.sessionMax || {},
      names: o.names || {},
      countries: o.countries || {}
    }
  } catch {
    return { wins: {}, sessionMax: {}, names: {}, countries: {} }
  }
}

export function getLeaderboardRows(json: string, maxLines: number): LeaderboardRow[] {
  const { wins, sessionMax, names, countries } = parseLeaderboardJson(json)
  const sorted = Object.keys(wins).sort((a, b) => {
    const wDiff = (wins[b] || 0) - (wins[a] || 0)
    if (wDiff !== 0) return wDiff
    return (sessionMax[b] || 0) - (sessionMax[a] || 0)
  })
  return sorted.slice(0, maxLines).map((addr, i) => {
    const w = wins[addr] || 0
    const ms = sessionMax[addr] || 0
    const name = (names[addr] && names[addr].trim()) || shortAddr(addr)
    const country = countries[addr] || ''
    return { rank: i + 1, addr, name, wins: w, streak: ms, country }
  })
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr || '?'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
