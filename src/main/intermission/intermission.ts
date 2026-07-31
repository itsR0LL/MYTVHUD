import type { IpcMain } from 'electron'
import { databaseService, type BaseEntity } from '../database/database'
import {
  calculateIntermissionSeriesScore,
  createDefaultIntermissionState,
  isBPMapId,
  isBPMatchType,
  MATCH_MAP_STATUSES,
  normalizeIntermissionScoreOverride,
  normalizeIntermissionState,
  normalizeMatchMapStatus,
  seriesWinLimit,
  type IntermissionMatch,
  type IntermissionMatchMap,
  type IntermissionPayload,
  type IntermissionSeriesScore,
  type IntermissionState,
  type IntermissionStateUpdate,
  type MatchMapStatus
} from '../../shared/intermission'
import type { BPTeam } from '../../shared/bp'
import {
  getBroadcastRuntimeState,
  hideBroadcastOutput,
  startPreparedBroadcastProgram,
  setBroadcastRuntimePublisher,
  updatePreparedProgramScoreOverride
} from './broadcast-flow'
import { getMatchRuntimeState } from '../match-session/match-session'
import { calculateSnapshotSeriesScore } from '../../shared/match-session'

const INTERMISSION_STATE_KEY = 'intermissionStateV1'

let liveState = createDefaultIntermissionState()
let publishPayload: (() => void) | null = null
let mutationQueue: Promise<void> = Promise.resolve()

setBroadcastRuntimePublisher(() => {
  void publishIntermissionSnapshot()
})

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation)
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEntityId(value: unknown): value is string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

function nonNegativeInteger(value: unknown, fieldName: string): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${fieldName} 必须是非负整数`)
  }
  return number
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

function normalizeMatchMap(
  value: unknown,
  teamAId: string | number,
  teamBId: string | number
): IntermissionMatchMap | null {
  if (!isRecord(value) || !isBPMapId(value.name)) return null
  if (!isEntityId(value.aid) || !isEntityId(value.bid)) return null
  if (String(value.aid) !== String(teamAId) || String(value.bid) !== String(teamBId)) return null
  if (typeof value.pickby !== 'string' || typeof value.decider !== 'boolean') return null

  const ascore = Number(value.ascore)
  const bscore = Number(value.bscore)
  if (!Number.isInteger(ascore) || ascore < 0 || !Number.isInteger(bscore) || bscore < 0)
    return null

  return {
    name: value.name,
    pickby: value.pickby,
    decider: value.decider,
    ascore,
    bscore,
    aid: value.aid,
    bid: value.bid,
    status: normalizeMatchMapStatus(value.status),
    statusNeedsConfirmation: !MATCH_MAP_STATUSES.includes(value.status as MatchMapStatus)
  }
}

async function getCurrentMatchRecord(): Promise<BaseEntity | null> {
  const currentMatchId = await databaseService.settings.get('currentMatchId')
  if (!isEntityId(currentMatchId)) return null
  const match = await databaseService.matchs.get(String(currentMatchId))
  return isRecord(match) && isEntityId(match.id) ? (match as BaseEntity) : null
}

async function getCurrentMatch(): Promise<IntermissionMatch | null> {
  const match = await getCurrentMatchRecord()
  if (!match || !isBPMatchType(match.type) || !Array.isArray(match.maps)) return null

  const embeddedTeamA = normalizeTeam(match.team_a)
  const embeddedTeamB = normalizeTeam(match.team_b)
  if (!embeddedTeamA || !embeddedTeamB) return null

  const [storedTeamA, storedTeamB] = await Promise.all([
    databaseService.teams.getById(embeddedTeamA.id),
    databaseService.teams.getById(embeddedTeamB.id)
  ])
  const teamA = normalizeTeam(storedTeamA) ?? embeddedTeamA
  const teamB = normalizeTeam(storedTeamB) ?? embeddedTeamB
  const maps = match.maps
    .map((map) => normalizeMatchMap(map, teamA.id, teamB.id))
    .filter((map): map is IntermissionMatchMap => map !== null)

  const requiredMapCount = Number(match.type.slice(2))
  if (maps.length !== requiredMapCount) return null

  return {
    id: match.id,
    type: match.type,
    team_a: teamA,
    team_b: teamB,
    maps
  }
}

function effectiveSeriesScore(
  match: IntermissionMatch,
  state: IntermissionState
): IntermissionSeriesScore {
  return state.scoreOverride.enabled
    ? { teamA: state.scoreOverride.teamA, teamB: state.scoreOverride.teamB }
    : calculateIntermissionSeriesScore(match.maps, match.type)
}

function seriesHasEnded(match: IntermissionMatch, state: IntermissionState): boolean {
  const score = effectiveSeriesScore(match, state)
  const maximum = seriesWinLimit(match.type)
  return score.teamA >= maximum || score.teamB >= maximum
}

function reconcileStateForMatch(match: IntermissionMatch | null): void {
  if (!match) {
    liveState = { ...liveState, visible: false, nextMapId: '' }
    return
  }

  liveState = {
    ...liveState,
    scoreOverride: normalizeIntermissionScoreOverride(liveState.scoreOverride, match.type)
  }
  const selectedMap = match.maps.find((map) => map.name === liveState.nextMapId)
  if (!selectedMap || selectedMap.status !== 'pending' || seriesHasEnded(match, liveState)) {
    liveState = { ...liveState, visible: false, nextMapId: '' }
  }
}

async function persistState(): Promise<void> {
  await databaseService.additional.set(INTERMISSION_STATE_KEY, liveState)
}

async function buildPayload(): Promise<IntermissionPayload> {
  const [match, runtime, matchRuntime] = await Promise.all([
    getCurrentMatch(),
    getBroadcastRuntimeState(),
    getMatchRuntimeState()
  ])
  reconcileStateForMatch(match)
  const automaticScore = match
    ? calculateSnapshotSeriesScore(match.maps, matchRuntime.mapSnapshots, match.type)
    : { teamA: 0, teamB: 0 }
  const seriesScore = match
    ? liveState.scoreOverride.enabled
      ? { teamA: liveState.scoreOverride.teamA, teamB: liveState.scoreOverride.teamB }
      : automaticScore
    : automaticScore
  return {
    state: normalizeIntermissionState(liveState, match?.type),
    match,
    seriesScore,
    runtime,
    matchRuntime,
    serverNowMs: Date.now()
  }
}

async function persistAndPublish(): Promise<IntermissionPayload> {
  const payload = await buildPayload()
  await persistState()
  publishPayload?.()
  return payload
}

export async function initializeIntermissionState(): Promise<void> {
  await enqueueMutation(async () => {
    const match = await getCurrentMatch()
    const stored = await databaseService.additional.get(INTERMISSION_STATE_KEY)
    liveState = normalizeIntermissionState(stored, match?.type)
    liveState.visible = false
    liveState.timer = {
      status: 'idle',
      durationMs: liveState.timer.durationMs,
      remainingMs: liveState.timer.durationMs,
      deadlineAtMs: null
    }
    reconcileStateForMatch(match)
    await persistState()
  })
}

export async function getIntermissionPayload(): Promise<IntermissionPayload> {
  await mutationQueue
  return buildPayload()
}

export async function publishIntermissionSnapshot(): Promise<IntermissionPayload> {
  const payload = await getIntermissionPayload()
  publishPayload?.()
  return payload
}

export async function resetIntermissionBroadcastState(): Promise<IntermissionPayload> {
  return enqueueMutation(async () => {
    const defaultState = createDefaultIntermissionState()
    liveState = {
      ...defaultState,
      layout: liveState.layout,
      revision: liveState.revision + 1
    }
    return persistAndPublish()
  })
}

export async function resetIntermissionScoreOverride(): Promise<IntermissionPayload> {
  return enqueueMutation(async () => {
    liveState = {
      ...liveState,
      scoreOverride: {
        enabled: false,
        teamA: 0,
        teamB: 0
      },
      revision: liveState.revision + 1
    }
    return persistAndPublish()
  })
}

export async function updateIntermissionState(value: unknown): Promise<IntermissionPayload> {
  return enqueueMutation(async () => {
    if (!isRecord(value)) throw new Error('赛间状态更新必须是对象')
    const allowedKeys = new Set(['visible', 'nextMapId', 'scoreOverride'])
    const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key))
    if (unknownKey) throw new Error(`赛间状态更新不支持字段：${unknownKey}`)

    const match = await getCurrentMatch()
    if (!match) throw new Error('当前比赛数据不完整，无法更新赛间状态')

    const nextState = { ...liveState }
    let outputCommand: boolean | null = null
    if (Object.prototype.hasOwnProperty.call(value, 'visible')) {
      if (typeof value.visible !== 'boolean') throw new Error('visible 必须是布尔值')
      outputCommand = value.visible
      nextState.visible = false
    }
    if (Object.prototype.hasOwnProperty.call(value, 'nextMapId')) {
      if (value.nextMapId !== '' && !isBPMapId(value.nextMapId)) {
        throw new Error('nextMapId 不是受支持的地图')
      }
      if (value.nextMapId !== '') {
        throw new Error('下一张地图已经改为由完整 BP 和比赛运行状态自动计算')
      }
      nextState.nextMapId = ''
    }
    if (Object.prototype.hasOwnProperty.call(value, 'scoreOverride')) {
      if (!isRecord(value.scoreOverride) || typeof value.scoreOverride.enabled !== 'boolean') {
        throw new Error('scoreOverride 数据不完整')
      }
      nonNegativeInteger(value.scoreOverride.teamA, 'teamA')
      nonNegativeInteger(value.scoreOverride.teamB, 'teamB')
      const maximum = seriesWinLimit(match.type)
      if (
        Number(value.scoreOverride.teamA) > maximum ||
        Number(value.scoreOverride.teamB) > maximum
      ) {
        throw new Error(`人工比分不得超过 ${maximum}`)
      }
      nextState.scoreOverride = normalizeIntermissionScoreOverride(value.scoreOverride, match.type)
    }
    liveState = { ...nextState, revision: liveState.revision + 1 }
    if (Object.prototype.hasOwnProperty.call(value, 'scoreOverride')) {
      await updatePreparedProgramScoreOverride(match.id, liveState.scoreOverride)
    }
    if (outputCommand === true) {
      await startPreparedBroadcastProgram(liveState.timer.durationMs)
    } else if (outputCommand === false) {
      await hideBroadcastOutput()
    }
    return persistAndPublish()
  })
}

export function setIntermissionPublisher(publisher: () => void): void {
  publishPayload = publisher
}

export function registerIntermissionIPC(ipc: IpcMain): void {
  ipc.handle('intermission:get-state', () => getIntermissionPayload())
  ipc.handle('intermission:update-state', (_event, update: IntermissionStateUpdate) =>
    updateIntermissionState(update)
  )
}
