import type { IpcMain } from 'electron'
import { databaseService, type BaseEntity } from '../database/database'
import {
  calculateIntermissionSeriesScore,
  createDefaultIntermissionState,
  INTERMISSION_COMPONENT_IDS,
  INTERMISSION_MAX_DURATION_MS,
  INTERMISSION_MIN_DURATION_MS,
  isBPMapId,
  isBPMatchType,
  MATCH_MAP_STATUSES,
  normalizeIntermissionLayout,
  normalizeIntermissionScoreOverride,
  normalizeIntermissionState,
  normalizeMatchMapStatus,
  seriesWinLimit,
  type IntermissionMapStatusUpdate,
  type IntermissionMatch,
  type IntermissionMatchMap,
  type IntermissionPayload,
  type IntermissionSeriesScore,
  type IntermissionState,
  type IntermissionStateUpdate,
  type IntermissionTimerCommand,
  type MatchMapStatus
} from '../../shared/intermission'
import type { BPTeam } from '../../shared/bp'

const INTERMISSION_STATE_KEY = 'intermissionStateV1'

let liveState = createDefaultIntermissionState()
let publishPayload: ((payload: IntermissionPayload) => void) | null = null
let expiryTimer: NodeJS.Timeout | null = null
let mutationQueue: Promise<void> = Promise.resolve()

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

function clearExpiryTimer(): void {
  if (expiryTimer) clearTimeout(expiryTimer)
  expiryTimer = null
}

function scheduleExpiry(): void {
  clearExpiryTimer()
  if (liveState.timer.status !== 'running' || liveState.timer.deadlineAtMs === null) return

  const delay = Math.max(0, liveState.timer.deadlineAtMs - Date.now())
  expiryTimer = setTimeout(() => {
    void enqueueMutation(async () => {
      if (liveState.timer.status !== 'running' || liveState.timer.deadlineAtMs === null) return
      if (liveState.timer.deadlineAtMs > Date.now()) {
        scheduleExpiry()
        return
      }
      liveState = {
        ...liveState,
        revision: liveState.revision + 1,
        timer: {
          ...liveState.timer,
          status: 'finished',
          remainingMs: 0,
          deadlineAtMs: null
        }
      }
      await persistAndPublish()
    })
  }, delay)
}

async function persistState(): Promise<void> {
  await databaseService.additional.set(INTERMISSION_STATE_KEY, liveState)
}

async function buildPayload(): Promise<IntermissionPayload> {
  const match = await getCurrentMatch()
  reconcileStateForMatch(match)
  const automaticScore = match
    ? calculateIntermissionSeriesScore(match.maps, match.type)
    : { teamA: 0, teamB: 0 }
  const seriesScore = match ? effectiveSeriesScore(match, liveState) : automaticScore
  return {
    state: normalizeIntermissionState(liveState, match?.type),
    match,
    seriesScore,
    serverNowMs: Date.now()
  }
}

async function persistAndPublish(): Promise<IntermissionPayload> {
  const payload = await buildPayload()
  await persistState()
  publishPayload?.(payload)
  return payload
}

export async function initializeIntermissionState(): Promise<void> {
  await enqueueMutation(async () => {
    const match = await getCurrentMatch()
    const stored = await databaseService.additional.get(INTERMISSION_STATE_KEY)
    liveState = normalizeIntermissionState(stored, match?.type)
    const now = Date.now()

    if (liveState.timer.status === 'running' && liveState.timer.deadlineAtMs !== null) {
      if (liveState.timer.deadlineAtMs <= now) {
        liveState.timer = {
          ...liveState.timer,
          status: 'finished',
          remainingMs: 0,
          deadlineAtMs: null
        }
      } else {
        liveState.timer.remainingMs = liveState.timer.deadlineAtMs - now
      }
    }

    liveState.visible = false
    reconcileStateForMatch(match)
    await persistState()
    scheduleExpiry()
  })
}

export async function getIntermissionPayload(): Promise<IntermissionPayload> {
  await mutationQueue
  return buildPayload()
}

export async function publishIntermissionSnapshot(): Promise<IntermissionPayload> {
  const payload = await getIntermissionPayload()
  publishPayload?.(payload)
  return payload
}

export async function resetIntermissionBroadcastState(): Promise<IntermissionPayload> {
  return enqueueMutation(async () => {
    const defaultState = createDefaultIntermissionState()
    clearExpiryTimer()
    liveState = {
      ...defaultState,
      layout: liveState.layout,
      revision: liveState.revision + 1
    }
    return persistAndPublish()
  })
}

export async function updateIntermissionState(value: unknown): Promise<IntermissionPayload> {
  return enqueueMutation(async () => {
    if (!isRecord(value)) throw new Error('赛间状态更新必须是对象')
    const allowedKeys = new Set(['visible', 'nextMapId', 'scoreOverride', 'layout'])
    const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key))
    if (unknownKey) throw new Error(`赛间状态更新不支持字段：${unknownKey}`)

    const match = await getCurrentMatch()
    if (!match) throw new Error('当前比赛数据不完整，无法更新赛间状态')

    const nextState = { ...liveState }
    if (Object.prototype.hasOwnProperty.call(value, 'visible')) {
      if (typeof value.visible !== 'boolean') throw new Error('visible 必须是布尔值')
      nextState.visible = value.visible
    }
    if (Object.prototype.hasOwnProperty.call(value, 'nextMapId')) {
      if (value.nextMapId !== '' && !isBPMapId(value.nextMapId)) {
        throw new Error('nextMapId 不是受支持的地图')
      }
      nextState.nextMapId = value.nextMapId as IntermissionState['nextMapId']
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
    if (Object.prototype.hasOwnProperty.call(value, 'layout')) {
      if (!isRecord(value.layout)) throw new Error('layout 必须是对象')
      const unknownComponent = Object.keys(value.layout).find(
        (key) => !INTERMISSION_COMPONENT_IDS.some((componentId) => componentId === key)
      )
      if (unknownComponent) throw new Error(`layout 不支持组件：${unknownComponent}`)
      for (const componentId of INTERMISSION_COMPONENT_IDS) {
        const componentLayout = value.layout[componentId]
        if (!isRecord(componentLayout)) {
          throw new Error(`layout.${componentId} 必须是对象`)
        }
        for (const key of ['x', 'y', 'scale'] as const) {
          if (!Number.isFinite(Number(componentLayout[key]))) {
            throw new Error(`layout.${componentId}.${key} 必须是有限数`)
          }
        }
      }
      nextState.layout = normalizeIntermissionLayout(value.layout)
    }

    const selectedMap = match.maps.find((map) => map.name === nextState.nextMapId)
    if (nextState.nextMapId && (!selectedMap || selectedMap.status !== 'pending')) {
      throw new Error('下一张地图必须是当前比赛中尚未开始的地图')
    }
    if (seriesHasEnded(match, nextState)) {
      if (Object.prototype.hasOwnProperty.call(value, 'nextMapId') && value.nextMapId !== '') {
        throw new Error('系列赛已经结束，不能再选择下一张地图')
      }
      if (Object.prototype.hasOwnProperty.call(value, 'visible') && value.visible === true) {
        throw new Error('系列赛已经结束，不能显示赛间信息条')
      }
      nextState.nextMapId = ''
      nextState.visible = false
    }
    if (nextState.visible && !nextState.nextMapId) {
      throw new Error('显示赛间信息条前必须选择下一张地图')
    }

    liveState = { ...nextState, revision: liveState.revision + 1 }
    return persistAndPublish()
  })
}

export async function updateIntermissionMapStatus(value: unknown): Promise<IntermissionPayload> {
  return enqueueMutation(async () => {
    if (!isRecord(value) || !isBPMapId(value.mapId)) throw new Error('地图状态更新缺少合法 mapId')
    if (
      typeof value.status !== 'string' ||
      !MATCH_MAP_STATUSES.includes(value.status as MatchMapStatus)
    ) {
      throw new Error('地图状态值无效')
    }

    const record = await getCurrentMatchRecord()
    const match = await getCurrentMatch()
    if (!record || !match || !Array.isArray(record.maps)) {
      throw new Error('当前比赛数据不完整，无法修改地图状态')
    }
    const target = match.maps.find((map) => map.name === value.mapId)
    if (!target) throw new Error('所选地图不属于当前比赛')
    if (value.status === 'finished' && target.ascore === target.bscore) {
      throw new Error('平局比分不能标记为已结束')
    }
    if (
      value.status === 'live' &&
      match.maps.some((map) => map.name !== value.mapId && map.status === 'live')
    ) {
      throw new Error('同一场比赛最多只能有一张地图正在进行')
    }

    const maps = record.maps.map((map: unknown) => {
      if (!isRecord(map) || map.name !== value.mapId) return map
      return { ...map, status: value.status }
    })
    await databaseService.matchs.modify(String(record.id), { maps })

    const updatedMatch = await getCurrentMatch()
    if (!updatedMatch) throw new Error('地图状态保存后无法读取当前比赛')
    const selectedMap = updatedMatch.maps.find((map) => map.name === liveState.nextMapId)
    if (
      !selectedMap ||
      selectedMap.status !== 'pending' ||
      seriesHasEnded(updatedMatch, liveState)
    ) {
      liveState = { ...liveState, visible: false, nextMapId: '' }
    }
    liveState.revision += 1
    return persistAndPublish()
  })
}

export async function sendIntermissionTimerCommand(value: unknown): Promise<IntermissionPayload> {
  return enqueueMutation(async () => {
    if (!isRecord(value) || typeof value.type !== 'string') {
      throw new Error('倒计时命令格式无效')
    }
    const command = value as IntermissionTimerCommand
    const now = Date.now()
    const timer = { ...liveState.timer }

    if (command.type === 'start') {
      if (timer.status !== 'idle' && timer.status !== 'finished') {
        throw new Error('当前倒计时状态不允许开始')
      }
      if (!Number.isInteger(command.durationMs)) throw new Error('倒计时时长必须是整数毫秒')
      if (
        command.durationMs < INTERMISSION_MIN_DURATION_MS ||
        command.durationMs > INTERMISSION_MAX_DURATION_MS
      ) {
        throw new Error('倒计时时长必须在 00:01 至 99:59 之间')
      }
      timer.status = 'running'
      timer.durationMs = command.durationMs
      timer.remainingMs = command.durationMs
      timer.deadlineAtMs = now + command.durationMs
    } else if (command.type === 'pause') {
      if (timer.status !== 'running' || timer.deadlineAtMs === null) {
        throw new Error('只有运行中的倒计时可以暂停')
      }
      timer.remainingMs = Math.max(0, timer.deadlineAtMs - now)
      timer.deadlineAtMs = null
      timer.status = timer.remainingMs === 0 ? 'finished' : 'paused'
    } else if (command.type === 'resume') {
      if (timer.status !== 'paused' || timer.remainingMs <= 0) {
        throw new Error('只有已暂停且仍有剩余时间的倒计时可以继续')
      }
      timer.status = 'running'
      timer.deadlineAtMs = now + timer.remainingMs
    } else if (command.type === 'reset') {
      if (timer.status === 'idle') throw new Error('倒计时已经处于待开始状态')
      timer.status = 'idle'
      timer.remainingMs = timer.durationMs
      timer.deadlineAtMs = null
    } else if (command.type === 'adjust') {
      if (timer.status !== 'running' && timer.status !== 'paused') {
        throw new Error('只有运行中或已暂停的倒计时可以调整')
      }
      if (!Number.isInteger(command.deltaMs)) throw new Error('调整时间必须是整数毫秒')
      const currentRemaining =
        timer.status === 'running' && timer.deadlineAtMs !== null
          ? Math.max(0, timer.deadlineAtMs - now)
          : timer.remainingMs
      timer.remainingMs = Math.min(
        INTERMISSION_MAX_DURATION_MS,
        Math.max(0, currentRemaining + command.deltaMs)
      )
      if (timer.remainingMs === 0) {
        timer.status = 'finished'
        timer.deadlineAtMs = null
      } else if (timer.status === 'running') {
        timer.deadlineAtMs = now + timer.remainingMs
      }
    } else {
      throw new Error('不支持的倒计时命令')
    }

    liveState = { ...liveState, revision: liveState.revision + 1, timer }
    scheduleExpiry()
    return persistAndPublish()
  })
}

export function setIntermissionPublisher(publisher: (payload: IntermissionPayload) => void): void {
  publishPayload = publisher
}

export function registerIntermissionIPC(ipc: IpcMain): void {
  ipc.handle('intermission:get-state', () => getIntermissionPayload())
  ipc.handle('intermission:update-state', (_event, update: IntermissionStateUpdate) =>
    updateIntermissionState(update)
  )
  ipc.handle('intermission:update-map-status', (_event, update: IntermissionMapStatusUpdate) =>
    updateIntermissionMapStatus(update)
  )
  ipc.handle('intermission:timer-command', (_event, command: IntermissionTimerCommand) =>
    sendIntermissionTimerCommand(command)
  )
}
