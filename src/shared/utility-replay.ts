import { BP_MAPS, type BPMapId } from './bp'
import { radarAssetPathForMap, type RadarCoordinate } from './radar'

export const MATCH_UTILITY_REPLAY_STATE_KEY = 'matchUtilityReplayV1'
export const UTILITY_REPLAY_ROUND_DURATION_MS = 30_000
export const UTILITY_REPLAY_PAGE_COUNT = 4
export const UTILITY_REPLAY_TOTAL_DURATION_MS =
  UTILITY_REPLAY_ROUND_DURATION_MS * UTILITY_REPLAY_PAGE_COUNT
export const UTILITY_REPLAY_EVENT_TYPES = ['smoke', 'flashbang', 'firebomb', 'inferno'] as const
export const UTILITY_REPLAY_SIDES = ['CT', 'T'] as const

export type UtilityReplayEventType = (typeof UTILITY_REPLAY_EVENT_TYPES)[number]
export type UtilityReplaySide = (typeof UTILITY_REPLAY_SIDES)[number]
export type UtilityReplayTrajectoryPoint = [timeMs: number, radarX: number, radarY: number]
export type UtilityReplayFlameFrame = [timeMs: number, positions: RadarCoordinate[]]

export interface UtilityReplayPlayerPath {
  steamId: string
  roundIndex: number
  teamId: string
  side: UtilityReplaySide
  trajectory: UtilityReplayTrajectoryPoint[]
}

export interface UtilityReplayRound {
  roundIndex: number
  teamCTId: string
  teamTId: string
  unassignedGrenadeCount: number
}

export interface UtilityReplayEvent {
  id: string
  grenadeId: string
  roundIndex: number
  teamId: string
  side: UtilityReplaySide
  type: UtilityReplayEventType
  trajectory: UtilityReplayTrajectoryPoint[]
  flameFrames: UtilityReplayFlameFrame[]
  effectStartedAtMs: number | null
  effectEndedAtMs: number | null
  explodedAtMs: number | null
  endedAtMs: number | null
}

export interface MapUtilityReplay {
  version: 2
  mapId: BPMapId
  radarAssetPath: string
  durationMs: typeof UTILITY_REPLAY_ROUND_DURATION_MS
  expectedRoundCount: number
  unassignedGrenadeCount: number
  complete: boolean
  rounds: UtilityReplayRound[]
  playerPaths: UtilityReplayPlayerPath[]
  events: UtilityReplayEvent[]
}

export interface MatchUtilityReplayStateV1 {
  version: 1
  matchId: string | null
  maps: Partial<Record<BPMapId, MapUtilityReplay>>
}

const BP_MAP_IDS = BP_MAPS.map((map) => map.id)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBPMapId(value: unknown): value is BPMapId {
  return typeof value === 'string' && BP_MAP_IDS.includes(value as BPMapId)
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : 0
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function replayTime(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= UTILITY_REPLAY_ROUND_DURATION_MS
    ? Math.round(number)
    : null
}

function radarCoordinate(value: unknown): RadarCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const x = Number(value[0])
  const y = Number(value[1])
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
}

function normalizeTrajectoryPoint(value: unknown): UtilityReplayTrajectoryPoint | null {
  if (!Array.isArray(value) || value.length < 3) return null
  const timeMs = replayTime(value[0])
  const x = Number(value[1])
  const y = Number(value[2])
  return timeMs !== null && Number.isFinite(x) && Number.isFinite(y) ? [timeMs, x, y] : null
}

function normalizeFlameFrame(value: unknown): UtilityReplayFlameFrame | null {
  if (!Array.isArray(value) || value.length < 2 || !Array.isArray(value[1])) return null
  const timeMs = replayTime(value[0])
  if (timeMs === null) return null
  const positions = value[1]
    .map(radarCoordinate)
    .filter((position): position is RadarCoordinate => position !== null)
  return [timeMs, positions]
}

function normalizeOptionalReplayTime(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  return replayTime(value)
}

function normalizeRound(value: unknown): UtilityReplayRound | null {
  if (!isRecord(value)) return null
  const roundIndex = positiveInteger(value.roundIndex)
  if (
    roundIndex === null ||
    typeof value.teamCTId !== 'string' ||
    !value.teamCTId ||
    typeof value.teamTId !== 'string' ||
    !value.teamTId ||
    value.teamCTId === value.teamTId
  ) {
    return null
  }
  return {
    roundIndex,
    teamCTId: value.teamCTId,
    teamTId: value.teamTId,
    unassignedGrenadeCount: nonNegativeInteger(value.unassignedGrenadeCount)
  }
}

function normalizePlayerPath(value: unknown): UtilityReplayPlayerPath | null {
  if (!isRecord(value)) return null
  const roundIndex = positiveInteger(value.roundIndex)
  if (
    typeof value.steamId !== 'string' ||
    !value.steamId ||
    roundIndex === null ||
    typeof value.teamId !== 'string' ||
    !value.teamId ||
    typeof value.side !== 'string' ||
    !UTILITY_REPLAY_SIDES.includes(value.side as UtilityReplaySide)
  ) {
    return null
  }
  const trajectory = Array.isArray(value.trajectory)
    ? value.trajectory
        .map(normalizeTrajectoryPoint)
        .filter((point): point is UtilityReplayTrajectoryPoint => point !== null)
        .sort((first, second) => first[0] - second[0])
    : []
  if (trajectory.length === 0) return null
  return {
    steamId: value.steamId,
    roundIndex,
    teamId: value.teamId,
    side: value.side as UtilityReplaySide,
    trajectory
  }
}

function normalizeEvent(value: unknown): UtilityReplayEvent | null {
  if (!isRecord(value)) return null
  const roundIndex = positiveInteger(value.roundIndex)
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.grenadeId !== 'string' ||
    !value.grenadeId ||
    roundIndex === null ||
    typeof value.teamId !== 'string' ||
    !value.teamId ||
    typeof value.side !== 'string' ||
    !UTILITY_REPLAY_SIDES.includes(value.side as UtilityReplaySide) ||
    typeof value.type !== 'string' ||
    !UTILITY_REPLAY_EVENT_TYPES.includes(value.type as UtilityReplayEventType)
  ) {
    return null
  }
  const trajectory = Array.isArray(value.trajectory)
    ? value.trajectory
        .map(normalizeTrajectoryPoint)
        .filter((point): point is UtilityReplayTrajectoryPoint => point !== null)
        .sort((first, second) => first[0] - second[0])
    : []
  const flameFrames = Array.isArray(value.flameFrames)
    ? value.flameFrames
        .map(normalizeFlameFrame)
        .filter((frame): frame is UtilityReplayFlameFrame => frame !== null)
        .sort((first, second) => first[0] - second[0])
    : []
  return {
    id: value.id,
    grenadeId: value.grenadeId,
    roundIndex,
    teamId: value.teamId,
    side: value.side as UtilityReplaySide,
    type: value.type as UtilityReplayEventType,
    trajectory,
    flameFrames,
    effectStartedAtMs: normalizeOptionalReplayTime(value.effectStartedAtMs),
    effectEndedAtMs: normalizeOptionalReplayTime(value.effectEndedAtMs),
    explodedAtMs: normalizeOptionalReplayTime(value.explodedAtMs),
    endedAtMs: normalizeOptionalReplayTime(value.endedAtMs)
  }
}

export function createEmptyMapUtilityReplay(mapId: BPMapId): MapUtilityReplay {
  return {
    version: 2,
    mapId,
    radarAssetPath: radarAssetPathForMap(mapId),
    durationMs: UTILITY_REPLAY_ROUND_DURATION_MS,
    expectedRoundCount: 0,
    unassignedGrenadeCount: 0,
    complete: false,
    rounds: [],
    playerPaths: [],
    events: []
  }
}

export function normalizeMapUtilityReplay(value: unknown): MapUtilityReplay | null {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2) || !isBPMapId(value.mapId)) {
    return null
  }
  const roundsSource = Array.isArray(value.rounds) ? value.rounds : []
  const roundsByIndex = new Map<number, UtilityReplayRound>()
  for (const source of roundsSource) {
    const round = normalizeRound(source)
    if (round) roundsByIndex.set(round.roundIndex, round)
  }
  const rounds = [...roundsByIndex.values()].sort(
    (first, second) => first.roundIndex - second.roundIndex
  )
  const roundIndexes = new Set(rounds.map((round) => round.roundIndex))
  const playerPaths = Array.isArray(value.playerPaths)
    ? value.playerPaths
        .map(normalizePlayerPath)
        .filter(
          (path): path is UtilityReplayPlayerPath =>
            path !== null && roundIndexes.has(path.roundIndex)
        )
        .sort(
          (first, second) =>
            first.roundIndex - second.roundIndex || first.steamId.localeCompare(second.steamId)
        )
    : []
  const events = Array.isArray(value.events)
    ? value.events
        .map(normalizeEvent)
        .filter(
          (event): event is UtilityReplayEvent =>
            event !== null && roundIndexes.has(event.roundIndex)
        )
        .sort(
          (first, second) =>
            first.roundIndex - second.roundIndex || first.id.localeCompare(second.id)
        )
    : []
  const expectedRoundCount = nonNegativeInteger(value.expectedRoundCount)
  const unassignedGrenadeCount = rounds.reduce(
    (sum, round) => sum + round.unassignedGrenadeCount,
    0
  )
  return {
    version: 2,
    mapId: value.mapId,
    radarAssetPath: radarAssetPathForMap(value.mapId),
    durationMs: UTILITY_REPLAY_ROUND_DURATION_MS,
    expectedRoundCount,
    unassignedGrenadeCount,
    complete: expectedRoundCount > 0 && rounds.length === expectedRoundCount,
    rounds,
    playerPaths,
    events
  }
}

export function finalizeMapUtilityReplay(
  value: MapUtilityReplay,
  expectedRoundCount: number
): MapUtilityReplay {
  return (
    normalizeMapUtilityReplay({
      ...value,
      expectedRoundCount
    }) ?? createEmptyMapUtilityReplay(value.mapId)
  )
}

export function createDefaultMatchUtilityReplayState(
  matchId: string | number | null = null
): MatchUtilityReplayStateV1 {
  return {
    version: 1,
    matchId: matchId === null ? null : String(matchId),
    maps: {}
  }
}

export function normalizeMatchUtilityReplayState(value: unknown): MatchUtilityReplayStateV1 {
  if (!isRecord(value) || value.version !== 1) {
    return createDefaultMatchUtilityReplayState()
  }
  const mapsSource = isRecord(value.maps) ? value.maps : {}
  const maps: Partial<Record<BPMapId, MapUtilityReplay>> = {}
  for (const mapId of BP_MAP_IDS) {
    const replay = normalizeMapUtilityReplay(mapsSource[mapId])
    if (replay?.mapId === mapId) maps[mapId] = replay
  }
  return {
    version: 1,
    matchId: typeof value.matchId === 'string' && value.matchId ? value.matchId : null,
    maps
  }
}
