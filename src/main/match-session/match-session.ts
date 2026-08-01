import { randomUUID } from 'node:crypto'
import type { IpcMain } from 'electron'
import type { CSGO } from '../csgo-extended'
import { databaseService, type BaseEntity } from '../database/database'
import { buildActiveMatchScoreUpdate, type ResolvedTeamSides } from '../gsi/match-runtime'
import {
  MATCH_RUNTIME_STATE_KEY,
  calculateNextMapIdFromSnapshots,
  calculateSnapshotSeriesScore,
  createMatchMapsFromBP,
  createDefaultMatchRuntime,
  isBPMatchType,
  normalizeMatchMapRecord,
  normalizeMatchRecord,
  normalizeMatchRuntime,
  seriesWinLimit,
  snapshotSeriesHasEnded,
  type MapFinalSnapshot,
  type MatchMapRecord,
  type MatchRecord,
  type MatchRuntimeV1,
  type PlayerFinalStats
} from '../../shared/match-session'
import {
  BP_MATCH_TYPES,
  isBPSequenceComplete,
  normalizeBPSequence,
  type BPMapId,
  type BPMatchType,
  type BPTeam
} from '../../shared/bp'
import {
  discardPreparedProgramForMatch,
  prepareBroadcastProgram,
  updatePreparedProgramNextMatch
} from '../intermission/broadcast-flow'
import { normalizeBroadcastScoreOverride } from '../../shared/broadcast-flow'
import { resetBPBroadcastState } from '../bp/bp'
import { getFinalizedMapUtilityReplay, resetUtilityReplayCaptureState } from '../gsi/utility-replay'
import { PlayerHeadshotTracker } from '../../shared/player-headshot-tracker'

interface NewMatchSetupInput {
  teamAId: string | number
  teamBId: string | number
  type: BPMatchType
}

interface SaveMatchInput {
  match: unknown
  allowStructureInvalidation: boolean
}

export interface SaveMatchResult {
  match: MatchRecord
  runtimeInvalidated: boolean
}

export interface MatchFrameProcessResult {
  match: BaseEntity | null
  scoreChanged: boolean
  runtimeChanged: boolean
  mapStarted: BPMapId | ''
  mapFinished: MapFinalSnapshot | null
  nextMapId: BPMapId | ''
}

let liveRuntime = createDefaultMatchRuntime()
let initialized = false
let initializePromise: Promise<void> | null = null
let mutationQueue: Promise<void> = Promise.resolve()
const latestPlayersByMap = new Map<string, PlayerFinalStats[]>()
const playerHeadshots = new PlayerHeadshotTracker()
let afterNextMatchCreated: (() => Promise<void>) | null = null

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation)
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function entityId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function runtimeMapKey(matchId: string | number, mapId: BPMapId): string {
  return `${String(matchId)}:${mapId}`
}

function clearTransientPlayerStats(): void {
  latestPlayersByMap.clear()
  playerHeadshots.clear()
}

export function capturePlayerHeadshotFrame(data: CSGO): void {
  playerHeadshots.capture(data)
}

function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

function buildPlayerFrame(
  data: CSGO,
  activeMatch: BaseEntity,
  resolvedSides: ResolvedTeamSides,
  registeredPlayers: BaseEntity[]
): PlayerFinalStats[] {
  if (!Array.isArray(data.players)) return []
  const teamAId = entityId(activeMatch.team_a?.id)
  const teamBId = entityId(activeMatch.team_b?.id)
  if (!teamAId || !teamBId) return []
  const allowedTeamIds = new Set([teamAId, teamBId])
  const registrationBySteamId = new Map<string, BaseEntity>()
  for (const player of registeredPlayers) {
    if (player.type !== 'player' || typeof player.steamid !== 'string') continue
    const steamid = player.steamid.trim()
    if (steamid) registrationBySteamId.set(steamid, player)
  }

  const result: PlayerFinalStats[] = []
  const seenSteamIds = new Set<string>()
  for (const player of data.players) {
    const steamid = typeof player.steamid === 'string' ? player.steamid.trim() : ''
    const side = player.team?.side
    if (!steamid || seenSteamIds.has(steamid) || (side !== 'CT' && side !== 'T')) continue
    const teamId = side === 'CT' ? resolvedSides.CT : resolvedSides.T
    if (!allowedTeamIds.has(teamId)) continue
    const kills = nonNegativeInteger(player.stats?.kills)
    const assists = nonNegativeInteger(player.stats?.assists)
    const deaths = nonNegativeInteger(player.stats?.deaths)
    const mvps = nonNegativeInteger(player.stats?.mvps)
    const score = nonNegativeInteger(player.stats?.score)
    if (kills === null || assists === null || deaths === null || mvps === null || score === null) {
      continue
    }
    const registration = registrationBySteamId.get(steamid)
    const registeredName = typeof registration?.name === 'string' ? registration.name.trim() : ''
    const adr = Number(player.state?.adr)
    result.push({
      steamid,
      teamId,
      name: registeredName || player.name,
      kills,
      assists,
      deaths,
      mvps,
      score,
      headshots: Math.min(kills, playerHeadshots.total(data.map.name, steamid)),
      adr: Number.isFinite(adr) && adr >= 0 ? adr : null
    })
    seenSteamIds.add(steamid)
  }
  return result.sort((first, second) => first.steamid.localeCompare(second.steamid))
}

function rememberPlayerFrame(
  matchId: string | number,
  mapId: BPMapId,
  players: PlayerFinalStats[],
  activeMatch: BaseEntity
): void {
  if (players.length === 0) return
  const teamAId = entityId(activeMatch.team_a?.id)
  const teamBId = entityId(activeMatch.team_b?.id)
  if (!teamAId || !teamBId) return
  const representedTeams = new Set(players.map((player) => player.teamId))
  if (!representedTeams.has(teamAId) || !representedTeams.has(teamBId)) return
  const key = runtimeMapKey(matchId, mapId)
  const previous = latestPlayersByMap.get(key)
  if (!previous || players.length >= previous.length) latestPlayersByMap.set(key, players)
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return
  if (!initializePromise) {
    initializePromise = (async () => {
      const stored = await databaseService.additional.get(MATCH_RUNTIME_STATE_KEY)
      liveRuntime = normalizeMatchRuntime(stored)
      await databaseService.additional.set(MATCH_RUNTIME_STATE_KEY, liveRuntime)
      initialized = true
    })().finally(() => {
      initializePromise = null
    })
  }
  await initializePromise
}

async function persistRuntime(): Promise<void> {
  await databaseService.additional.set(MATCH_RUNTIME_STATE_KEY, liveRuntime)
}

function ensureRuntimeMatch(matchId: string | number): boolean {
  if (String(liveRuntime.matchId ?? '') === String(matchId)) return false
  liveRuntime = createDefaultMatchRuntime(matchId)
  clearTransientPlayerStats()
  return true
}

function normalizedMatchMaps(match: BaseEntity): MatchMapRecord[] | null {
  if (!Array.isArray(match.maps)) return null
  const maps = match.maps
    .map(normalizeMatchMapRecord)
    .filter((map): map is MatchMapRecord => map !== null)
  return maps.length === match.maps.length ? maps : null
}

async function getCurrentMatchRecord(): Promise<BaseEntity | null> {
  const currentMatchId = await databaseService.settings.get('currentMatchId')
  if (typeof currentMatchId !== 'string' && typeof currentMatchId !== 'number') return null
  const match = await databaseService.matchs.get(String(currentMatchId))
  return match && typeof match === 'object' && !Array.isArray(match) ? match : null
}

function normalizeNewMatchSetup(value: unknown): NewMatchSetupInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('下一场比赛设置格式无效')
  }
  const source = value as Record<string, unknown>
  const teamAId = entityId(source.teamAId)
  const teamBId = entityId(source.teamBId)
  if (!teamAId || !teamBId) throw new Error('请选择下一场比赛的两支战队')
  if (teamAId === teamBId) throw new Error('下一场比赛的两支战队不能相同')
  if (typeof source.type !== 'string' || !BP_MATCH_TYPES.includes(source.type as BPMatchType)) {
    throw new Error('下一场比赛赛制无效')
  }
  return { teamAId, teamBId, type: source.type as BPMatchType }
}

function matchTeamFromEntity(value: BaseEntity | undefined): BPTeam | null {
  if (!value || (typeof value.id !== 'string' && typeof value.id !== 'number')) return null
  if (typeof value.name !== 'string' || typeof value.name_ingame !== 'string') return null
  return {
    id: value.id,
    name: value.name,
    name_ingame: value.name_ingame,
    ...(typeof value.avatar === 'string' && value.avatar ? { avatar: value.avatar } : {})
  }
}

function validateMatchMapsAgainstBP(match: MatchRecord): void {
  const plannedMaps = createMatchMapsFromBP(
    match.bpSequence,
    match.type,
    match.team_a.id,
    match.team_b.id
  )
  if (plannedMaps.length !== match.maps.length) {
    throw new Error('实际比赛地图数量与完整 BP 不一致')
  }
  for (let index = 0; index < plannedMaps.length; index += 1) {
    const plannedMap = plannedMaps[index]
    const map = match.maps[index]
    if (
      map.name !== plannedMap.name ||
      map.decider !== plannedMap.decider ||
      map.pickby !== plannedMap.pickby ||
      String(map.aid) !== String(plannedMap.aid) ||
      String(map.bid) !== String(plannedMap.bid)
    ) {
      throw new Error(`第 ${index + 1} 张比赛地图与完整 BP 不一致`)
    }
  }
}

function matchStructureSignature(match: MatchRecord): string {
  return JSON.stringify({
    teamAId: String(match.team_a.id),
    teamBId: String(match.team_b.id),
    type: match.type,
    bpSequence: match.bpSequence,
    maps: match.maps.map((map) => ({
      name: map.name,
      pickby: map.pickby,
      decider: map.decider,
      aid: String(map.aid),
      bid: String(map.bid)
    }))
  })
}

function matchScoreSignature(match: MatchRecord): string {
  return JSON.stringify(
    match.maps.map((map) => ({
      name: map.name,
      ascore: map.ascore,
      bscore: map.bscore,
      status: map.status
    }))
  )
}

function normalizeSaveMatchInput(value: unknown): SaveMatchInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('比赛保存请求格式无效')
  }
  const source = value as Record<string, unknown>
  if (typeof source.allowStructureInvalidation !== 'boolean') {
    throw new Error('比赛保存请求缺少结构作废确认状态')
  }
  return {
    match: source.match,
    allowStructureInvalidation: source.allowStructureInvalidation
  }
}

export async function saveCurrentMatchRecord(value: unknown): Promise<SaveMatchResult> {
  const input = normalizeSaveMatchInput(value)
  const source =
    typeof input.match === 'object' && input.match !== null && !Array.isArray(input.match)
      ? (input.match as Record<string, unknown>)
      : null
  if (!source) throw new Error('比赛数据格式无效')

  const saved = await enqueueMutation(async () => {
    await ensureInitialized()
    const currentRecord = await getCurrentMatchRecord()
    const match = normalizeMatchRecord({ ...source, id: currentRecord?.id ?? randomUUID() })
    if (!match) throw new Error('比赛数据不完整')
    if (String(match.team_a.id) === String(match.team_b.id)) {
      throw new Error('比赛双方不能是同一支战队')
    }
    validateMatchMapsAgainstBP(match)
    const existingMatch = currentRecord ? normalizeMatchRecord(currentRecord) : null
    const hasRuntimeData =
      Boolean(liveRuntime.currentMapId) ||
      liveRuntime.handledMapEndIds.length > 0 ||
      Object.keys(liveRuntime.mapSnapshots).length > 0
    if (
      currentRecord &&
      !existingMatch &&
      String(liveRuntime.matchId ?? '') === String(currentRecord.id) &&
      hasRuntimeData
    ) {
      throw new Error('当前旧版比赛记录无法安全关联已有运行快照，请先清除当前比赛运行数据')
    }
    const runtimeLocked =
      existingMatch !== null &&
      String(liveRuntime.matchId ?? '') === String(existingMatch.id) &&
      hasRuntimeData
    const structureChanged =
      existingMatch !== null &&
      matchStructureSignature(existingMatch) !== matchStructureSignature(match)
    const scoreChanged =
      existingMatch !== null && matchScoreSignature(existingMatch) !== matchScoreSignature(match)

    if (runtimeLocked && structureChanged && !input.allowStructureInvalidation) {
      throw new Error('比赛已经产生运行数据；修改双方、赛制或 BP 前必须确认作废现有快照')
    }
    if (runtimeLocked && !structureChanged && scoreChanged) {
      throw new Error('比赛已经产生运行数据；请使用人工比分功能修正结果')
    }
    let runtimeInvalidated = false
    if (runtimeLocked && structureChanged) {
      liveRuntime = {
        ...createDefaultMatchRuntime(match.id),
        revision: liveRuntime.revision + 1
      }
      clearTransientPlayerStats()
      await resetUtilityReplayCaptureState(match.id)
      await persistRuntime()
      runtimeInvalidated = true
    } else if (String(liveRuntime.matchId ?? '') !== String(match.id)) {
      liveRuntime = {
        ...createDefaultMatchRuntime(match.id),
        revision: liveRuntime.revision + 1
      }
      clearTransientPlayerStats()
      await resetUtilityReplayCaptureState(match.id)
      await persistRuntime()
    }

    if (currentRecord) {
      await databaseService.matchs.set(String(match.id), match)
    } else {
      await databaseService.matchs.add(String(match.id), match)
    }
    await databaseService.settings.set('currentMatchId', match.id)
    if (runtimeInvalidated) await discardPreparedProgramForMatch(match.id)
    return { match, runtimeInvalidated }
  })
  return saved
}

export async function createNextMatchRecord(value: unknown): Promise<BaseEntity> {
  const setup = normalizeNewMatchSetup(value)
  const [storedTeamA, storedTeamB] = await Promise.all([
    databaseService.teams.getById(setup.teamAId),
    databaseService.teams.getById(setup.teamBId)
  ])
  const teamA = matchTeamFromEntity(storedTeamA)
  const teamB = matchTeamFromEntity(storedTeamB)
  if (!teamA || !teamB) throw new Error('下一场比赛包含未注册或数据不完整的战队')

  const result = await enqueueMutation(async () => {
    await ensureInitialized()
    const currentMatch = await getCurrentMatchRecord()
    if (
      currentMatch &&
      (String(liveRuntime.matchId ?? '') !== String(currentMatch.id) || !liveRuntime.seriesEnded)
    ) {
      throw new Error('当前系列赛尚未结束，不能创建下一场比赛')
    }
    const match: BaseEntity = {
      id: randomUUID(),
      team_a: teamA,
      team_b: teamB,
      type: setup.type,
      bpSequence: [],
      maps: []
    }
    await databaseService.matchs.add(String(match.id), match)
    await databaseService.settings.set('currentMatchId', match.id)
    liveRuntime = {
      ...createDefaultMatchRuntime(match.id),
      revision: liveRuntime.revision + 1
    }
    clearTransientPlayerStats()
    await resetUtilityReplayCaptureState(match.id)
    await persistRuntime()
    return match
  })

  await afterNextMatchCreated?.()
  await resetBPBroadcastState()
  await updatePreparedProgramNextMatch({
    matchId: result.id,
    type: setup.type,
    team_a: teamA,
    team_b: teamB,
    bpReady: false
  })
  return result
}

export async function finishCurrentMatchSeries(): Promise<MatchRuntimeV1> {
  const result = await enqueueMutation(async () => {
    await ensureInitialized()
    const match = await getCurrentMatchRecord()
    if (!match || !isBPMatchType(match.type)) throw new Error('当前比赛数据不完整')
    if (String(liveRuntime.matchId ?? '') !== String(match.id)) {
      throw new Error('比赛运行状态与当前比赛不一致')
    }
    const maps = normalizedMatchMaps(match)
    if (!maps) throw new Error('当前比赛地图数据不完整')
    const finishedSnapshots = maps.filter((map) => liveRuntime.mapSnapshots[map.name])
    if (finishedSnapshots.length === 0) throw new Error('当前比赛尚无可冻结的地图结果')
    const storedIntermission = await databaseService.additional.get('intermissionStateV1')
    const rawScoreOverride =
      typeof storedIntermission === 'object' &&
      storedIntermission !== null &&
      !Array.isArray(storedIntermission)
        ? (storedIntermission as Record<string, unknown>).scoreOverride
        : null
    const scoreOverride = normalizeBroadcastScoreOverride(rawScoreOverride, match.type)
    const winLimit = seriesWinLimit(match.type)
    const hasManualWinner =
      scoreOverride.enabled &&
      scoreOverride.teamA !== scoreOverride.teamB &&
      (scoreOverride.teamA >= winLimit || scoreOverride.teamB >= winLimit)
    if (!snapshotSeriesHasEnded(maps, liveRuntime.mapSnapshots, match.type) && !hasManualWinner) {
      throw new Error('系列赛尚未达到胜场条件；人工结束前请先设置达到获胜图数的人工比分')
    }
    liveRuntime = {
      ...liveRuntime,
      currentMapId: '',
      seriesEnded: true,
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    await prepareBroadcastProgram(match, liveRuntime, '')
    return { match, runtime: normalizeMatchRuntime(liveRuntime) }
  })
  return result.runtime
}

function createMapFinalSnapshot(
  match: BaseEntity,
  maps: MatchMapRecord[],
  mapId: BPMapId,
  players: PlayerFinalStats[],
  existingSnapshots: MatchRuntimeV1['mapSnapshots']
): MapFinalSnapshot | null {
  if (!isBPMatchType(match.type)) return null
  const mapIndex = maps.findIndex((map) => map.name === mapId)
  const map = maps[mapIndex]
  if (!map || map.status !== 'finished' || map.ascore === map.bscore) return null
  const snapshot: MapFinalSnapshot = {
    mapId,
    mapIndex,
    capturedAtMs: Date.now(),
    teamAScore: map.ascore,
    teamBScore: map.bscore,
    roundCount: map.ascore + map.bscore,
    seriesScoreAfterMap: { teamA: 0, teamB: 0 },
    players
  }
  snapshot.seriesScoreAfterMap = calculateSnapshotSeriesScore(
    maps,
    { ...existingSnapshots, [mapId]: snapshot },
    match.type
  )
  return snapshot
}

export async function initializeMatchRuntimeState(): Promise<void> {
  await ensureInitialized()
}

export async function getMatchRuntimeState(): Promise<MatchRuntimeV1> {
  await mutationQueue
  await ensureInitialized()
  return normalizeMatchRuntime(liveRuntime)
}

export async function resetMatchRuntimeState(): Promise<MatchRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    liveRuntime = {
      ...createDefaultMatchRuntime(),
      revision: liveRuntime.revision + 1
    }
    clearTransientPlayerStats()
    await resetUtilityReplayCaptureState()
    await persistRuntime()
    return normalizeMatchRuntime(liveRuntime)
  })
}

export async function clearCurrentMatchRuntimeState(): Promise<MatchRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    const currentMatch = await getCurrentMatchRecord()
    const matchId = currentMatch?.id ?? null
    liveRuntime = {
      ...createDefaultMatchRuntime(matchId),
      revision: liveRuntime.revision + 1
    }
    clearTransientPlayerStats()
    await resetUtilityReplayCaptureState(matchId)
    await persistRuntime()
    if (matchId !== null) await discardPreparedProgramForMatch(matchId)
    return normalizeMatchRuntime(liveRuntime)
  })
}

export async function processActiveMatchFrame(
  data: CSGO,
  activeMatch: BaseEntity | null,
  resolvedSides: ResolvedTeamSides | null,
  registeredPlayers: BaseEntity[]
): Promise<MatchFrameProcessResult> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    const emptyResult: MatchFrameProcessResult = {
      match: activeMatch,
      scoreChanged: false,
      runtimeChanged: false,
      mapStarted: '',
      mapFinished: null,
      nextMapId: ''
    }
    if (!activeMatch || !resolvedSides || !data.map || !isBPMatchType(activeMatch.type)) {
      return emptyResult
    }
    const authoritativeMatch = await getCurrentMatchRecord()
    if (
      !authoritativeMatch ||
      String(authoritativeMatch.id) !== String(activeMatch.id) ||
      !isBPMatchType(authoritativeMatch.type)
    ) {
      return { ...emptyResult, match: null }
    }
    activeMatch = authoritativeMatch
    emptyResult.match = authoritativeMatch
    if (!isBPSequenceComplete(normalizeBPSequence(activeMatch.bpSequence), activeMatch.type)) {
      return emptyResult
    }
    const mapId = data.map.name
    const currentMaps = normalizedMatchMaps(activeMatch)
    const currentMap = currentMaps?.find((map) => map.name === mapId)
    if (!currentMaps || !currentMap) return emptyResult

    let runtimeChanged = ensureRuntimeMatch(activeMatch.id)
    capturePlayerHeadshotFrame(data)
    if (liveRuntime.seriesEnded) {
      if (runtimeChanged) {
        liveRuntime.revision += 1
        await persistRuntime()
      }
      return { ...emptyResult, runtimeChanged }
    }
    liveRuntime.lastCompleteGSIAtMs = Date.now()
    const playerFrame = buildPlayerFrame(data, activeMatch, resolvedSides, registeredPlayers)
    rememberPlayerFrame(activeMatch.id, currentMap.name, playerFrame, activeMatch)

    const updatedMatch = buildActiveMatchScoreUpdate(data, activeMatch, resolvedSides)
    if (!updatedMatch) {
      if (runtimeChanged) {
        liveRuntime.revision += 1
        await persistRuntime()
      }
      return { ...emptyResult, runtimeChanged }
    }

    const updatedMaps = normalizedMatchMaps(updatedMatch)
    const updatedMap = updatedMaps?.find((map) => map.name === currentMap.name)
    if (!updatedMaps || !updatedMap) return emptyResult
    await databaseService.matchs.modify(String(updatedMatch.id), { maps: updatedMatch.maps })

    let mapStarted: BPMapId | '' = ''
    let mapFinished: MapFinalSnapshot | null = null
    let nextMapId: BPMapId | '' = ''
    if (currentMap.status !== 'live' && updatedMap.status === 'live') {
      liveRuntime.currentMapId = currentMap.name
      liveRuntime.seriesEnded = false
      mapStarted = currentMap.name
      runtimeChanged = true
    }

    if (
      currentMap.status !== 'finished' &&
      updatedMap.status === 'finished' &&
      !liveRuntime.handledMapEndIds.includes(currentMap.name)
    ) {
      const players =
        latestPlayersByMap.get(runtimeMapKey(activeMatch.id, currentMap.name)) ?? playerFrame
      await getFinalizedMapUtilityReplay(
        activeMatch.id,
        currentMap.name,
        updatedMap.ascore + updatedMap.bscore
      )
      mapFinished = createMapFinalSnapshot(
        updatedMatch,
        updatedMaps,
        currentMap.name,
        players,
        liveRuntime.mapSnapshots
      )
      if (mapFinished) {
        liveRuntime.mapSnapshots[currentMap.name] = mapFinished
        liveRuntime.handledMapEndIds = [...liveRuntime.handledMapEndIds, currentMap.name]
        liveRuntime.lastFinishedMapId = currentMap.name
        liveRuntime.currentMapId = ''
        liveRuntime.seriesEnded = snapshotSeriesHasEnded(
          updatedMaps,
          liveRuntime.mapSnapshots,
          activeMatch.type
        )
        nextMapId = calculateNextMapIdFromSnapshots(
          updatedMaps,
          liveRuntime.mapSnapshots,
          activeMatch.type,
          currentMap.name
        )
        runtimeChanged = true
      }
    }

    if (runtimeChanged) {
      liveRuntime.revision += 1
      await persistRuntime()
    }
    if (mapFinished) {
      await prepareBroadcastProgram(updatedMatch, liveRuntime, nextMapId)
    }
    return {
      match: updatedMatch,
      scoreChanged: true,
      runtimeChanged,
      mapStarted,
      mapFinished,
      nextMapId
    }
  })
}

export function registerMatchRuntimeIPC(ipc: IpcMain): void {
  ipc.handle('match:save', (_event, value: unknown) => saveCurrentMatchRecord(value))
  ipc.handle('match-runtime:get-state', () => getMatchRuntimeState())
  ipc.handle('match-runtime:finish-series', () => finishCurrentMatchSeries())
  ipc.handle('match-runtime:clear', () => clearCurrentMatchRuntimeState())
  ipc.handle('match:create-next', (_event, value: unknown) => createNextMatchRecord(value))
}

export function setNextMatchCreatedHandler(handler: () => Promise<void>): void {
  afterNextMatchCreated = handler
}
