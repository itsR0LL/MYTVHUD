import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BP_BROADCAST_TIMELINE_DURATION_MS,
  createDefaultBPState,
  type BPPayload,
  type BPSequenceItem
} from '../../src/shared/bp'
import {
  createDefaultBroadcastDirectorRuntime,
  resolveBroadcastDirectorAdvance,
  type BroadcastDirectorSnapshot,
  type BroadcastDirectorStage
} from '../../src/shared/broadcast-director'
import {
  BROADCAST_MAX_TOTAL_DURATION_MS,
  type BroadcastProgram,
  type BroadcastRuntimeV1
} from '../../src/shared/broadcast-flow'
import { createDefaultGlobalBackgroundState } from '../../src/shared/intermission-background-next/background-state'
import { createDefaultIntermissionNextLayoutState } from '../../src/shared/intermission-next'
import { buildIntermissionNextOutputPayload } from '../../src/shared/intermission-output-next/builder'
import { createHiddenIntermissionNextTransitionState } from '../../src/shared/intermission-transition-next/transition-state'
import { createEmptyMapUtilityReplay } from '../../src/shared/utility-replay'

const TRANSITION_TIMINGS = {
  brandCoverMs: 500,
  backgroundRevealMs: 400,
  pageEnterMs: 600,
  pageExitMs: 450,
  brandExitMs: 350
}

const BP_PAYLOAD = { state: createDefaultBPState(), match: null }
const BP_SEQUENCE: BPSequenceItem[] = [
  { map: 'de_mirage', action: 'ban', actor: 'team_a', startingSide: '' },
  { map: 'de_nuke', action: 'ban', actor: 'team_b', startingSide: '' },
  { map: 'de_ancient', action: 'pick', actor: 'team_a', startingSide: 'CT' },
  { map: 'de_anubis', action: 'pick', actor: 'team_b', startingSide: 'T' },
  { map: 'de_overpass', action: 'ban', actor: 'team_a', startingSide: '' },
  { map: 'de_vertigo', action: 'ban', actor: 'team_b', startingSide: '' },
  { map: 'de_dust2', action: 'decider', actor: '', startingSide: '' }
]

function bpPayload(playbackStarted: boolean, playbackStartedAtMs: number | null): BPPayload {
  return {
    state: {
      ...createDefaultBPState(),
      sequence: BP_SEQUENCE.map((item) => ({ ...item })),
      visible: true,
      playbackStarted,
      playbackStartedAtMs,
      revision: 5
    },
    match: {
      id: 'bp-match',
      type: 'BO3',
      team_a: { id: 'a', name: '战队一', name_ingame: 'Team A' },
      team_b: { id: 'b', name: '战队二', name_ingame: 'Team B' }
    }
  }
}

function director(stage: BroadcastDirectorStage): BroadcastDirectorSnapshot {
  const context = {
    bpReady: false,
    preparedProgramId: null,
    preparedProgramType: null
  }
  const runtime = {
    ...createDefaultBroadcastDirectorRuntime(1_000),
    stage,
    hiddenReason: stage === 'hidden' ? ('idle' as const) : ('idle' as const),
    revision: 3
  }
  return {
    runtime,
    next: resolveBroadcastDirectorAdvance(runtime, context),
    ...context,
    bpPlaybackStarted: false,
    jumpTargets: []
  }
}

function standbyProgram(): BroadcastProgram {
  return {
    id: 'program-1',
    type: 'standby',
    createdAtMs: 1,
    sourceMatchId: 'match-1',
    sourceMapId: '',
    snapshot: {
      match: {
        id: 'match-1',
        type: 'BO1',
        team_a: { id: 'a', name: '战队一', name_ingame: 'Team A' },
        team_b: { id: 'b', name: '战队二', name_ingame: 'Team B' },
        bpSequence: [],
        maps: []
      },
      seriesScore: { teamA: 1, teamB: 0 },
      scoreOverride: { enabled: false, teamA: 0, teamB: 0 },
      lastFinishedMapId: '',
      nextMapId: '',
      seriesEnded: true,
      mapSnapshots: {},
      nextMatch: null
    },
    issues: [],
    segments: []
  }
}

function runtime(onAirProgram: BroadcastProgram | null): BroadcastRuntimeV1 {
  return {
    version: 1,
    visible: true,
    playbackStatus: 'playing',
    preparedProgram: null,
    onAirProgram,
    activeSegmentIndex: 0,
    totalDurationMs: 300_000,
    startedAtMs: 1_000,
    deadlineAtMs: 301_000,
    pausedRemainingMs: null,
    playRevision: 3,
    revision: 8
  }
}

test('OBS输出只读取冻结的在播节目', () => {
  const payload = buildIntermissionNextOutputPayload({
    runtime: runtime(standbyProgram()),
    director: director('standby'),
    bpPayload: BP_PAYLOAD,
    payloadRevision: 9,
    serverNowMs: 10_000,
    layout: createDefaultIntermissionNextLayoutState(),
    background: createDefaultGlobalBackgroundState(),
    backgroundAssets: [],
    transition: createHiddenIntermissionNextTransitionState(),
    transitionTimings: TRANSITION_TIMINGS,
    scoreTimelines: {},
    highlightRule: 'none'
  })

  assert.equal(payload.visible, true)
  assert.equal(payload.pageData?.page, 'standby')
  assert.equal(payload.playRevision, 3)
  assert.equal(payload.clock.totalDurationMs, BROADCAST_MAX_TOTAL_DURATION_MS)
  assert.equal(payload.clock.deadlineAtMs, 1_000 + BROADCAST_MAX_TOTAL_DURATION_MS)
})

test('缺少在播节目时保持透明而不使用准备节目', () => {
  const currentRuntime = runtime(null)
  currentRuntime.preparedProgram = standbyProgram()
  const payload = buildIntermissionNextOutputPayload({
    runtime: currentRuntime,
    director: director('standby'),
    bpPayload: BP_PAYLOAD,
    payloadRevision: 1,
    serverNowMs: 2_000,
    layout: createDefaultIntermissionNextLayoutState(),
    background: createDefaultGlobalBackgroundState(),
    backgroundAssets: [],
    transition: createHiddenIntermissionNextTransitionState(),
    transitionTimings: TRANSITION_TIMINGS,
    scoreTimelines: {},
    highlightRule: 'none'
  })

  assert.equal(payload.visible, false)
  assert.equal(payload.pageData, null)
})

test('在播节目缺少完整页面数据时明确降级并报告', () => {
  const invalidProgram = standbyProgram()
  invalidProgram.type = 'map_break'
  invalidProgram.sourceMapId = 'de_mirage'
  const payload = buildIntermissionNextOutputPayload({
    runtime: runtime(invalidProgram),
    director: director('map_break'),
    bpPayload: BP_PAYLOAD,
    payloadRevision: 1,
    serverNowMs: 2_000,
    layout: createDefaultIntermissionNextLayoutState(),
    background: createDefaultGlobalBackgroundState(),
    backgroundAssets: [],
    transition: createHiddenIntermissionNextTransitionState(),
    transitionTimings: TRANSITION_TIMINGS,
    scoreTimelines: {},
    highlightRule: 'none'
  })

  assert.equal(payload.visible, false)
  assert.equal(payload.pageData, null)
  assert.equal(payload.issues.includes('当前在播节目缺少完整页面数据'), true)
})

test('无效转场时长降级为直接显示而不猜测动画时间', () => {
  const payload = buildIntermissionNextOutputPayload({
    runtime: runtime(standbyProgram()),
    director: director('standby'),
    bpPayload: BP_PAYLOAD,
    payloadRevision: 1,
    serverNowMs: 2_000,
    layout: createDefaultIntermissionNextLayoutState(),
    background: createDefaultGlobalBackgroundState(),
    backgroundAssets: [],
    transition: createHiddenIntermissionNextTransitionState(),
    transitionTimings: { ...TRANSITION_TIMINGS, pageEnterMs: -1 },
    scoreTimelines: {},
    highlightRule: 'none'
  })

  assert.deepEqual(payload.transitionTimings, {
    brandCoverMs: 0,
    backgroundRevealMs: 0,
    pageEnterMs: 0,
    pageExitMs: 0,
    brandExitMs: 0
  })
  assert.equal(payload.issues.includes('页面转场时长配置无效，已直接显示最终状态'), true)
})

test('道具回放段只输出当前地图的一份完整回放和最小段信息', () => {
  const program = standbyProgram()
  program.type = 'series_end'
  program.sourceMapId = 'de_mirage'
  program.segments = [
    {
      id: 'series_end-2-map_utility_replay',
      contentType: 'map_utility_replay',
      startOffsetMs: 120_000,
      endOffsetMs: 240_000,
      durationMs: 120_000,
      components: {
        teamScore: false,
        mapSeries: false,
        timerNotice: false,
        eventLogo: false
      }
    }
  ]
  const replay = createEmptyMapUtilityReplay('de_mirage')
  replay.expectedRoundCount = 1
  replay.rounds = [
    {
      roundIndex: 1,
      teamCTId: 'a',
      teamTId: 'b',
      unassignedGrenadeCount: 0
    }
  ]
  const payload = buildIntermissionNextOutputPayload({
    runtime: runtime(program),
    director: director('series_end'),
    bpPayload: BP_PAYLOAD,
    payloadRevision: 10,
    serverNowMs: 120_000,
    layout: createDefaultIntermissionNextLayoutState(),
    background: createDefaultGlobalBackgroundState(),
    backgroundAssets: [],
    transition: createHiddenIntermissionNextTransitionState(),
    transitionTimings: TRANSITION_TIMINGS,
    scoreTimelines: {},
    utilityReplay: replay,
    highlightRule: 'none'
  })

  assert.deepEqual(payload.activeSegment, {
    id: 'series_end-2-map_utility_replay',
    contentType: 'map_utility_replay',
    startOffsetMs: 120_000,
    durationMs: 120_000
  })
  assert.equal(payload.utilityReplay?.mapId, 'de_mirage')
  assert.equal(payload.utilityReplay?.complete, true)
  assert.equal(JSON.stringify(payload).includes('onAirProgram'), false)
})

test('系列赛结束的待机收尾段切换为新版赛事待机页面', () => {
  const program = standbyProgram()
  program.type = 'series_end'
  program.segments = [
    {
      id: 'series_end-3-standby',
      contentType: 'standby',
      startOffsetMs: 300_000,
      endOffsetMs: 300_000,
      durationMs: 0,
      components: {
        teamScore: true,
        mapSeries: true,
        timerNotice: true,
        eventLogo: true
      }
    }
  ]
  const currentRuntime = runtime(program)
  currentRuntime.playbackStatus = 'finished'
  currentRuntime.deadlineAtMs = null

  const payload = buildIntermissionNextOutputPayload({
    runtime: currentRuntime,
    director: director('standby'),
    bpPayload: BP_PAYLOAD,
    payloadRevision: 11,
    serverNowMs: 301_000,
    layout: createDefaultIntermissionNextLayoutState(),
    background: createDefaultGlobalBackgroundState(),
    backgroundAssets: [],
    transition: createHiddenIntermissionNextTransitionState(),
    transitionTimings: TRANSITION_TIMINGS,
    scoreTimelines: {},
    highlightRule: 'none'
  })

  assert.equal(payload.pageData?.page, 'standby')
  assert.equal(payload.activeSegment?.contentType, 'standby')
})

test('BP 页面在播放前暂停时间轴，播放后从导播点击时刻开始计时', () => {
  const beforePlayback = buildIntermissionNextOutputPayload({
    runtime: runtime(null),
    director: director('bp'),
    bpPayload: bpPayload(false, null),
    payloadRevision: 12,
    serverNowMs: 12_000,
    layout: createDefaultIntermissionNextLayoutState(),
    background: createDefaultGlobalBackgroundState(),
    backgroundAssets: [],
    transition: createHiddenIntermissionNextTransitionState(),
    transitionTimings: TRANSITION_TIMINGS,
    scoreTimelines: {},
    highlightRule: 'none'
  })

  assert.equal(beforePlayback.visible, true)
  assert.equal(beforePlayback.pageData?.page, 'bp')
  assert.deepEqual(beforePlayback.clock, {
    status: 'paused',
    totalDurationMs: BP_BROADCAST_TIMELINE_DURATION_MS,
    deadlineAtMs: null,
    pausedRemainingMs: BP_BROADCAST_TIMELINE_DURATION_MS
  })

  const startedAtMs = 10_000
  const afterPlayback = buildIntermissionNextOutputPayload({
    runtime: runtime(null),
    director: director('bp'),
    bpPayload: bpPayload(true, startedAtMs),
    payloadRevision: 13,
    serverNowMs: 12_000,
    layout: createDefaultIntermissionNextLayoutState(),
    background: createDefaultGlobalBackgroundState(),
    backgroundAssets: [],
    transition: createHiddenIntermissionNextTransitionState(),
    transitionTimings: TRANSITION_TIMINGS,
    scoreTimelines: {},
    highlightRule: 'none'
  })

  assert.equal(afterPlayback.pageData?.page, 'bp')
  assert.equal(afterPlayback.clock.status, 'playing')
  assert.equal(afterPlayback.clock.deadlineAtMs, startedAtMs + BP_BROADCAST_TIMELINE_DURATION_MS)
  assert.equal(afterPlayback.clock.pausedRemainingMs, BP_BROADCAST_TIMELINE_DURATION_MS - 2_000)
})
