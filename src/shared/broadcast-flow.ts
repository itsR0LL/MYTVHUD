import { BP_MAPS, BP_MATCH_TYPES, type BPMapId, type BPMatchType, type BPTeam } from './bp'
import {
  normalizeMapFinalSnapshot,
  normalizeMatchRecord,
  type MapFinalSnapshot,
  type MatchRecord,
  type MatchSeriesScore
} from './match-session'
import { UTILITY_REPLAY_TOTAL_DURATION_MS } from './utility-replay'

export const BROADCAST_RUNTIME_STATE_KEY = 'broadcastRuntimeV1'
export const BROADCAST_FLOW_TEMPLATES_KEY = 'broadcastFlowTemplatesV1'
export const INTERMISSION_LAYOUT_SETTINGS_KEY = 'intermissionLayoutV1'
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

export interface BroadcastFlowTemplateSegment {
  id: string
  contentType: BroadcastContentType
  enabled: boolean
  minimumDurationMs: number
  preferredDurationMs: number
  maximumDurationMs: number
  weight: number
  skippable: boolean
  components: BroadcastComponentVisibility
}

export interface BroadcastFlowTemplate {
  type: BroadcastProgramType
  defaultTotalDurationMs: number
  segments: BroadcastFlowTemplateSegment[]
}

export type BroadcastFlowTemplatesV1 = Record<BroadcastProgramType, BroadcastFlowTemplate>

export class BroadcastInsufficientDurationError extends Error {
  readonly minimumDurationMs: number

  constructor(minimumDurationMs: number) {
    super(`当前流程至少需要 ${minimumDurationMs} 毫秒`)
    this.name = 'BroadcastInsufficientDurationError'
    this.minimumDurationMs = minimumDurationMs
  }
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

function createUnconfiguredTemplateSegment(
  type: BroadcastProgramType,
  contentType: BroadcastContentType,
  index: number
): BroadcastFlowTemplateSegment {
  if (contentType === 'map_utility_replay') {
    return {
      id: `${type}-${index + 1}-${contentType}`,
      contentType,
      enabled: false,
      minimumDurationMs: UTILITY_REPLAY_TOTAL_DURATION_MS,
      preferredDurationMs: UTILITY_REPLAY_TOTAL_DURATION_MS,
      maximumDurationMs: UTILITY_REPLAY_TOTAL_DURATION_MS,
      weight: 1,
      skippable: true,
      components: {
        teamScore: false,
        mapSeries: false,
        timerNotice: false,
        eventLogo: false
      }
    }
  }
  return {
    id: `${type}-${index + 1}-${contentType}`,
    contentType,
    enabled: true,
    minimumDurationMs: 0,
    preferredDurationMs: 0,
    maximumDurationMs: 0,
    weight: 1,
    skippable: contentType !== 'map_report' && contentType !== 'series_result',
    components: createDefaultBroadcastComponentVisibility()
  }
}

function createUnconfiguredTemplate(type: BroadcastProgramType): BroadcastFlowTemplate {
  const contentTypes =
    type === 'map_break'
      ? programContentTypes(type, false)
      : [...new Set([...programContentTypes(type, false), ...programContentTypes(type, true)])]
  return {
    type,
    defaultTotalDurationMs: 0,
    segments: contentTypes.map((contentType, index) =>
      createUnconfiguredTemplateSegment(type, contentType, index)
    )
  }
}

export function createUnconfiguredBroadcastFlowTemplates(): BroadcastFlowTemplatesV1 {
  return {
    map_break: createUnconfiguredTemplate('map_break'),
    series_end: createUnconfiguredTemplate('series_end'),
    standby: createUnconfiguredTemplate('standby')
  }
}

function normalizeTemplateSegment(
  value: unknown,
  type: BroadcastProgramType,
  index: number
): BroadcastFlowTemplateSegment | null {
  if (!isRecord(value)) return null
  if (
    typeof value.contentType !== 'string' ||
    !BROADCAST_CONTENT_TYPES.includes(value.contentType as BroadcastContentType)
  ) {
    return null
  }
  const contentType = value.contentType as BroadcastContentType
  const minimumDurationMs = nonNegativeInteger(value.minimumDurationMs)
  const preferredDurationMs = nonNegativeInteger(value.preferredDurationMs)
  const maximumDurationMs = nonNegativeInteger(value.maximumDurationMs)
  const weight = Number(value.weight)
  if (
    minimumDurationMs > preferredDurationMs ||
    preferredDurationMs > maximumDurationMs ||
    !Number.isFinite(weight) ||
    weight <= 0
  ) {
    return null
  }
  return {
    id: typeof value.id === 'string' && value.id ? value.id : `${type}-${index + 1}-${contentType}`,
    contentType,
    enabled: value.enabled !== false,
    minimumDurationMs,
    preferredDurationMs,
    maximumDurationMs,
    weight,
    skippable: value.skippable === true,
    components: normalizeComponentVisibility(value.components)
  }
}

export function normalizeBroadcastFlowTemplates(value: unknown): BroadcastFlowTemplatesV1 {
  const fallback = createUnconfiguredBroadcastFlowTemplates()
  if (!isRecord(value)) return fallback
  const result = { ...fallback }
  for (const type of BROADCAST_PROGRAM_TYPES) {
    const rawTemplate = value[type]
    if (!isRecord(rawTemplate) || !Array.isArray(rawTemplate.segments)) continue
    const segments = rawTemplate.segments
      .map((segment, index) => normalizeTemplateSegment(segment, type, index))
      .filter((segment): segment is BroadcastFlowTemplateSegment => segment !== null)
    if (segments.length !== rawTemplate.segments.length || segments.length === 0) continue
    const contentTypes = new Set<BroadcastContentType>()
    let hasDuplicate = false
    for (const segment of segments) {
      if (contentTypes.has(segment.contentType)) {
        hasDuplicate = true
        break
      }
      contentTypes.add(segment.contentType)
    }
    if (hasDuplicate) continue
    const storedByContentType = new Map(
      segments.map((segment) => [segment.contentType, segment] as const)
    )
    result[type] = {
      type,
      defaultTotalDurationMs: normalizeBroadcastDefaultTotalDurationMs(
        rawTemplate.defaultTotalDurationMs
      ),
      segments: fallback[type].segments.map(
        (fallbackSegment) => storedByContentType.get(fallbackSegment.contentType) ?? fallbackSegment
      )
    }
  }
  return result
}

export function validateBroadcastFlowTemplates(value: unknown): BroadcastFlowTemplatesV1 {
  if (!isRecord(value)) throw new Error('播出流程模板格式无效')
  const result = {} as BroadcastFlowTemplatesV1
  for (const type of BROADCAST_PROGRAM_TYPES) {
    const rawTemplate = value[type]
    if (
      !isRecord(rawTemplate) ||
      rawTemplate.type !== type ||
      !Array.isArray(rawTemplate.segments)
    ) {
      throw new Error(`${type} 流程模板格式无效`)
    }
    if (
      !Number.isInteger(rawTemplate.defaultTotalDurationMs) ||
      (rawTemplate.defaultTotalDurationMs !== 0 &&
        (Number(rawTemplate.defaultTotalDurationMs) < BROADCAST_MIN_TOTAL_DURATION_MS ||
          Number(rawTemplate.defaultTotalDurationMs) > BROADCAST_MAX_TOTAL_DURATION_MS))
    ) {
      throw new Error(`${type} 默认总时长必须为未设置或 1 秒至 99 分 59 秒`)
    }
    const defaultTotalDurationMs = Number(rawTemplate.defaultTotalDurationMs)
    const segments = rawTemplate.segments.map((segment, index) => {
      const normalized = normalizeTemplateSegment(segment, type, index)
      if (!normalized) throw new Error(`${type} 的第 ${index + 1} 个内容段配置无效`)
      return normalized
    })
    const allowedContentTypes = new Set(
      type === 'map_break'
        ? programContentTypes(type, false)
        : [...programContentTypes(type, false), ...programContentTypes(type, true)]
    )
    const seenIds = new Set<string>()
    const seenContentTypes = new Set<BroadcastContentType>()
    for (const segment of segments) {
      if (!allowedContentTypes.has(segment.contentType)) {
        throw new Error(`${type} 不支持 ${segment.contentType} 内容段`)
      }
      if (seenIds.has(segment.id)) throw new Error(`${type} 存在重复的内容段 ID：${segment.id}`)
      if (seenContentTypes.has(segment.contentType)) {
        throw new Error(`${type} 存在重复的内容类型：${segment.contentType}`)
      }
      if (
        (segment.contentType === 'map_report' || segment.contentType === 'series_result') &&
        (!segment.enabled || segment.skippable)
      ) {
        throw new Error(`${segment.contentType} 必须启用且不能在时间不足时跳过`)
      }
      if (
        segment.contentType === 'map_utility_replay' &&
        (segment.minimumDurationMs !== UTILITY_REPLAY_TOTAL_DURATION_MS ||
          segment.preferredDurationMs !== UTILITY_REPLAY_TOTAL_DURATION_MS ||
          segment.maximumDurationMs !== UTILITY_REPLAY_TOTAL_DURATION_MS ||
          segment.weight !== 1 ||
          !segment.skippable ||
          Object.values(segment.components).some(Boolean))
      ) {
        throw new Error('本图前 30 秒道具回放必须保持四页各 30 秒且隐藏固定组件')
      }
      seenIds.add(segment.id)
      seenContentTypes.add(segment.contentType)
    }
    if (segments.length !== allowedContentTypes.size) {
      throw new Error(`${type} 流程模板缺少正式内容段`)
    }
    result[type] = { type, defaultTotalDurationMs, segments }
  }
  return result
}

function distributeDuration(
  durations: number[],
  targets: number[],
  weights: number[],
  remainingInput: number
): number {
  let remaining = remainingInput
  while (remaining > 0) {
    const eligible = durations
      .map((duration, index) => ({ index, capacity: targets[index] - duration }))
      .filter((item) => item.capacity > 0)
    if (eligible.length === 0) break
    const totalWeight = eligible.reduce((sum, item) => sum + weights[item.index], 0)
    let distributed = 0
    for (const item of eligible) {
      const proportional = Math.max(1, Math.floor((remaining * weights[item.index]) / totalWeight))
      const amount = Math.min(item.capacity, proportional, remaining - distributed)
      if (amount <= 0) continue
      durations[item.index] += amount
      distributed += amount
      if (distributed >= remaining) break
    }
    if (distributed <= 0) break
    remaining -= distributed
  }
  return remaining
}

export function allocateBroadcastSegments(
  programType: BroadcastProgramType,
  template: BroadcastFlowTemplate,
  totalDurationMs: number,
  availableContentTypes: readonly BroadcastContentType[]
): BroadcastExecutionSegment[] {
  if (!Number.isInteger(totalDurationMs) || totalDurationMs <= 0) {
    throw new Error('播出总时长必须是正整数毫秒')
  }
  const available = new Set(availableContentTypes)
  const enabled = template.segments.filter(
    (segment) => segment.enabled && available.has(segment.contentType)
  )
  if (enabled.length === 0) throw new Error('当前节目没有已启用的内容段')
  if (enabled.every((segment) => segment.maximumDurationMs === 0)) {
    throw new Error('播出流程模板尚未配置展示时间')
  }

  const selected = [...enabled]
  let minimumTotal = selected.reduce((sum, segment) => sum + segment.minimumDurationMs, 0)
  for (let index = selected.length - 1; minimumTotal > totalDurationMs && index >= 0; index -= 1) {
    const segment = selected[index]
    if (!segment.skippable) continue
    minimumTotal -= segment.minimumDurationMs
    selected.splice(index, 1)
  }
  if (selected.length === 0 || minimumTotal > totalDurationMs) {
    throw new BroadcastInsufficientDurationError(minimumTotal)
  }

  const durations = selected.map((segment) => segment.minimumDurationMs)
  const weights = selected.map((segment) => segment.weight)
  let remaining = totalDurationMs - minimumTotal
  remaining = distributeDuration(
    durations,
    selected.map((segment) => segment.preferredDurationMs),
    weights,
    remaining
  )
  remaining = distributeDuration(
    durations,
    selected.map((segment) => segment.maximumDurationMs),
    weights,
    remaining
  )

  if (remaining > 0) {
    const fillerIndex = selected.findIndex(
      (segment) =>
        segment.contentType === 'intermission_notice' || segment.contentType === 'standby'
    )
    durations[fillerIndex >= 0 ? fillerIndex : durations.length - 1] += remaining
  }

  let offset = 0
  return selected.map((segment, index) => {
    const durationMs = durations[index]
    const execution: BroadcastExecutionSegment = {
      id: segment.id || `${programType}-${index + 1}-${segment.contentType}`,
      contentType: segment.contentType,
      startOffsetMs: offset,
      endOffsetMs: offset + durationMs,
      durationMs,
      components: segment.components
    }
    offset = execution.endOffsetMs
    return execution
  })
}
