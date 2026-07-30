import { BP_MAPS, BP_MATCH_TYPES, type BPMapId, type BPMatchType, type BPTeam } from './bp'

export const MATCH_MAP_STATUSES = ['pending', 'live', 'finished'] as const
export const INTERMISSION_TIMER_STATUSES = ['idle', 'running', 'paused', 'finished'] as const

export const INTERMISSION_CANVAS_WIDTH = 1920
export const INTERMISSION_CANVAS_HEIGHT = 1080
export const INTERMISSION_MIN_SCALE = 0.5
export const INTERMISSION_MAX_SCALE = 1.25
export const INTERMISSION_DEFAULT_DURATION_MS = 8 * 60 * 1000
export const INTERMISSION_MIN_DURATION_MS = 1000
export const INTERMISSION_MAX_DURATION_MS = (99 * 60 + 59) * 1000
export const INTERMISSION_COMPONENT_IDS = [
  'teamScore',
  'mapSeries',
  'timerNotice',
  'eventLogo'
] as const

export const INTERMISSION_COMPONENT_SIZES = {
  teamScore: { width: 480, height: 120 },
  mapSeries: { width: 760, height: 120 },
  timerNotice: { width: 360, height: 120 },
  eventLogo: { width: 420, height: 96 }
} as const

export type MatchMapStatus = (typeof MATCH_MAP_STATUSES)[number]
export type IntermissionTimerStatus = (typeof INTERMISSION_TIMER_STATUSES)[number]
export type IntermissionComponentId = (typeof INTERMISSION_COMPONENT_IDS)[number]

export interface IntermissionMapStatusUpdate {
  mapId: BPMapId
  status: MatchMapStatus
}

export interface IntermissionTimer {
  status: IntermissionTimerStatus
  durationMs: number
  remainingMs: number
  deadlineAtMs: number | null
}

export interface IntermissionComponentLayout {
  x: number
  y: number
  scale: number
}

export type IntermissionLayout = Record<IntermissionComponentId, IntermissionComponentLayout>

export interface IntermissionScoreOverride {
  enabled: boolean
  teamA: number
  teamB: number
}

export interface IntermissionState {
  version: 2
  visible: boolean
  revision: number
  nextMapId: BPMapId | ''
  timer: IntermissionTimer
  scoreOverride: IntermissionScoreOverride
  layout: IntermissionLayout
}

export interface IntermissionStateUpdate {
  visible?: boolean
  nextMapId?: BPMapId | ''
  scoreOverride?: IntermissionScoreOverride
  layout?: IntermissionLayout
}

export type IntermissionTimerCommand =
  | { type: 'start'; durationMs: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'reset' }
  | { type: 'adjust'; deltaMs: number }

export interface IntermissionMatchMap {
  name: BPMapId
  pickby: string
  decider: boolean
  ascore: number
  bscore: number
  aid: string | number
  bid: string | number
  status: MatchMapStatus
  statusNeedsConfirmation: boolean
}

export interface IntermissionMatch {
  id: string | number
  type: BPMatchType
  team_a: BPTeam
  team_b: BPTeam
  maps: IntermissionMatchMap[]
}

export interface IntermissionSeriesScore {
  teamA: number
  teamB: number
}

export interface IntermissionPayload {
  state: IntermissionState
  match: IntermissionMatch | null
  seriesScore: IntermissionSeriesScore
  serverNowMs: number
}

export const INTERMISSION_PREVIEW_MESSAGES = {
  connect: 'intermission-preview-connect',
  ready: 'intermission-preview-ready',
  state: 'intermission-preview-state'
} as const

export type IntermissionPreviewPortMessage =
  | { type: typeof INTERMISSION_PREVIEW_MESSAGES.ready }
  | { type: typeof INTERMISSION_PREVIEW_MESSAGES.state; payload: IntermissionPayload }

const BP_MAP_IDS = BP_MAPS.map((map) => map.id)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number])
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function nonNegativeInteger(value: unknown): number {
  return Math.max(0, Math.floor(finiteNumber(value, 0)))
}

export function isBPMapId(value: unknown): value is BPMapId {
  return isOneOf(value, BP_MAP_IDS)
}

export function normalizeMatchMapStatus(value: unknown): MatchMapStatus {
  return isOneOf(value, MATCH_MAP_STATUSES) ? value : 'pending'
}

export function seriesWinLimit(type: BPMatchType): number {
  if (type === 'BO1') return 1
  if (type === 'BO3') return 2
  return 3
}

export function calculateIntermissionSeriesScore(
  maps: IntermissionMatchMap[],
  type: BPMatchType
): IntermissionSeriesScore {
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

export function createDefaultIntermissionLayout(): IntermissionLayout {
  return {
    teamScore: { x: 60, y: 900, scale: 1 },
    mapSeries: {
      x: Math.round((INTERMISSION_CANVAS_WIDTH - INTERMISSION_COMPONENT_SIZES.mapSeries.width) / 2),
      y: 900,
      scale: 1
    },
    timerNotice: {
      x: INTERMISSION_CANVAS_WIDTH - INTERMISSION_COMPONENT_SIZES.timerNotice.width - 60,
      y: 900,
      scale: 1
    },
    eventLogo: {
      x: INTERMISSION_CANVAS_WIDTH - INTERMISSION_COMPONENT_SIZES.eventLogo.width - 60,
      y: 60,
      scale: 1
    }
  }
}

export function normalizeIntermissionComponentLayout(
  componentId: IntermissionComponentId,
  value: unknown
): IntermissionComponentLayout {
  const fallback = createDefaultIntermissionLayout()[componentId]
  const source = isRecord(value) ? value : {}
  const size = INTERMISSION_COMPONENT_SIZES[componentId]
  const scale = clamp(
    finiteNumber(source.scale, fallback.scale),
    INTERMISSION_MIN_SCALE,
    INTERMISSION_MAX_SCALE
  )
  const maximumX = Math.max(0, INTERMISSION_CANVAS_WIDTH - size.width * scale)
  const maximumY = Math.max(0, INTERMISSION_CANVAS_HEIGHT - size.height * scale)

  return {
    x: Math.round(clamp(finiteNumber(source.x, fallback.x), 0, maximumX)),
    y: Math.round(clamp(finiteNumber(source.y, fallback.y), 0, maximumY)),
    scale: Math.round(scale * 1000) / 1000
  }
}

export function normalizeIntermissionLayout(value: unknown): IntermissionLayout {
  const source = isRecord(value) ? value : {}
  return Object.fromEntries(
    INTERMISSION_COMPONENT_IDS.map((componentId) => [
      componentId,
      normalizeIntermissionComponentLayout(componentId, source[componentId])
    ])
  ) as IntermissionLayout
}

export function normalizeIntermissionScoreOverride(
  value: unknown,
  type: BPMatchType = 'BO1'
): IntermissionScoreOverride {
  const source = isRecord(value) ? value : {}
  const maximum = seriesWinLimit(type)
  return {
    enabled: source.enabled === true,
    teamA: clamp(nonNegativeInteger(source.teamA), 0, maximum),
    teamB: clamp(nonNegativeInteger(source.teamB), 0, maximum)
  }
}

export function normalizeIntermissionTimer(value: unknown): IntermissionTimer {
  const fallback = createDefaultIntermissionTimer()
  const source = isRecord(value) ? value : {}
  const status = isOneOf(source.status, INTERMISSION_TIMER_STATUSES)
    ? source.status
    : fallback.status
  const durationMs = Math.round(
    clamp(
      finiteNumber(source.durationMs, fallback.durationMs),
      INTERMISSION_MIN_DURATION_MS,
      INTERMISSION_MAX_DURATION_MS
    )
  )
  const remainingMs = Math.round(
    clamp(finiteNumber(source.remainingMs, durationMs), 0, INTERMISSION_MAX_DURATION_MS)
  )
  const rawDeadline = finiteNumber(source.deadlineAtMs, Number.NaN)
  const deadlineAtMs = Number.isFinite(rawDeadline) ? Math.round(rawDeadline) : null

  if (status === 'running' && deadlineAtMs === null) return fallback
  if (status !== 'running' && deadlineAtMs !== null) {
    return { status, durationMs, remainingMs, deadlineAtMs: null }
  }

  return { status, durationMs, remainingMs, deadlineAtMs }
}

export function createDefaultIntermissionTimer(): IntermissionTimer {
  return {
    status: 'idle',
    durationMs: INTERMISSION_DEFAULT_DURATION_MS,
    remainingMs: INTERMISSION_DEFAULT_DURATION_MS,
    deadlineAtMs: null
  }
}

export function createDefaultIntermissionState(): IntermissionState {
  return {
    version: 2,
    visible: false,
    revision: 0,
    nextMapId: '',
    timer: createDefaultIntermissionTimer(),
    scoreOverride: normalizeIntermissionScoreOverride(null),
    layout: createDefaultIntermissionLayout()
  }
}

export function normalizeIntermissionState(
  value: unknown,
  type: BPMatchType = 'BO1'
): IntermissionState {
  const fallback = createDefaultIntermissionState()
  const source = isRecord(value) && sourceVersionIsSupported(value) ? value : {}
  return {
    version: 2,
    visible: source.visible === true,
    revision: nonNegativeInteger(source.revision),
    nextMapId: isBPMapId(source.nextMapId) ? source.nextMapId : '',
    timer: normalizeIntermissionTimer(source.timer),
    scoreOverride: normalizeIntermissionScoreOverride(source.scoreOverride, type),
    layout: normalizeIntermissionLayout(source.layout ?? fallback.layout)
  }
}

function sourceVersionIsSupported(value: Record<string, unknown>): boolean {
  return value.version === undefined || value.version === 1 || value.version === 2
}

export function isBPMatchType(value: unknown): value is BPMatchType {
  return isOneOf(value, BP_MATCH_TYPES)
}
