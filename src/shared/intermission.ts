import { BP_MAPS, BP_MATCH_TYPES, type BPMapId, type BPMatchType, type BPTeam } from './bp'
import type { BroadcastRuntimeV1 } from './broadcast-flow'
import type { MatchRuntimeV1 } from './match-session'

export const MATCH_MAP_STATUSES = ['pending', 'live', 'finished'] as const

export type MatchMapStatus = (typeof MATCH_MAP_STATUSES)[number]

export interface IntermissionMapStatusUpdate {
  mapId: BPMapId
  status: MatchMapStatus
}

export interface IntermissionScoreOverride {
  enabled: boolean
  teamA: number
  teamB: number
}

export interface IntermissionState {
  version: 3
  revision: number
  scoreOverride: IntermissionScoreOverride
}

export interface IntermissionStateUpdate {
  scoreOverride?: IntermissionScoreOverride
}

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
  runtime: BroadcastRuntimeV1
  matchRuntime: MatchRuntimeV1
  serverNowMs: number
}

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

export function createDefaultIntermissionState(): IntermissionState {
  return {
    version: 3,
    revision: 0,
    scoreOverride: normalizeIntermissionScoreOverride(null)
  }
}

export function normalizeIntermissionState(
  value: unknown,
  type: BPMatchType = 'BO1'
): IntermissionState {
  const source = isRecord(value) && sourceVersionIsSupported(value) ? value : {}
  return {
    version: 3,
    revision: nonNegativeInteger(source.revision),
    scoreOverride: normalizeIntermissionScoreOverride(source.scoreOverride, type)
  }
}

function sourceVersionIsSupported(value: Record<string, unknown>): boolean {
  return (
    value.version === undefined || value.version === 1 || value.version === 2 || value.version === 3
  )
}

export function isBPMatchType(value: unknown): value is BPMatchType {
  return isOneOf(value, BP_MATCH_TYPES)
}
