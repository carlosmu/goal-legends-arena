export type ParsedLeaderboard = {
  wins: Record<string, number>
  sessionMax: Record<string, number>
  names: Record<string, string>
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

export function formatLeaderboardLines(json: string, maxLines: number): string[] {
  const { wins, sessionMax, names } = parseLeaderboardJson(json)
  const rows = Object.keys(wins).map((addr) => {
    const w = wins[addr] || 0
    const ms = sessionMax[addr] || 0
    const label = (names[addr] && names[addr].trim()) || shortAddr(addr)
    return { addr, line: `${label} — wins: ${w} | max streak: ${ms}` }
  })
  rows.sort((a, b) => (wins[b.addr] || 0) - (wins[a.addr] || 0))
  return rows.slice(0, maxLines).map((r) => r.line)
}

function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr || '?'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
