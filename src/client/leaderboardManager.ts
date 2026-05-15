export type ParsedLeaderboard = {
  wins: Record<string, number>
  sessionMax: Record<string, number>
  names: Record<string, string>
}

/** One row for UI (rank 1-based, wallet key = `addr`). */
export type LeaderboardRow = {
  rank: number
  addr: string
  name: string
  wins: number
  streak: number
}

export function parseLeaderboardJson(json: string): ParsedLeaderboard {
  try {
    const o = JSON.parse(json) as ParsedLeaderboard
    return {
      wins: o.wins || {},
      sessionMax: o.sessionMax || {},
      names: o.names || {}
    }
  } catch {
    return { wins: {}, sessionMax: {}, names: {} }
  }
}

export function getLeaderboardRows(json: string, maxLines: number): LeaderboardRow[] {
  const { wins, sessionMax, names } = parseLeaderboardJson(json)
  const sorted = Object.keys(wins).sort((a, b) => (wins[b] || 0) - (wins[a] || 0))
  return sorted.slice(0, maxLines).map((addr, i) => {
    const w = wins[addr] || 0
    const ms = sessionMax[addr] || 0
    const name = (names[addr] && names[addr].trim()) || shortAddr(addr)
    return { rank: i + 1, addr, name, wins: w, streak: ms }
  })
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr || '?'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
