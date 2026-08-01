import { BP_MAPS, BP_MATCH_TYPES, type BPMapId, type BPMatchType, type BPTeam } from './bp'
import {
  normalizeMapFinalSnapshot,
  normalizeMatchRecord,
  type MapFinalSnapshot,
  type MatchRecord,
  type MatchSeriesScore
} from './match-session'
export const BROADCAST_RUNTIME_STATE_KEY = 'broadcastRuntimeV1'
export const BROADCAST_FLOW_TEMPLATES_KEY = 'broadcastFlowTemplatesV1'
export const BROADCAST_MIN_TOTAL_DURATION_MS = 1000
export const BROADCAST_MAX_TOTAL_DURATION_MS = (99 * 60 + 59) * 1000
export const MAP_BREAK_DURATION_PRESETS_MS = [
  5 * 60 * 1000,
  10 * 60 * 1000,
  15 * 60 * 1000,
  20 * 60 * 1000
] as const

export const BROADCAST_PROGRAM_TYPES = ['map_break', 'series_end', 'standby'] as const
export const BROADCAST_PLAYBACK_STATUSES = [
  'idle',
  'ready',
  'playing',
  'paused',
  'finished'
] as const
export const BROADCAST_CONTENT_TYPES = [
  'map_report',
  'page_transition',
  'map_utility_replay',
  'series_progress',
  'next_map',
  'intermission_notice',
  'series_result',
  'series_map_history',
  'series_player_stats',
  'next_match',
  'standby'
] as const

export type BroadcastProgramType = (typeof BROADCAST_PROGRAM_TYPES)[number]
export type BroadcastPlaybackStatus = (typeof BROADCAST_PLAYBACK_STATUSES)[number]
export type BroadcastContentType = (typeof BROADCAST_CONTENT_TYPES)[number]
export type BroadcastComponentVisibility = Record<
  'teamScore' | 'mapSeries' | 'timerNotice' | 'eventLogo',
  boolean
>

export interface BroadcastNextMatch {
  matchId: string | number
  type: BPMatchType
  team_a: BPTeam
  team_b: BPTeam
  bpReady: boolean
}

export interface BroadcastScoreOverride {
  enabled: boolean
  teamA: number
  teamB: number
}

export interface BroadcastDataSnapshot {
  match: MatchRecord
  seriesScore: MatchSeriesScore
  scoreOverride: BroadcastScoreOverride
  lastFinishedMapId: BPMapId | ''
  nextMapId: BPMapId | ''
  seriesEnded: boolean
  mapSnapshots: Partial<Record<BPMapId, MapFinalSnapshot>>
  nextMatch: BroadcastNextMatch | null
}

export interface BroadcastExecutionSegment {
  id: string
  contentType: BroadcastContentType
  startOffsetMs: number
  endOffsetMs: number
  durationMs: number
  components: BroadcastComponentVisibility
}

export interface BroadcastProgram {
  id: string
  type: BroadcastProgramType
  createdAtMs: number
  sourceMatchId: string | number
  sourceMapId: BPMapId | ''
  snapshot: BroadcastDataSnapshot
  issues: string[]
  segments: BroadcastExecutionSegment[]
}

export interface BroadcastRuntimeV1 {
  version: 1
  visible: boolean
  playbackStatus: BroadcastPlaybackStatus
  preparedProgram: BroadcastProgram | null
  onAirProgram: BroadcastProgram | null
  activeSegmentIndex: number
  totalDurationMs: number
  startedAtMs: number | null
  deadlineAtMs: number | null
  pausedRemainingMs: number | null
  playRevision: number
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

export function normalizeBroadcastDefaultTotalDurationMs(value: unknown): number {
  const durationMs = nonNegativeInteger(value)
  if (durationMs === 0) return 0
  return durationMs >= BROADCAST_MIN_TOTAL_DURATION_MS &&
    durationMs <= BROADCAST_MAX_TOTAL_DURATION_MS
    ? durationMs
    : 0
}

export function createDefaultBroadcastComponentVisibility(): BroadcastComponentVisibility {
  return {
    teamScore: true,
    mapSeries: true,
    timerNotice: true,
    eventLogo: true
  }
}

function normalizeComponentVisibility(value: unknown): BroadcastComponentVisibility {
  const fallback = createDefaultBroadcastComponentVisibility()
  if (!isRecord(value)) return fallback
  return {
    teamScore: value.teamScore !== false,
    mapSeries: value.mapSeries !== false,
    timerNotice: value.timerNotice !== false,
    eventLogo: value.eventLogo !== false
  }
}

function finiteTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null
}

function normalizeTeam(value: unknown): BPTeam | null {
  if (!isRecord(value) || !isEntityId(value.id)) return null
  if (typeof value.name !== 'string' || typeof value.name_ingame !== 'string') return null
  return {
    id: value.id,
    name: value.name,
    name_ingame: value.name_ingame,
    ...(typeof value.avatar === 'string' && value.avatar ? { avatar: value.avatar } : {})
  }
}

function normalizeNextMatch(value: unknown): BroadcastNextMatch | null {
  if (!isRecord(value) || !isEntityId(value.matchId)) return null
  if (typeof value.type !== 'string' || !BP_MATCH_TYPES.includes(value.type as BPMatchType)) {
    return null
  }
  const teamA = normalizeTeam(value.team_a)
  const teamB = normalizeTeam(value.team_b)
  if (!teamA || !teamB) return null
  return {
    matchId: value.matchId,
    type: value.type as BPMatchType,
    team_a: teamA,
    team_b: teamB,
    bpReady: value.bpReady === true
  }
}

function normalizeSeriesScore(value: unknown): MatchSeriesScore {
  const source = isRecord(value) ? value : {}
  return {
    teamA: nonNegativeInteger(source.teamA),
    teamB: nonNegativeInteger(source.teamB)
  }
}

export function normalizeBroadcastScoreOverride(
  value: unknown,
  type: BPMatchType
): BroadcastScoreOverride {
  const source = isRecord(value) ? value : {}
  const maximum = type === 'BO1' ? 1 : type === 'BO3' ? 2 : 3
  return {
    enabled: source.enabled === true,
    teamA: Math.min(maximum, nonNegativeInteger(source.teamA)),
    teamB: Math.min(maximum, nonNegativeInteger(source.teamB))
  }
}

function normalizeBroadcastSnapshot(value: unknown): BroadcastDataSnapshot | null {
  if (!isRecord(value)) return null
  const match = normalizeMatchRecord(value.match)
  if (!match) return null
  const snapshotSource = isRecord(value.mapSnapshots) ? value.mapSnapshots : {}
  const mapSnapshots: Partial<Record<BPMapId, MapFinalSnapshot>> = {}
  for (const mapId of BP_MAP_IDS) {
    const snapshot = normalizeMapFinalSnapshot(snapshotSource[mapId])
    if (snapshot && snapshot.mapId === mapId) mapSnapshots[mapId] = snapshot
  }
  return {
    match,
    seriesScore: normalizeSeriesScore(value.seriesScore),
    scoreOverride: normalizeBroadcastScoreOverride(value.scoreOverride, match.type),
    lastFinishedMapId: isBPMapId(value.lastFinishedMapId) ? value.lastFinishedMapId : '',
    nextMapId: isBPMapId(value.nextMapId) ? value.nextMapId : '',
    seriesEnded: value.seriesEnded === true,
    mapSnapshots,
    nextMatch: normalizeNextMatch(value.nextMatch)
  }
}

function normalizeExecutionSegment(value: unknown): BroadcastExecutionSegment | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  if (
    typeof value.contentType !== 'string' ||
    !BROADCAST_CONTENT_TYPES.includes(value.contentType as BroadcastContentType)
  ) {
    return null
  }
  const startOffsetMs = nonNegativeInteger(value.startOffsetMs)
  const durationMs = nonNegativeInteger(value.durationMs)
  const endOffsetMs = nonNegativeInteger(value.endOffsetMs)
  if (endOffsetMs !== startOffsetMs + durationMs) return null
  return {
    id: value.id,
    contentType: value.contentType as BroadcastContentType,
    startOffsetMs,
    endOffsetMs,
    durationMs,
    components: normalizeComponentVisibility(value.components)
  }
}

export function normalizeBroadcastProgram(value: unknown): BroadcastProgram | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  if (
    typeof value.type !== 'string' ||
    !BROADCAST_PROGRAM_TYPES.includes(value.type as BroadcastProgramType)
  ) {
    return null
  }
  if (!isEntityId(value.sourceMatchId)) return null
  if (value.sourceMapId !== '' && !isBPMapId(value.sourceMapId)) return null
  const createdAtMs = finiteTimestamp(value.createdAtMs)
  if (createdAtMs === null) return null
  const snapshot = normalizeBroadcastSnapshot(value.snapshot)
  if (!snapshot || !Array.isArray(value.segments)) return null
  if (String(snapshot.match.id) !== String(value.sourceMatchId)) return null
  const segments = value.segments
    .map(normalizeExecutionSegment)
    .filter((segment): segment is BroadcastExecutionSegment => segment !== null)
  if (segments.length !== value.segments.length) return null
  if (
    segments.some(
      (segment, index) =>
        segment.startOffsetMs !== (index === 0 ? 0 : segments[index - 1].endOffsetMs)
    )
  ) {
    return null
  }
  return {
    id: value.id,
    type: value.type as BroadcastProgramType,
    createdAtMs,
    sourceMatchId: value.sourceMatchId,
    sourceMapId: value.sourceMapId as BPMapId | '',
    snapshot,
    issues: Array.isArray(value.issues)
      ? value.issues.filter((issue): issue is string => typeof issue === 'string' && Boolean(issue))
      : [],
    segments
  }
}

export function createDefaultBroadcastRuntime(): BroadcastRuntimeV1 {
  return {
    version: 1,
    visible: false,
    playbackStatus: 'idle',
    preparedProgram: null,
    onAirProgram: null,
    activeSegmentIndex: 0,
    totalDurationMs: 0,
    startedAtMs: null,
    deadlineAtMs: null,
    pausedRemainingMs: null,
    playRevision: 0,
    revision: 0
  }
}

export function normalizeBroadcastRuntime(value: unknown): BroadcastRuntimeV1 {
  if (!isRecord(value) || value.version !== 1) return createDefaultBroadcastRuntime()
  let playbackStatus: BroadcastPlaybackStatus =
    typeof value.playbackStatus === 'string' &&
    BROADCAST_PLAYBACK_STATUSES.includes(value.playbackStatus as BroadcastPlaybackStatus)
      ? (value.playbackStatus as BroadcastPlaybackStatus)
      : 'idle'
  const preparedProgram = normalizeBroadcastProgram(value.preparedProgram)
  const onAirProgram = normalizeBroadcastProgram(value.onAirProgram)
  const totalDurationMs = nonNegativeInteger(value.totalDurationMs)
  const startedAtMs = finiteTimestamp(value.startedAtMs)
  let deadlineAtMs = finiteTimestamp(value.deadlineAtMs)
  let pausedRemainingMs = finiteTimestamp(value.pausedRemainingMs)
  const invalidPlaying =
    playbackStatus === 'playing' &&
    (!onAirProgram || totalDurationMs <= 0 || startedAtMs === null || deadlineAtMs === null)
  const invalidPaused =
    playbackStatus === 'paused' &&
    (!onAirProgram || totalDurationMs <= 0 || startedAtMs === null || pausedRemainingMs === null)
  if (invalidPlaying || invalidPaused) {
    playbackStatus = onAirProgram ? 'finished' : preparedProgram ? 'ready' : 'idle'
    deadlineAtMs = null
    pausedRemainingMs = null
  }
  if (playbackStatus === 'finished' && !onAirProgram) {
    playbackStatus = preparedProgram ? 'ready' : 'idle'
  }
  if (playbackStatus === 'ready' && !preparedProgram) {
    playbackStatus = onAirProgram ? 'finished' : 'idle'
  }
  const maximumActiveIndex = Math.max(0, (onAirProgram?.segments.length ?? 1) - 1)
  return {
    version: 1,
    visible: value.visible === true && onAirProgram !== null,
    playbackStatus,
    preparedProgram,
    onAirProgram,
    activeSegmentIndex: Math.min(maximumActiveIndex, nonNegativeInteger(value.activeSegmentIndex)),
    totalDurationMs,
    startedAtMs,
    deadlineAtMs,
    pausedRemainingMs,
    playRevision: nonNegativeInteger(value.playRevision),
    revision: nonNegativeInteger(value.revision)
  }
}

export function programContentTypes(
  type: BroadcastProgramType,
  hasNextMatch: boolean
): BroadcastContentType[] {
  if (type === 'map_break') {
    return [
      'map_report',
      'map_utility_replay',
      'series_progress',
      'next_map',
      'intermission_notice'
    ]
  }
  if (type === 'series_end') {
    return [
      'series_result',
      'series_map_history',
      'series_player_stats',
      'map_utility_replay',
      'standby'
    ]
  }
  return [hasNextMatch ? 'next_match' : 'standby']
}

export function createUnscheduledSegments(
  type: BroadcastProgramType,
  hasNextMatch: boolean
): BroadcastExecutionSegment[] {
  return programContentTypes(type, hasNextMatch).map((contentType, index) => ({
    id: `${type}-${index + 1}-${contentType}`,
    contentType,
    startOffsetMs: 0,
    endOffsetMs: 0,
    durationMs: 0,
    components:
      contentType === 'map_utility_replay'
        ? {
            teamScore: false,
            mapSeries: false,
            timerNotice: false,
            eventLogo: false
          }
        : createDefaultBroadcastComponentVisibility()
  }))
}
