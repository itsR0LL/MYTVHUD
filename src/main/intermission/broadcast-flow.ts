import { randomUUID } from 'node:crypto'
import type { IpcMain } from 'electron'
import type { BaseEntity } from '../database/database'
import { databaseService } from '../database/database'
import {
  BROADCAST_FLOW_TEMPLATES_KEY,
  BROADCAST_MAX_TOTAL_DURATION_MS,
  BROADCAST_MIN_TOTAL_DURATION_MS,
  BROADCAST_RUNTIME_STATE_KEY,
  createDefaultBroadcastRuntime,
  createUnscheduledSegments,
  normalizeBroadcastDefaultTotalDurationMs,
  normalizeBroadcastRuntime,
  normalizeBroadcastScoreOverride,
  type BroadcastNextMatch,
  type BroadcastProgram,
  type BroadcastRuntimeV1
} from '../../shared/broadcast-flow'
import {
  BROADCAST_PAGE_FLOW_TEMPLATES_KEY,
  allocateBroadcastPageSegments,
  migrateBroadcastFlowTemplatesV1ToPageFlowV3,
  normalizeBroadcastPageFlowTemplates,
  type BroadcastPageFlowTemplatesV3
} from '../../shared/broadcast-page-flow-next/page-flow'
import {
  normalizeIntermissionNextLayoutState,
  type IntermissionNextPageId,
  type IntermissionNextPageLayout
} from '../../shared/intermission-next'
import { INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY } from '../intermission-next/state/storage-keys'
import {
  calculateSnapshotSeriesScore,
  normalizeMatchRecord,
  type MatchRuntimeV1
} from '../../shared/match-session'
import { BP_MAPS, type BPMapId } from '../../shared/bp'
import { getMapUtilityReplay } from '../gsi/utility-replay'

const BP_MAP_IDS = BP_MAPS.map((map) => map.id)
const LEGACY_INTERMISSION_STATE_KEY = 'intermissionStateV1'
const LEGACY_INTERMISSION_LAYOUT_SETTINGS_KEY = 'intermissionLayoutV1'
const LEGACY_INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY = 'intermissionNextLayoutV1'
const LEGACY_BROADCAST_PAGE_FLOW_TEMPLATES_KEY = 'broadcastPageFlowTemplatesV2'

let liveRuntime = createDefaultBroadcastRuntime()
let initialized = false
let initializePromise: Promise<void> | null = null
let mutationQueue: Promise<void> = Promise.resolve()
let runtimeTimer: NodeJS.Timeout | null = null
let publishRuntime: (() => void) | null = null
let beforeStartOutput: (() => Promise<void>) | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation)
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

async function removeLegacyIntermissionSettings(): Promise<void> {
  await databaseService.settings.remove(BROADCAST_FLOW_TEMPLATES_KEY)
  await databaseService.settings.remove(LEGACY_BROADCAST_PAGE_FLOW_TEMPLATES_KEY)
  await databaseService.settings.remove(LEGACY_INTERMISSION_LAYOUT_SETTINGS_KEY)
  await databaseService.settings.remove(LEGACY_INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY)
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return
  if (!initializePromise) {
    initializePromise = (async () => {
      const stored = await databaseService.additional.get(BROADCAST_RUNTIME_STATE_KEY)
      liveRuntime = normalizeBroadcastRuntime(stored)
      const now = Date.now()
      if (
        liveRuntime.playbackStatus === 'playing' &&
        liveRuntime.deadlineAtMs !== null &&
        liveRuntime.deadlineAtMs <= now
      ) {
        liveRuntime.playbackStatus = 'finished'
        liveRuntime.deadlineAtMs = null
        liveRuntime.pausedRemainingMs = 0
      }
      liveRuntime.visible = false
      await persistRuntime()
      initialized = true
      scheduleRuntimeTimer()
    })().finally(() => {
      initializePromise = null
    })
  }
  await initializePromise
}

async function persistRuntime(): Promise<void> {
  await databaseService.additional.set(BROADCAST_RUNTIME_STATE_KEY, liveRuntime)
}

function clearRuntimeTimer(): void {
  if (runtimeTimer) clearTimeout(runtimeTimer)
  runtimeTimer = null
}

function remainingMilliseconds(now = Date.now()): number {
  if (liveRuntime.playbackStatus === 'playing' && liveRuntime.deadlineAtMs !== null) {
    return Math.max(0, liveRuntime.deadlineAtMs - now)
  }
  if (liveRuntime.playbackStatus === 'paused') {
    return Math.max(0, liveRuntime.pausedRemainingMs ?? 0)
  }
  return liveRuntime.playbackStatus === 'finished' ? 0 : liveRuntime.totalDurationMs
}

function elapsedMilliseconds(now = Date.now()): number {
  return Math.max(0, liveRuntime.totalDurationMs - remainingMilliseconds(now))
}

function activeSegmentIndexAt(now = Date.now()): number {
  const segments = liveRuntime.onAirProgram?.segments ?? []
  if (segments.length === 0) return 0
  const elapsed = elapsedMilliseconds(now)
  const index = segments.findIndex((segment) => elapsed < segment.endOffsetMs)
  return index >= 0 ? index : segments.length - 1
}

function applyPreparedNextMatchToOnAirProgram(): boolean {
  const preparedProgram = liveRuntime.preparedProgram
  const onAirProgram = liveRuntime.onAirProgram
  const nextMatch = preparedProgram?.snapshot.nextMatch
  if (
    !preparedProgram ||
    !onAirProgram ||
    !nextMatch ||
    String(preparedProgram.sourceMatchId) !== String(onAirProgram.sourceMatchId) ||
    (onAirProgram.type !== 'series_end' && onAirProgram.type !== 'standby')
  ) {
    return false
  }
  if (
    String(onAirProgram.snapshot.nextMatch?.matchId ?? '') === String(nextMatch.matchId) &&
    onAirProgram.snapshot.nextMatch?.bpReady === nextMatch.bpReady
  ) {
    return false
  }
  liveRuntime = {
    ...liveRuntime,
    onAirProgram: {
      ...onAirProgram,
      snapshot: {
        ...onAirProgram.snapshot,
        nextMatch
      }
    }
  }
  return true
}

function scheduleRuntimeTimer(): void {
  clearRuntimeTimer()
  if (
    liveRuntime.playbackStatus !== 'playing' ||
    liveRuntime.deadlineAtMs === null ||
    !liveRuntime.onAirProgram
  ) {
    return
  }
  const now = Date.now()
  const remaining = Math.max(0, liveRuntime.deadlineAtMs - now)
  if (remaining === 0) {
    runtimeTimer = setTimeout(() => void handleRuntimeTimer(), 0)
    return
  }
  const elapsed = liveRuntime.totalDurationMs - remaining
  const nextBoundary = liveRuntime.onAirProgram.segments.find(
    (segment) => segment.endOffsetMs > elapsed
  )?.endOffsetMs
  const boundaryDelay = nextBoundary === undefined ? remaining : Math.max(0, nextBoundary - elapsed)
  runtimeTimer = setTimeout(
    () => void handleRuntimeTimer(),
    Math.max(1, Math.min(remaining, boundaryDelay))
  )
}

async function handleRuntimeTimer(): Promise<void> {
  await enqueueMutation(async () => {
    await ensureInitialized()
    if (liveRuntime.playbackStatus !== 'playing' || liveRuntime.deadlineAtMs === null) return
    const now = Date.now()
    if (liveRuntime.deadlineAtMs <= now) {
      applyPreparedNextMatchToOnAirProgram()
      liveRuntime = {
        ...liveRuntime,
        playbackStatus: 'finished',
        activeSegmentIndex: Math.max(0, (liveRuntime.onAirProgram?.segments.length ?? 1) - 1),
        deadlineAtMs: null,
        pausedRemainingMs: 0,
        revision: liveRuntime.revision + 1
      }
    } else {
      const activeSegmentIndex = activeSegmentIndexAt(now)
      if (activeSegmentIndex !== liveRuntime.activeSegmentIndex) {
        applyPreparedNextMatchToOnAirProgram()
        liveRuntime = {
          ...liveRuntime,
          activeSegmentIndex,
          revision: liveRuntime.revision + 1
        }
      }
    }
    await persistRuntime()
    scheduleRuntimeTimer()
    publishRuntime?.()
  })
}

async function loadPageFlowTemplates(): Promise<BroadcastPageFlowTemplatesV3> {
  const stored = await databaseService.settings.get(BROADCAST_PAGE_FLOW_TEMPLATES_KEY)
  if (stored !== undefined && stored !== null) {
    const templates = normalizeBroadcastPageFlowTemplates(stored)
    await removeLegacyIntermissionSettings()
    return templates
  }

  const pageFlowV2 = await databaseService.settings.get(LEGACY_BROADCAST_PAGE_FLOW_TEMPLATES_KEY)
  if (pageFlowV2 !== undefined && pageFlowV2 !== null) {
    const templates = normalizeBroadcastPageFlowTemplates(pageFlowV2)
    await databaseService.settings.set(BROADCAST_PAGE_FLOW_TEMPLATES_KEY, templates)
    await removeLegacyIntermissionSettings()
    return templates
  }

  const legacyStored = await databaseService.settings.get(BROADCAST_FLOW_TEMPLATES_KEY)
  const legacyStoredTemplates = isRecord(legacyStored) ? legacyStored : null
  const legacyMapBreakTemplate = legacyStoredTemplates?.map_break
  const legacyMapBreakHasDefault =
    isRecord(legacyMapBreakTemplate) &&
    Object.prototype.hasOwnProperty.call(legacyMapBreakTemplate, 'defaultTotalDurationMs')

  if (!legacyMapBreakHasDefault) {
    const legacyState = await databaseService.additional.get(LEGACY_INTERMISSION_STATE_KEY)
    const legacyTimer = isRecord(legacyState) ? legacyState.timer : null
    const legacyDurationMs = isRecord(legacyTimer)
      ? normalizeBroadcastDefaultTotalDurationMs(legacyTimer.durationMs)
      : 0
    if (legacyDurationMs > 0) {
      const migrated = migrateBroadcastFlowTemplatesV1ToPageFlowV3(legacyStored, legacyDurationMs)
      await databaseService.settings.set(BROADCAST_PAGE_FLOW_TEMPLATES_KEY, migrated)
      await removeLegacyIntermissionSettings()
      return migrated
    }
  }
  const templates = migrateBroadcastFlowTemplatesV1ToPageFlowV3(legacyStored)
  await databaseService.settings.set(BROADCAST_PAGE_FLOW_TEMPLATES_KEY, templates)
  await removeLegacyIntermissionSettings()
  return templates
}

async function loadPageLayout<PageId extends IntermissionNextPageId>(
  pageId: PageId
): Promise<IntermissionNextPageLayout<PageId>> {
  const stored = await databaseService.settings.get(INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY)
  return normalizeIntermissionNextLayoutState(stored).pages[
    pageId
  ] as IntermissionNextPageLayout<PageId>
}

async function loadScoreOverride(matchType: Parameters<typeof normalizeBroadcastScoreOverride>[1]) {
  const stored = await databaseService.additional.get('intermissionStateV1')
  const scoreOverride =
    typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      ? (stored as Record<string, unknown>).scoreOverride
      : null
  return normalizeBroadcastScoreOverride(scoreOverride, matchType)
}

export async function initializeBroadcastRuntimeState(): Promise<void> {
  await loadPageFlowTemplates()
  await ensureInitialized()
}

export async function getBroadcastRuntimeState(): Promise<BroadcastRuntimeV1> {
  await mutationQueue
  await ensureInitialized()
  return normalizeBroadcastRuntime(liveRuntime)
}

export async function prepareBroadcastProgram(
  matchValue: BaseEntity,
  matchRuntime: MatchRuntimeV1,
  nextMapId: BPMapId | '',
  nextMatch: BroadcastNextMatch | null = null
): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    const match = normalizeMatchRecord(matchValue)
    if (!match) throw new Error('当前比赛数据不完整，无法生成播出节目')
    if (String(matchRuntime.matchId ?? '') !== String(match.id)) {
      throw new Error('比赛运行状态与当前比赛不一致')
    }
    if (!matchRuntime.lastFinishedMapId) {
      throw new Error('尚无已结束地图，无法生成播出节目')
    }
    if (!matchRuntime.mapSnapshots[matchRuntime.lastFinishedMapId]) {
      throw new Error('最近结束地图缺少最终快照')
    }

    const type = matchRuntime.seriesEnded ? 'series_end' : 'map_break'
    const scoreOverride = await loadScoreOverride(match.type)
    const automaticSeriesScore = calculateSnapshotSeriesScore(
      match.maps,
      matchRuntime.mapSnapshots,
      match.type
    )
    const issues: string[] = []
    const lastMapSnapshot = matchRuntime.mapSnapshots[matchRuntime.lastFinishedMapId]
    if (!lastMapSnapshot?.players.length) {
      issues.push('最近结束地图缺少完整选手数据，本图战报仅显示已冻结内容')
    }
    let segments = createUnscheduledSegments(type, nextMatch !== null)
    const utilityReplay = await getMapUtilityReplay(match.id, matchRuntime.lastFinishedMapId)
    if (!utilityReplay?.complete) {
      if (!utilityReplay) {
        issues.push('最近结束地图没有前 30 秒道具回放数据，已跳过道具展示')
      } else if (utilityReplay.unassignedGrenadeCount > 0) {
        issues.push(
          `最近结束地图有 ${utilityReplay.unassignedGrenadeCount} 个烟、闪或火无法归属战队，已跳过道具展示`
        )
      } else {
        issues.push(
          `最近结束地图只完整记录 ${utilityReplay.rounds.length}/${utilityReplay.expectedRoundCount} 个回合，已跳过道具展示`
        )
      }
      segments = segments.filter((segment) => segment.contentType !== 'map_utility_replay')
    }
    if (type === 'map_break' && !nextMapId) {
      issues.push('系列赛尚未结束，但无法从比赛计划派生下一张地图')
      segments = segments.filter((segment) => segment.contentType !== 'next_map')
    }
    if (type === 'series_end') {
      const completedSnapshots = match.maps
        .map((map) => matchRuntime.mapSnapshots[map.name])
        .filter((snapshot) => snapshot !== undefined)
      const hasReliableSeriesPlayers =
        completedSnapshots.length > 0 &&
        completedSnapshots.every((snapshot) => {
          const teamIds = new Set(snapshot.players.map((player) => player.teamId))
          return teamIds.has(String(match.team_a.id)) && teamIds.has(String(match.team_b.id))
        })
      if (!hasReliableSeriesPlayers) {
        issues.push('系列赛选手数据不完整，已跳过系列赛选手汇总内容')
        segments = segments.filter((segment) => segment.contentType !== 'series_player_stats')
      }
    }
    const program: BroadcastProgram = {
      id: randomUUID(),
      type,
      createdAtMs: Date.now(),
      sourceMatchId: match.id,
      sourceMapId: matchRuntime.lastFinishedMapId,
      snapshot: {
        match,
        seriesScore: scoreOverride.enabled
          ? { teamA: scoreOverride.teamA, teamB: scoreOverride.teamB }
          : automaticSeriesScore,
        scoreOverride,
        lastFinishedMapId: matchRuntime.lastFinishedMapId,
        nextMapId: matchRuntime.seriesEnded ? '' : nextMapId,
        seriesEnded: matchRuntime.seriesEnded,
        mapSnapshots: matchRuntime.mapSnapshots,
        nextMatch
      },
      issues,
      segments
    }

    const currentlyPlaying =
      liveRuntime.onAirProgram !== null &&
      (liveRuntime.playbackStatus === 'playing' || liveRuntime.playbackStatus === 'paused')
    liveRuntime = {
      ...liveRuntime,
      preparedProgram: program,
      playbackStatus: currentlyPlaying ? liveRuntime.playbackStatus : 'ready',
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export async function prepareBroadcastMapReport(mapIdValue: unknown): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    if (typeof mapIdValue !== 'string' || !BP_MAP_IDS.includes(mapIdValue as BPMapId)) {
      throw new Error('地图战报准备请求缺少合法地图 ID')
    }
    const mapId = mapIdValue as BPMapId
    const sourceProgram = liveRuntime.preparedProgram ?? liveRuntime.onAirProgram
    if (!sourceProgram) throw new Error('当前没有可选择的地图快照')
    const mapSnapshot = sourceProgram.snapshot.mapSnapshots[mapId]
    if (!mapSnapshot) throw new Error('所选地图没有已冻结的最终快照')

    const issues = mapSnapshot.players.length
      ? []
      : ['所选地图缺少完整选手数据，本图战报仅显示已冻结内容']
    const program: BroadcastProgram = {
      id: randomUUID(),
      type: 'map_break',
      createdAtMs: Date.now(),
      sourceMatchId: sourceProgram.sourceMatchId,
      sourceMapId: mapId,
      snapshot: {
        ...sourceProgram.snapshot,
        lastFinishedMapId: mapId
      },
      issues,
      segments: createUnscheduledSegments('map_break', false).filter(
        (segment) => segment.contentType === 'map_report'
      )
    }
    const hasActiveProgram =
      liveRuntime.onAirProgram !== null &&
      (liveRuntime.playbackStatus === 'playing' || liveRuntime.playbackStatus === 'paused')
    liveRuntime = {
      ...liveRuntime,
      preparedProgram: program,
      playbackStatus: hasActiveProgram ? liveRuntime.playbackStatus : 'ready',
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export async function updatePreparedProgramScoreOverride(
  matchId: string | number,
  value: unknown
): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    const preparedProgram = liveRuntime.preparedProgram
    if (!preparedProgram || String(preparedProgram.sourceMatchId) !== String(matchId)) {
      return normalizeBroadcastRuntime(liveRuntime)
    }
    const scoreOverride = normalizeBroadcastScoreOverride(
      value,
      preparedProgram.snapshot.match.type
    )
    const automaticSeriesScore = calculateSnapshotSeriesScore(
      preparedProgram.snapshot.match.maps,
      preparedProgram.snapshot.mapSnapshots,
      preparedProgram.snapshot.match.type
    )
    liveRuntime = {
      ...liveRuntime,
      preparedProgram: {
        ...preparedProgram,
        id: randomUUID(),
        createdAtMs: Date.now(),
        snapshot: {
          ...preparedProgram.snapshot,
          seriesScore: scoreOverride.enabled
            ? { teamA: scoreOverride.teamA, teamB: scoreOverride.teamB }
            : automaticSeriesScore,
          scoreOverride
        }
      },
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export async function updatePreparedProgramNextMatch(
  nextMatch: BroadcastNextMatch
): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    const preparedProgram = liveRuntime.preparedProgram
    if (
      !preparedProgram ||
      String(preparedProgram.sourceMatchId) === String(nextMatch.matchId) ||
      (preparedProgram.type !== 'series_end' && preparedProgram.type !== 'standby')
    ) {
      return normalizeBroadcastRuntime(liveRuntime)
    }
    liveRuntime = {
      ...liveRuntime,
      preparedProgram: {
        ...preparedProgram,
        id: randomUUID(),
        createdAtMs: Date.now(),
        snapshot: {
          ...preparedProgram.snapshot,
          nextMatch
        },
        segments: preparedProgram.segments.map((segment, index) =>
          segment.contentType === 'standby'
            ? {
                ...segment,
                id: `${preparedProgram.type}-${index + 1}-next_match`,
                contentType: 'next_match'
              }
            : segment
        )
      },
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export async function discardPreparedProgramForMatch(
  matchId: string | number
): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    const preparedProgram = liveRuntime.preparedProgram
    if (!preparedProgram || String(preparedProgram.sourceMatchId) !== String(matchId)) {
      return normalizeBroadcastRuntime(liveRuntime)
    }
    const hasActiveProgram =
      liveRuntime.onAirProgram !== null &&
      (liveRuntime.playbackStatus === 'playing' || liveRuntime.playbackStatus === 'paused')
    liveRuntime = {
      ...liveRuntime,
      preparedProgram: null,
      playbackStatus: hasActiveProgram ? liveRuntime.playbackStatus : 'idle',
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export async function hideBroadcastOutput(): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    if (!liveRuntime.visible) return normalizeBroadcastRuntime(liveRuntime)
    liveRuntime = {
      ...liveRuntime,
      visible: false,
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export async function showBroadcastOutput(): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    if (!liveRuntime.onAirProgram) throw new Error('当前没有可以恢复显示的播出页面')
    if (liveRuntime.visible) return normalizeBroadcastRuntime(liveRuntime)
    liveRuntime = {
      ...liveRuntime,
      visible: true,
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export async function startPreparedBroadcastProgram(
  durationMs: number
): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    if (
      !Number.isInteger(durationMs) ||
      durationMs < BROADCAST_MIN_TOTAL_DURATION_MS ||
      durationMs > BROADCAST_MAX_TOTAL_DURATION_MS
    ) {
      throw new Error('播出总时长必须为 1 秒至 99 分 59 秒')
    }
    const preparedProgram = liveRuntime.preparedProgram
    if (!preparedProgram) throw new Error('当前没有已准备的播出节目')
    await beforeStartOutput?.()
    const templates = await loadPageFlowTemplates()
    const pageTemplate = templates.templates[preparedProgram.type]
    const pageLayout = await loadPageLayout(preparedProgram.type)
    const segments = allocateBroadcastPageSegments(pageTemplate, durationMs, {
      availableContentTypes: preparedProgram.segments.map((segment) => segment.contentType),
      pageLayout
    })
    const now = Date.now()
    liveRuntime = {
      ...liveRuntime,
      visible: true,
      playbackStatus: 'playing',
      onAirProgram: { ...preparedProgram, segments },
      activeSegmentIndex: 0,
      totalDurationMs: durationMs,
      startedAtMs: now,
      deadlineAtMs: now + durationMs,
      pausedRemainingMs: null,
      playRevision: liveRuntime.playRevision + 1,
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    scheduleRuntimeTimer()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export async function replayBroadcastProgram(): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    if (!liveRuntime.onAirProgram || liveRuntime.totalDurationMs <= 0) {
      throw new Error('当前没有可以重新播放的节目')
    }
    const now = Date.now()
    liveRuntime = {
      ...liveRuntime,
      visible: true,
      playbackStatus: 'playing',
      activeSegmentIndex: 0,
      startedAtMs: now,
      deadlineAtMs: now + liveRuntime.totalDurationMs,
      pausedRemainingMs: null,
      playRevision: liveRuntime.playRevision + 1,
      revision: liveRuntime.revision + 1
    }
    await persistRuntime()
    scheduleRuntimeTimer()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export async function resetBroadcastRuntimeState(): Promise<BroadcastRuntimeV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    liveRuntime = {
      ...createDefaultBroadcastRuntime(),
      playRevision: liveRuntime.playRevision,
      revision: liveRuntime.revision + 1
    }
    clearRuntimeTimer()
    await persistRuntime()
    publishRuntime?.()
    return normalizeBroadcastRuntime(liveRuntime)
  })
}

export function setBroadcastRuntimePublisher(publisher: () => void): void {
  publishRuntime = publisher
}

export function setBroadcastStartOutputGuard(guard: () => Promise<void>): void {
  beforeStartOutput = guard
}

export function registerBroadcastRuntimeIPC(ipc: IpcMain): void {
  ipc.handle('broadcast:get-state', () => getBroadcastRuntimeState())
  ipc.handle('broadcast:prepare-map-report', (_event, mapId: unknown) =>
    prepareBroadcastMapReport(mapId)
  )
}
