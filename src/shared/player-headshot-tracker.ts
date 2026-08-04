export interface PlayerHeadshotFrame {
  map?: {
    name?: unknown
    phase?: unknown
    round?: unknown
  } | null
  round?: {
    phase?: unknown
  } | null
  phase_countdowns?: {
    phase?: unknown
  } | null
  players?: Array<{
    steamid?: unknown
    state?: {
      round_kills?: unknown
      round_killhs?: unknown
    } | null
  }> | null
}

const ACTIVE_KILL_PHASES = new Set(['live', 'bomb', 'defuse'])

function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

export class PlayerHeadshotTracker {
  private readonly roundsByMap = new Map<string, Map<number, Map<string, number>>>()

  capture(frame: PlayerHeadshotFrame): void {
    const mapId = typeof frame.map?.name === 'string' ? frame.map.name : ''
    const mapPhase = frame.map?.phase
    const roundPhase = frame.round?.phase
    const countdownPhase = frame.phase_countdowns?.phase
    const completedRoundCount = nonNegativeInteger(frame.map?.round)
    const finalRoundFrame = roundPhase === 'over' || mapPhase === 'gameover'
    const activeRoundFrame =
      typeof countdownPhase === 'string' && ACTIVE_KILL_PHASES.has(countdownPhase)
    if (
      !mapId ||
      (mapPhase !== 'live' && mapPhase !== 'gameover') ||
      (!activeRoundFrame && !finalRoundFrame) ||
      completedRoundCount === null ||
      !Array.isArray(frame.players)
    ) {
      return
    }

    const roundIndex = finalRoundFrame ? completedRoundCount : completedRoundCount + 1
    if (roundIndex <= 0) return

    let rounds = this.roundsByMap.get(mapId)
    if (!rounds) {
      rounds = new Map<number, Map<string, number>>()
      this.roundsByMap.set(mapId, rounds)
    }
    let players = rounds.get(roundIndex)
    if (!players) {
      players = new Map<string, number>()
      rounds.set(roundIndex, players)
    }

    for (const player of frame.players) {
      const steamid = typeof player.steamid === 'string' ? player.steamid.trim() : ''
      const roundKills = nonNegativeInteger(player.state?.round_kills)
      const roundHeadshots = nonNegativeInteger(player.state?.round_killhs)
      if (!steamid || roundKills === null || roundHeadshots === null) continue
      const headshotKills = Math.min(roundKills, roundHeadshots)
      players.set(steamid, Math.max(players.get(steamid) ?? 0, headshotKills))
    }
  }

  total(mapId: string, steamid: string): number {
    const rounds = this.roundsByMap.get(mapId)
    if (!rounds) return 0
    let total = 0
    for (const players of rounds.values()) total += players.get(steamid) ?? 0
    return total
  }

  clear(): void {
    this.roundsByMap.clear()
  }
}
