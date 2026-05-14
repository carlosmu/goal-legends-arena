import type { AimDirection } from '../shared/gameState'

export function parseDir(raw: string): AimDirection | null {
  const u = raw.toUpperCase()
  if (u === 'L' || u === 'LEFT') return 'L'
  if (u === 'C' || u === 'CENTER') return 'C'
  if (u === 'R' || u === 'RIGHT') return 'R'
  return null
}

export function randomDir(): AimDirection {
  const d: AimDirection[] = ['L', 'C', 'R']
  return d[(Math.random() * 3) | 0]
}

/** For upcoming shots `fromShot` (0-based, next shot index) through 9 inclusive — regulation only. */
export function maxGoalsIfScoreAllRemainingKicks(
  fromShot: number,
  firstKickerIsRed: number,
  forRed: boolean
): number {
  let n = 0
  for (let i = fromShot; i < 10; i++) {
    const kickerRed = i % 2 === 0 ? firstKickerIsRed === 1 : firstKickerIsRed === 0
    if (forRed && kickerRed) n++
    if (!forRed && !kickerRed) n++
  }
  return n
}

/** Returns 'red' | 'blue' | null if regulation cannot end yet by math. */
export function regulationEarlyWinner(
  redScore: number,
  blueScore: number,
  /** Next shot index (shot not yet taken). */
  nextShotIndex: number,
  firstKickerIsRed: number
): 'red' | 'blue' | null {
  if (nextShotIndex >= 10) return null
  const fk = firstKickerIsRed
  const maxRedAdd = maxGoalsIfScoreAllRemainingKicks(nextShotIndex, fk, true)
  const maxBlueAdd = maxGoalsIfScoreAllRemainingKicks(nextShotIndex, fk, false)
  if (redScore > blueScore + maxBlueAdd) return 'red'
  if (blueScore > redScore + maxRedAdd) return 'blue'
  return null
}

export function suddenDeathWinner(redScore: number, blueScore: number): 'red' | 'blue' | null {
  if (redScore === blueScore) return null
  return redScore > blueScore ? 'red' : 'blue'
}
