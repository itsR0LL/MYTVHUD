import {
  BP_MAPS,
  BP_MATCH_TYPES,
  isBPSequenceComplete,
  normalizeBPSequence,
  type BPMapId,
  type BPMatchType,
  type BPSequenceItem,
  type BPTeam
} from './bp'
import { MATCH_MAP_STATUSES, type MatchMapStatus } from './intermission'

export const MATCH_RUNTIME_STATE_KEY = 'matchRuntimeV1'

export interface MatchMapRecord {
  name: BPMapId
  pickby: string
  decider: boolean
  ascore: number
  bscore: number
  aid: string | number
  bid: string | number
  status: MatchMapStatus
}

export interface MatchRecord {
  id: string | number
  team_a: BPTeam
  team_b: BPTeam
  type: BPMatchType
  bpSequence: BPSequenceItem[]
  maps: MatchMapRecord[]
}

export interface MatchSeriesScore {
  teamA: number
  teamB: number
}

export interface PlayerFinalStats {
  steamid: string
  teamId: string
  name: string
  kills: number
  assists: number
  deaths: number
  mvps: number
  score: number
  headshots: number
  adr: number | null
}

export interface SeriesPlayerStats extends PlayerFinalStats {
  mapsPlayed: number
}

export interface MapFinalSnapshot {
  mapId: BPMapId
  mapIndex: number
  capturedAtMs: number
  teamAScore: number
  teamBScore: number
  roundCount: number
  seriesScoreAfterMap: MatchSeriesScore
  players: PlayerFinalStats[]
}

export interface MatchRuntimeV1 {
  version: 1
  matchId: string | number | null
  currentMapId: BPMapId | ''
  lastFinishedMapId: BPMapId | ''
  handledMapEndIds: BPMapId[]
  mapSnapshots: Partial<Record<BPMapId, MapFinalSnapshot>>
  seriesEnded: boolean
  lastCompleteGSIAtMs: number | null
  revision: number
}

const BP_MAP_IDS = BP_MAPS.map((map) => map.id)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEntityId(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

function isBPMapId(value: unknown): value is BPMapId {
  return typeof value === 'string' && BP_MAP_IDS.includes(value as BPMapId)
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : 0
}

function finiteTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

export function createDefaultMatchRuntime(matchId: string | number | null = null): MatchRuntimeV1 {
  return {
    version: 1,
    matchId,
    currentMapId: '',
    lastFinishedMapId: '',
    handledMapEndIds: [],
    mapSnapshots: {},
    seriesEnded: false,
    lastCompleteGSIAtMs: null,
    revision: 0
  }
}

export function seriesWinLimit(type: BPMatchType): number {
  if (type === 'BO1') return 1
  if (type === 'BO3') return 2
  return 3
}

export function createMatchMapsFromBP(
  sequence: readonly BPSequenceItem[],
  type: BPMatchType,
  teamAId: string | number,
  teamBId: string | number
): MatchMapRecord[] {
  if (!isBPSequenceComplete(sequence, type)) {
    throw new Error('BP 内容不完整或动作顺序与当前赛制不一致')
  }
  return sequence
    .filter((item) => item.action === 'pick' || item.action === 'decider')
    .map((item) => ({
      name: item.map,
      pickby: item.action === 'pick' ? String(item.actor === 'team_a' ? teamAId : teamBId) : '',
      decider: item.action === 'decider',
      ascore: 0,
      bscore: 0,
      aid: teamAId,
      bid: teamBId,
      status: 'pending'
    }))
}

export function calculateMatchSeriesScore(
  maps: readonly MatchMapRecord[],
  type: BPMatchType
): MatchSeriesScore {
  const maximum = seriesWinLimit(type)
  let teamA = 0
  let teamB = 0
  for (const map of maps) {
    if (map.status !== 'finished' || map.ascore === map.bscore) continue
    if (map.ascore > map.bscore) teamA = Math.min(maximum, teamA + 1)
    if (map.bscore > map.ascore) teamB = Math.min(maximum, teamB + 1)
  }
  return { teamA, teamB }
}

export function calculateSnapshotSeriesScore(
  maps: readonly MatchMapRecord[],
  mapSnapshots: Partial<Record<BPMapId, MapFinalSnapshot>>,
  type: BPMatchType
): MatchSeriesScore {
  const maximum = seriesWinLimit(type)
  let teamA = 0
  let teamB = 0
  for (const map of maps) {
    const snapshot = mapSnapshots[map.name]
    if (
      map.status !== 'finished' ||
      !snapshot ||
      snapshot.mapId !== map.name ||
      snapshot.teamAScore === snapshot.teamBScore
    ) {
      continue
    }
    if (snapshot.teamAScore > snapshot.teamBScore) teamA = Math.min(maximum, teamA + 1)
    if (snapshot.teamBScore > snapshot.teamAScore) teamB = Math.min(maximum, teamB + 1)
  }
  return { teamA, teamB }
}

export function aggregateSeriesPlayerStats(
  maps: readonly MatchMapRecord[],
  mapSnapshots: Partial<Record<BPMapId, MapFinalSnapshot>>
): SeriesPlayerStats[] {
  const totals = new Map<string, SeriesPlayerStats>()
  for (const map of maps) {
    if (map.status !== 'finished') continue
    const snapshot = mapSnapshots[map.name]
    if (!snapshot || snapshot.mapId !== map.name) continue
    for (const player of snapshot.players) {
      const current = totals.get(player.steamid)
      if (current) {
        current.kills += player.kills
        current.assists += player.assists
        current.deaths += player.deaths
        current.mvps += player.mvps
        current.score += player.score
        current.headshots += player.headshots
        current.mapsPlayed += 1
        continue
      }
      totals.set(player.steamid, {
        ...player,
        adr: null,
        mapsPlayed: 1
      })
    }
  }
  return [...totals.values()]
}

export function snapshotSeriesHasEnded(
  maps: readonly MatchMapRecord[],
  mapSnapshots: Partial<Record<BPMapId, MapFinalSnapshot>>,
  type: BPMatchType
): boolean {
  const score = calculateSnapshotSeriesScore(maps, mapSnapshots, type)
  const maximum = seriesWinLimit(type)
  return score.teamA >= maximum || score.teamB >= maximum
}

export function matchSeriesHasEnded(maps: readonly MatchMapRecord[], type: BPMatchType): boolean {
  const score = calculateMatchSeriesScore(maps, type)
  const maximum = seriesWinLimit(type)
  return score.teamA >= maximum || score.teamB >= maximum
}

export function calculateNextMapId(
  maps: readonly MatchMapRecord[],
  type: BPMatchType,
  finishedMapId: BPMapId
): BPMapId | '' {
  if (matchSeriesHasEnded(maps, type)) return ''
  const finishedIndex = maps.findIndex((map) => map.name === finishedMapId)
  if (finishedIndex < 0) return ''
  return maps.slice(finishedIndex + 1).find((map) => map.status === 'pending')?.name ?? ''
}

export function calculateNextMapIdFromSnapshots(
  maps: readonly MatchMapRecord[],
  mapSnapshots: Partial<Record<BPMapId, MapFinalSnapshot>>,
  type: BPMatchType,
  finishedMapId: BPMapId
): BPMapId | '' {
  if (snapshotSeriesHasEnded(maps, mapSnapshots, type)) return ''
  const finishedIndex = maps.findIndex((map) => map.name === finishedMapId)
  if (finishedIndex < 0) return ''
  for (const map of maps.slice(finishedIndex + 1)) {
    if (map.status === 'pending') return map.name
    if (map.status !== 'finished' || !mapSnapshots[map.name]) return ''
  }
  return ''
}

function normalizePlayerFinalStats(value: unknown): PlayerFinalStats | null {
  if (!isRecord(value) || typeof value.steamid !== 'string' || !value.steamid.trim()) return null
  if (typeof value.teamId !== 'string' || !value.teamId) return null
  if (typeof value.name !== 'string') return null
  const adr = Number(value.adr)
  return {
    steamid: value.steamid.trim(),
    teamId: value.teamId,
    name: value.name,
    kills: nonNegativeInteger(value.kills),
    assists: nonNegativeInteger(value.assists),
    deaths: nonNegativeInteger(value.deaths),
    mvps: nonNegativeInteger(value.mvps),
    score: nonNegativeInteger(value.score),
    headshots: nonNegativeInteger(value.headshots),
    adr: Number.isFinite(adr) && adr >= 0 ? adr : null
  }
}

export function normalizeMapFinalSnapshot(value: unknown): MapFinalSnapshot | null {
  if (!isRecord(value) || !isBPMapId(value.mapId)) return null
  const mapIndex = Number(value.mapIndex)
  const capturedAtMs = finiteTimestamp(value.capturedAtMs)
  const teamAScore = Number(value.teamAScore)
  const teamBScore = Number(value.teamBScore)
  const roundCount = Number(value.roundCount)
  if (
    !Number.isInteger(mapIndex) ||
    mapIndex < 0 ||
    capturedAtMs === null ||
    !Number.isInteger(teamAScore) ||
    teamAScore < 0 ||
    !Number.isInteger(teamBScore) ||
    teamBScore < 0 ||
    teamAScore === teamBScore ||
    !Number.isInteger(roundCount) ||
    roundCount !== teamAScore + teamBScore
  ) {
    return null
  }
  const players = Array.isArray(value.players)
    ? value.players
        .map(normalizePlayerFinalStats)
        .filter((player): player is PlayerFinalStats => player !== null)
    : []
  const seriesScore = isRecord(value.seriesScoreAfterMap) ? value.seriesScoreAfterMap : {}
  return {
    mapId: value.mapId,
    mapIndex,
    capturedAtMs,
    teamAScore,
    teamBScore,
    roundCount,
    seriesScoreAfterMap: {
      teamA: nonNegativeInteger(seriesScore.teamA),
      teamB: nonNegativeInteger(seriesScore.teamB)
    },
    players
  }
}

export function normalizeMatchRuntime(value: unknown): MatchRuntimeV1 {
  if (!isRecord(value) || value.version !== 1) return createDefaultMatchRuntime()
  const matchId = isEntityId(value.matchId) ? value.matchId : null
  const handledMapEndIds = Array.isArray(value.handledMapEndIds)
    ? [...new Set(value.handledMapEndIds.filter(isBPMapId))]
    : []
  const snapshotsSource = isRecord(value.mapSnapshots) ? value.mapSnapshots : {}
  const mapSnapshots: Partial<Record<BPMapId, MapFinalSnapshot>> = {}
  for (const mapId of BP_MAP_IDS) {
    const snapshot = normalizeMapFinalSnapshot(snapshotsSource[mapId])
    if (snapshot && snapshot.mapId === mapId) mapSnapshots[mapId] = snapshot
  }
  return {
    version: 1,
    matchId,
    currentMapId: isBPMapId(value.currentMapId) ? value.currentMapId : '',
    lastFinishedMapId: isBPMapId(value.lastFinishedMapId) ? value.lastFinishedMapId : '',
    handledMapEndIds,
    mapSnapshots,
    seriesEnded: value.seriesEnded === true,
    lastCompleteGSIAtMs: finiteTimestamp(value.lastCompleteGSIAtMs),
    revision: nonNegativeInteger(value.revision)
  }
}

export function normalizeMatchMapRecord(value: unknown): MatchMapRecord | null {
  if (!isRecord(value) || !isBPMapId(value.name)) return null
  if (!isEntityId(value.aid) || !isEntityId(value.bid)) return null
  if (typeof value.pickby !== 'string' || typeof value.decider !== 'boolean') return null
  if (
    typeof value.status !== 'string' ||
    !MATCH_MAP_STATUSES.includes(value.status as MatchMapStatus)
  ) {
    return null
  }
  return {
    name: value.name,
    pickby: value.pickby,
    decider: value.decider,
    ascore: nonNegativeInteger(value.ascore),
    bscore: nonNegativeInteger(value.bscore),
    aid: value.aid,
    bid: value.bid,
    status: value.status as MatchMapStatus
  }
}

function normalizeMatchTeam(value: unknown): BPTeam | null {
  if (!isRecord(value) || !isEntityId(value.id)) return null
  if (typeof value.name !== 'string' || typeof value.name_ingame !== 'string') return null
  return {
    id: value.id,
    name: value.name,
    name_ingame: value.name_ingame,
    ...(typeof value.avatar === 'string' && value.avatar ? { avatar: value.avatar } : {})
  }
}

export function normalizeMatchRecord(value: unknown): MatchRecord | null {
  if (!isRecord(value) || !isEntityId(value.id) || !isBPMatchType(value.type)) return null
  const teamA = normalizeMatchTeam(value.team_a)
  const teamB = normalizeMatchTeam(value.team_b)
  if (!teamA || !teamB || !Array.isArray(value.maps)) return null
  const maps = value.maps
    .map(normalizeMatchMapRecord)
    .filter((map): map is MatchMapRecord => map !== null)
  if (maps.length !== value.maps.length) return null
  return {
    id: value.id,
    team_a: teamA,
    team_b: teamB,
    type: value.type,
    bpSequence: normalizeBPSequence(value.bpSequence),
    maps
  }
}

export function isBPMatchType(value: unknown): value is BPMatchType {
  return typeof value === 'string' && BP_MATCH_TYPES.includes(value as BPMatchType)
}
