import {
  broadcastDirectorStageLabel,
  isBroadcastDirectorStage,
  type BroadcastDirectorAdvanceDecision,
  type BroadcastDirectorJumpTarget,
  type BroadcastDirectorSnapshot,
  type BroadcastDirectorStage
} from '../../shared/broadcast-director'
import { BROADCAST_MAX_TOTAL_DURATION_MS } from '../../shared/broadcast-flow'
import {
  BP_BROADCAST_TIMELINE_DURATION_MS,
  type BPMapId,
  type BPSequenceItem
} from '../../shared/bp'
import type { GlobalBackgroundStateV1 } from '../../shared/intermission-background-next/background-state'
import {
  createDefaultIntermissionTestModeState,
  nextIntermissionTestStage,
  type IntermissionTestModeStateV1
} from '../../shared/intermission-test-mode'
import type {
  IntermissionPageMap,
  IntermissionPagePlayer,
  IntermissionPageTeam
} from '../../shared/intermission-page-data-next/view-model'
import type { IntermissionNextMapMediaOutputFrame } from '../../shared/intermission-output-next/map-media'
import type {
  IntermissionNextActiveSegment,
  IntermissionNextOutputPayloadV1,
  IntermissionNextPageData
} from '../../shared/intermission-output-next/output'
import type { IntermissionNextLayoutState } from '../../shared/intermission-next'

const TEST_BACKGROUND_TRANSITION_DURATION_MS = 1_000
const TEST_MAP_MEDIA_ROTATION_INTERVAL_MS = 10_000
const TEST_MAP_MEDIA_CROSSFADE_DURATION_MS = 1_500
const TEST_BP_SEQUENCE: BPSequenceItem[] = [
  { map: 'de_mirage', action: 'ban', actor: 'team_a', startingSide: '' },
  { map: 'de_nuke', action: 'ban', actor: 'team_b', startingSide: '' },
  { map: 'de_ancient', action: 'pick', actor: 'team_a', startingSide: 'CT' },
  { map: 'de_anubis', action: 'pick', actor: 'team_b', startingSide: 'T' },
  { map: 'de_overpass', action: 'pick', actor: 'team_a', startingSide: 'T' },
  { map: 'de_vertigo', action: 'pick', actor: 'team_b', startingSide: 'CT' },
  { map: 'de_dust2', action: 'decider', actor: '', startingSide: '' }
]
const TEST_JUMP_TARGETS: BroadcastDirectorJumpTarget[] = [
  { id: 'warmup', stage: 'warmup', sourceMapId: '', label: '暖场', available: true, reason: '' },
  { id: 'bp', stage: 'bp', sourceMapId: '', label: 'BP 展示', available: true, reason: '' },
  {
    id: 'gameplay:1:de_ancient',
    stage: 'hidden',
    sourceMapId: 'de_ancient',
    label: '图 1 比赛画面 · Ancient(远古遗迹)',
    available: true,
    reason: ''
  },
  {
    id: 'map-break:1:de_ancient',
    stage: 'map_break',
    sourceMapId: 'de_ancient',
    label: '图 1 地图间播出 · Ancient(远古遗迹)',
    available: true,
    reason: ''
  },
  {
    id: 'series-end',
    stage: 'series_end',
    sourceMapId: '',
    label: '系列赛结束',
    available: true,
    reason: ''
  },
  {
    id: 'standby',
    stage: 'standby',
    sourceMapId: '',
    label: '赛事待机',
    available: true,
    reason: ''
  }
]
const teamA: IntermissionPageTeam = { id: 'test-team-a', name: '极光战队', avatar: null }
const teamB: IntermissionPageTeam = { id: 'test-team-b', name: '远峰战队', avatar: null }

let liveState = createDefaultIntermissionTestModeState()

function player(
  steamid: string,
  teamId: string,
  name: string,
  kills: number,
  assists: number,
  deaths: number,
  score: number,
  adr: number,
  headshotRate: number
): IntermissionPagePlayer {
  return {
    steamid,
    teamId,
    name,
    kills,
    assists,
    deaths,
    mvps: 0,
    score,
    headshotRate,
    adr,
    mapsPlayed: 2
  }
}

const teamAPlayers = [
  player('test-a-1', teamA.id, '星河', 24, 6, 15, 58, 92.4, 58),
  player('test-a-2', teamA.id, '北辰', 21, 4, 17, 49, 84.1, 52),
  player('test-a-3', teamA.id, '山海', 18, 8, 16, 43, 79.2, 44),
  player('test-a-4', teamA.id, '轨迹', 16, 5, 18, 37, 70.5, 63),
  player('test-a-5', teamA.id, '流光', 13, 7, 19, 32, 66.3, 46)
]
const teamBPlayers = [
  player('test-b-1', teamB.id, '石英', 22, 5, 18, 51, 88.7, 55),
  player('test-b-2', teamB.id, '螺旋', 20, 3, 18, 46, 82.3, 50),
  player('test-b-3', teamB.id, '潮汐', 17, 9, 19, 42, 76.9, 41),
  player('test-b-4', teamB.id, '暮色', 14, 6, 20, 34, 68.8, 57),
  player('test-b-5', teamB.id, '岩层', 12, 4, 21, 29, 61.4, 42)
]

const maps: IntermissionPageMap[] = [
  {
    mapId: 'de_ancient',
    name: 'Ancient',
    decider: false,
    pickedByTeamId: teamA.id,
    status: 'finished',
    teamAScore: 13,
    teamBScore: 10
  },
  {
    mapId: 'de_anubis',
    name: 'Anubis',
    decider: false,
    pickedByTeamId: teamB.id,
    status: 'pending',
    teamAScore: null,
    teamBScore: null
  },
  {
    mapId: 'de_dust2',
    name: 'Dust2',
    decider: false,
    pickedByTeamId: teamA.id,
    status: 'pending',
    teamAScore: null,
    teamBScore: null
  },
  {
    mapId: 'de_inferno',
    name: 'Inferno',
    decider: false,
    pickedByTeamId: teamB.id,
    status: 'pending',
    teamAScore: null,
    teamBScore: null
  },
  {
    mapId: 'de_nuke',
    name: 'Nuke',
    decider: true,
    pickedByTeamId: null,
    status: 'pending',
    teamAScore: null,
    teamBScore: null
  }
]

export function createIntermissionTestPageData(
  stage: BroadcastDirectorStage,
  revision: number,
  stageStartedAtMs: number
): IntermissionNextPageData | null {
  if (stage === 'hidden') return null
  if (stage === 'warmup') {
    return {
      page: 'warmup',
      matchId: 'test-match',
      matchType: 'BO5',
      teamA,
      teamB,
      bpStatus: 'bp_ready',
      prompt: '直播即将开始',
      issues: []
    }
  }
  if (stage === 'bp') {
    return {
      page: 'bp',
      matchId: 'test-match',
      matchType: 'BO5',
      teamA,
      teamB,
      sequence: TEST_BP_SEQUENCE.map((item) => ({ ...item })),
      playbackStarted: true,
      playbackStartedAtMs: stageStartedAtMs,
      animationEnabled: true,
      playRevision: revision,
      preview: false,
      issues: []
    }
  }
  if (stage === 'map_break') {
    return {
      page: 'map_break',
      sourceMatchId: 'test-match',
      sourceMapId: 'de_ancient',
      teamA,
      teamB,
      seriesScore: { teamA: 1, teamB: 0 },
      finalScore: { teamA: 13, teamB: 10 },
      maps,
      nextMap: maps[1],
      teamAPlayers,
      teamBPlayers,
      unassignedPlayerCount: 0,
      highlightedSteamid: 'test-a-1',
      scoreTimeline: Array.from({ length: 23 }, (_, index) => {
        const roundIndex = index + 1
        const teamAScore = Math.min(13, Math.round((roundIndex * 13) / 23))
        const teamBScore = roundIndex - teamAScore
        return {
          roundIndex,
          teamAScore,
          teamBScore,
          winnerTeamId:
            index === 0 || teamAScore > Math.min(13, Math.round(((roundIndex - 1) * 13) / 23))
              ? teamA.id
              : teamB.id
        }
      }),
      scoreTimelineComplete: true,
      issues: []
    }
  }
  if (stage === 'series_end') {
    return {
      page: 'series_end',
      sourceMatchId: 'test-match',
      teamA,
      teamB,
      finalSeriesScore: { teamA: 3, teamB: 1 },
      winnerTeamId: teamA.id,
      maps: maps.map((map, index) => {
        const finishedScores = [
          { teamA: 13, teamB: 10 },
          { teamA: 9, teamB: 13 },
          { teamA: 13, teamB: 7 },
          { teamA: 13, teamB: 11 }
        ]
        const score = finishedScores[index]
        return score
          ? {
              ...map,
              status: 'finished' as const,
              teamAScore: score.teamA,
              teamBScore: score.teamB
            }
          : map
      }),
      teamAPlayers,
      teamBPlayers,
      unassignedPlayerCount: 0,
      highlightedSteamid: 'test-a-1',
      nextMatch: null,
      issues: []
    }
  }
  return {
    page: 'standby',
    sourceMatchId: 'test-match',
    previousResult: {
      teamA,
      teamB,
      finalSeriesScore: { teamA: 3, teamB: 1 },
      winnerTeamId: teamA.id
    },
    nextMatch: null,
    nextMatchStatus: 'not_configured',
    issues: []
  }
}

function mapMediaFile(mapId: BPMapId, purpose: 'hero' | 'sequence', assetIndex: 1 | 2) {
  const directory = purpose === 'hero' ? 'display' : 'component'
  const filename =
    purpose === 'hero' ? `${mapId}_${assetIndex}_png.png` : `${mapId}_${assetIndex}.jpg`
  return {
    url: `/intermission-next/assets/maps/${mapId}/${directory}/${filename}`,
    fallbackUrl: `/intermission-next/assets/maps/${mapId}/fallback.png`,
    width: purpose === 'hero' ? 1920 : 640,
    height: purpose === 'hero' ? 1080 : 360
  }
}

function animatedMapMediaFrame(
  mapId: BPMapId,
  purpose: 'hero' | 'sequence',
  stageStartedAtMs: number,
  nowMs: number
): IntermissionNextMapMediaOutputFrame {
  const elapsedMs = Math.max(0, nowMs - stageStartedAtMs)
  const cycleIndex = Math.floor(elapsedMs / TEST_MAP_MEDIA_ROTATION_INTERVAL_MS)
  const frameStartedAtMs = stageStartedAtMs + cycleIndex * TEST_MAP_MEDIA_ROTATION_INTERVAL_MS
  const frameEndAtMs = frameStartedAtMs + TEST_MAP_MEDIA_ROTATION_INTERVAL_MS
  const currentIndex = cycleIndex % 2 === 0 ? 1 : 2
  const preloadIndex = currentIndex === 1 ? 2 : 1
  const crossfadeStartedAtMs = frameEndAtMs - TEST_MAP_MEDIA_CROSSFADE_DURATION_MS
  return {
    mapId,
    purpose,
    mediaRevision: 1,
    current: mapMediaFile(mapId, purpose, currentIndex),
    preload: mapMediaFile(mapId, purpose, preloadIndex),
    crossfadeProgress: Math.max(
      0,
      Math.min(1, (nowMs - crossfadeStartedAtMs) / TEST_MAP_MEDIA_CROSSFADE_DURATION_MS)
    ),
    frameStartedAtMs,
    frameEndAtMs,
    crossfadeStartedAtMs,
    crossfadeDurationMs: TEST_MAP_MEDIA_CROSSFADE_DURATION_MS
  }
}

export function createIntermissionTestMapMedia(
  stage: BroadcastDirectorStage,
  stageStartedAtMs: number,
  nowMs: number
): IntermissionNextMapMediaOutputFrame[] {
  if (stage !== 'map_break' && stage !== 'series_end') return []
  if (stage === 'map_break') {
    return [
      animatedMapMediaFrame('de_anubis', 'hero', stageStartedAtMs, nowMs),
      ...maps.map((map) => animatedMapMediaFrame(map.mapId, 'sequence', stageStartedAtMs, nowMs))
    ]
  }
  return maps.map((map) => animatedMapMediaFrame(map.mapId, 'sequence', stageStartedAtMs, nowMs))
}

function testActiveSegment(
  stage: BroadcastDirectorStage,
  startOffsetMs: number,
  durationMs: number
): IntermissionNextActiveSegment | null {
  const contentType =
    stage === 'map_break'
      ? ('map_report' as const)
      : stage === 'series_end'
        ? ('series_result' as const)
        : stage === 'standby'
          ? ('standby' as const)
          : null
  return contentType
    ? {
        id: `test-${stage}`,
        contentType,
        startOffsetMs,
        durationMs
      }
    : null
}

export function intermissionTestContentStartOffsetMs(
  layout: IntermissionNextLayoutState,
  stage: BroadcastDirectorStage
): number {
  if (stage !== 'map_break' && stage !== 'series_end') return 0
  const windows = layout.pages[stage].componentWindows.utilityReplay ?? []
  return windows.reduce((offsetMs, window) => {
    if (window.startOffsetMs !== 0 || window.endOffsetMs === null) return offsetMs
    return Math.max(offsetMs, window.endOffsetMs)
  }, 0)
}

function nextDecision(stage: BroadcastDirectorStage): BroadcastDirectorAdvanceDecision {
  const targetStage = nextIntermissionTestStage(stage)
  return {
    allowed: true,
    targetStage,
    actionLabel:
      stage === 'hidden'
        ? '开始暖场'
        : stage === 'standby'
          ? '进入下一场暖场'
          : `转场至${broadcastDirectorStageLabel(targetStage)}`,
    reason: ''
  }
}

function testDirector(state: IntermissionTestModeStateV1): BroadcastDirectorSnapshot {
  return {
    runtime: {
      version: 1,
      stage: state.stage,
      hiddenReason: 'idle',
      resumeStage: null,
      consumedProgramId: null,
      stageStartedAtMs: state.stageStartedAtMs,
      revision: state.revision
    },
    next: nextDecision(state.stage),
    bpReady: true,
    bpPlaybackStarted: state.stage === 'bp',
    preparedProgramId: 'test-program',
    preparedProgramType: state.stage === 'series_end' ? 'series_end' : 'map_break',
    jumpTargets: TEST_JUMP_TARGETS.map((target) => ({ ...target }))
  }
}

function testBackground(
  source: GlobalBackgroundStateV1,
  payload: IntermissionNextOutputPayloadV1,
  state: IntermissionTestModeStateV1
): GlobalBackgroundStateV1 {
  const assetIds = payload.backgroundAssets.map((asset) => asset.id)
  if (assetIds.length === 0 || state.stage === 'hidden') return source
  const targetIndex = Math.max(0, state.visibleStageCount - 1) % assetIds.length
  const previousIndex = (targetIndex - 1 + assetIds.length) % assetIds.length
  const targetAssetId = assetIds[targetIndex]
  const elapsedMs = Math.max(0, payload.serverNowMs - state.stageStartedAtMs)
  const transitioning =
    state.visibleStageCount > 1 && elapsedMs < TEST_BACKGROUND_TRANSITION_DURATION_MS
  return {
    ...source,
    revision: state.revision,
    switchRevision: state.revision,
    visible: true,
    playbackStatus: 'playing',
    activeAssetId: transitioning ? assetIds[previousIndex] : targetAssetId,
    preloadAssetId: transitioning ? targetAssetId : null,
    positionMs: elapsedMs,
    startedAtMs: state.stageStartedAtMs,
    transition: transitioning
      ? {
          fromAssetId: assetIds[previousIndex],
          toAssetId: targetAssetId,
          startedAtMs: state.stageStartedAtMs,
          durationMs: TEST_BACKGROUND_TRANSITION_DURATION_MS
        }
      : null
  }
}

export function getIntermissionTestModeState(): IntermissionTestModeStateV1 {
  return structuredClone(liveState)
}

export function setIntermissionTestModeEnabled(enabled: boolean): IntermissionTestModeStateV1 {
  const nowMs = Date.now()
  liveState = {
    ...createDefaultIntermissionTestModeState(nowMs),
    enabled,
    revision: liveState.revision + 1
  }
  return getIntermissionTestModeState()
}

export function setIntermissionTestStage(stage: unknown): IntermissionTestModeStateV1 {
  if (!liveState.enabled) throw new Error('请先启用无比赛测试模式')
  if (!isBroadcastDirectorStage(stage)) throw new Error('测试播出阶段无效')
  liveState = {
    ...liveState,
    stage,
    stageStartedAtMs: Date.now(),
    revision: liveState.revision + 1,
    visibleStageCount:
      stage === 'hidden' ? liveState.visibleStageCount : liveState.visibleStageCount + 1
  }
  return getIntermissionTestModeState()
}

export function advanceIntermissionTestStage(): IntermissionTestModeStateV1 {
  return setIntermissionTestStage(nextIntermissionTestStage(liveState.stage))
}

export function hideIntermissionTestOutput(): IntermissionTestModeStateV1 {
  return setIntermissionTestStage('hidden')
}

export function applyIntermissionTestMode(
  source: IntermissionNextOutputPayloadV1
): IntermissionNextOutputPayloadV1 {
  const state = getIntermissionTestModeState()
  if (!state.enabled) return source
  const director = testDirector(state)
  const data = createIntermissionTestPageData(state.stage, state.revision, state.stageStartedAtMs)
  const pageId = state.stage === 'hidden' ? null : state.stage === 'bp' ? 'bp' : state.stage
  const totalDurationMs =
    state.stage === 'hidden'
      ? 0
      : state.stage === 'bp'
        ? BP_BROADCAST_TIMELINE_DURATION_MS
        : BROADCAST_MAX_TOTAL_DURATION_MS
  const contentStartOffsetMs = intermissionTestContentStartOffsetMs(source.layout, state.stage)
  const remainingDurationMs = Math.max(0, totalDurationMs - contentStartOffsetMs)
  return {
    ...source,
    playRevision: state.revision,
    director,
    visible: state.stage !== 'hidden' && data !== null,
    pageData: data,
    background: testBackground(source.background, source, state),
    transition: {
      version: 1,
      pageId,
      playRevision: state.revision,
      startedAtMs: pageId === null ? null : state.stageStartedAtMs,
      exitStartedAtMs: null
    },
    mapMedia: createIntermissionTestMapMedia(
      state.stage,
      state.stageStartedAtMs,
      source.serverNowMs
    ),
    activeSegment: testActiveSegment(state.stage, contentStartOffsetMs, remainingDurationMs),
    utilityReplay: null,
    clock: {
      status: state.stage === 'hidden' ? 'idle' : 'playing',
      totalDurationMs,
      deadlineAtMs: state.stage === 'hidden' ? null : state.stageStartedAtMs + remainingDurationMs,
      pausedRemainingMs: null
    },
    issues: []
  }
}
