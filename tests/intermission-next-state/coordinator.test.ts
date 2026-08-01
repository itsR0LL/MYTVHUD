import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultBPState } from '../../src/shared/bp'
import {
  createDefaultBroadcastDirectorRuntime,
  resolveBroadcastDirectorAdvance,
  type BroadcastDirectorSnapshot,
  type BroadcastDirectorStage
} from '../../src/shared/broadcast-director'
import {
  BROADCAST_FLOW_TEMPLATES_KEY,
  createDefaultBroadcastRuntime,
  type BroadcastProgram,
  type BroadcastRuntimeV1
} from '../../src/shared/broadcast-flow'
import {
  createUnconfiguredBroadcastPageFlowTemplates,
  type BroadcastPageFlowTemplatesV3
} from '../../src/shared/broadcast-page-flow-next/page-flow'
import type { GlobalBackgroundAssetV1 } from '../../src/shared/intermission-background-next/assets'
import { globalBackgroundPositionAt } from '../../src/shared/intermission-background-next/background-state'
import {
  addIntermissionNextComponent,
  createBundledBroadcastPageFlowTemplates,
  createBundledIntermissionNextLayoutState,
  createBundledIntermissionPageSettings,
  createDefaultIntermissionNextLayoutState
} from '../../src/shared/intermission-next'
import type { IntermissionNextMapMediaOutputFrame } from '../../src/shared/intermission-output-next/map-media'
import type { IntermissionNextOutputPayloadV1 } from '../../src/shared/intermission-output-next/output'
import { type IntermissionNextTransitionTimings } from '../../src/shared/intermission-transition-next/transition-state'
import {
  IntermissionNextStateCoordinator,
  type IntermissionNextKeyValueStoreAdapter,
  type IntermissionNextStateCoordinatorOptions
} from '../../src/main/intermission-next/state/coordinator'
import {
  INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY,
  INTERMISSION_NEXT_PAGE_FLOW_TEMPLATES_SETTINGS_KEY,
  INTERMISSION_NEXT_RUNTIME_STATE_KEY
} from '../../src/main/intermission-next/state/storage-keys'

const TRANSITION_TIMINGS: IntermissionNextTransitionTimings = {
  brandCoverMs: 500,
  backgroundRevealMs: 400,
  pageEnterMs: 600,
  pageExitMs: 450,
  brandExitMs: 350
}

const BACKGROUND_ASSETS: GlobalBackgroundAssetV1[] = [
  backgroundAsset('background-1'),
  backgroundAsset('background-2'),
  backgroundAsset('background-3')
]

class MemoryStore implements IntermissionNextKeyValueStoreAdapter {
  readonly values = new Map<string, unknown>()
  readonly writes: Array<{ key: string; value: unknown }> = []

  constructor(initialValues: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initialValues)) {
      this.values.set(key, structuredClone(value))
    }
  }

  async get(key: string): Promise<unknown> {
    const value = this.values.get(key)
    return value === undefined ? undefined : structuredClone(value)
  }

  async set(key: string, value: unknown): Promise<void> {
    const copy = structuredClone(value)
    this.values.set(key, copy)
    this.writes.push({ key, value: copy })
  }
}

test('新安装仅写入内置页面配置且保留精确页面顺序', () => {
  const bundledSettings = createBundledIntermissionPageSettings()

  assert.deepEqual(Object.keys(bundledSettings).sort(), [
    'broadcastPageFlowTemplatesV3',
    'intermissionNextLayoutV2'
  ])
  assert.deepEqual(bundledSettings.broadcastPageFlowTemplatesV3.order, [
    'map_break',
    'series_end',
    'standby'
  ])
  assert.deepEqual(bundledSettings.intermissionNextLayoutV2.pages.map_break.transitions, [
    { id: 'transition-1', startOffsetMs: 120180, durationMs: 1400 },
    { id: 'transition-2', startOffsetMs: 420000, durationMs: 1400 }
  ])
})

function backgroundAsset(id: string): GlobalBackgroundAssetV1 {
  return {
    version: 1,
    id,
    displayName: id,
    streamUrl: `/intermission-next/background/${id}`,
    durationMs: 30_000,
    width: 1920,
    height: 1080,
    frameRate: 60,
    videoCodec: 'h264',
    audioCodec: null,
    audioEnabled: false,
    seamlessLoop: true
  }
}

function standbyProgram(matchId: string): BroadcastProgram {
  return {
    id: `program-${matchId}`,
    type: 'standby',
    createdAtMs: 1,
    sourceMatchId: matchId,
    sourceMapId: '',
    snapshot: {
      match: {
        id: matchId,
        type: 'BO1',
        team_a: { id: `${matchId}-a`, name: `${matchId} A`, name_ingame: 'Team A' },
        team_b: { id: `${matchId}-b`, name: `${matchId} B`, name_ingame: 'Team B' },
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

function playingRuntime(
  onAirProgram: BroadcastProgram,
  options: {
    preparedProgram?: BroadcastProgram | null
    playRevision?: number
    revision?: number
  } = {}
): BroadcastRuntimeV1 {
  return {
    version: 1,
    visible: true,
    playbackStatus: 'playing',
    preparedProgram: options.preparedProgram ?? null,
    onAirProgram,
    activeSegmentIndex: 0,
    totalDurationMs: 300_000,
    startedAtMs: 1_000,
    deadlineAtMs: 301_000,
    pausedRemainingMs: null,
    playRevision: options.playRevision ?? 3,
    revision: options.revision ?? 8
  }
}

function directorSnapshot(
  stage: BroadcastDirectorStage,
  revision: number,
  startedAtMs: number
): BroadcastDirectorSnapshot {
  const context = {
    bpReady: false,
    preparedProgramId: null,
    preparedProgramType: null
  }
  const runtime = {
    ...createDefaultBroadcastDirectorRuntime(startedAtMs),
    stage,
    revision
  }
  return {
    runtime,
    next: resolveBroadcastDirectorAdvance(runtime, context),
    ...context,
    bpPlaybackStarted: false,
    jumpTargets: []
  }
}

interface Harness {
  coordinator: IntermissionNextStateCoordinator
  settings: MemoryStore
  additional: MemoryStore
  published: IntermissionNextOutputPayloadV1[]
  scoreProgramIds: Array<string | null>
  mapMediaRequests: Array<{ sourceMatchId: string | null; nowMs: number; frozen: boolean }>
  runtime: { value: BroadcastRuntimeV1 }
  director: { value: BroadcastDirectorSnapshot }
  clock: { value: number }
}

function createHarness(
  overrides: {
    settings?: MemoryStore
    additional?: MemoryStore
    runtime?: BroadcastRuntimeV1
    clockMs?: number
    configured?: boolean
    mapMedia?: readonly IntermissionNextMapMediaOutputFrame[]
    backgroundAssets?: unknown
    omitBackgroundAssetsProvider?: boolean
    director?: BroadcastDirectorSnapshot
  } = {}
): Harness {
  const settings = overrides.settings ?? new MemoryStore()
  const additional = overrides.additional ?? new MemoryStore()
  const published: IntermissionNextOutputPayloadV1[] = []
  const scoreProgramIds: Array<string | null> = []
  const mapMediaRequests: Array<{
    sourceMatchId: string | null
    nowMs: number
    frozen: boolean
  }> = []
  const runtime = { value: overrides.runtime ?? createDefaultBroadcastRuntime() }
  const clock = { value: overrides.clockMs ?? 1_000 }
  const defaultStage = runtime.value.onAirProgram?.type ?? 'hidden'
  const director = {
    value:
      overrides.director ??
      directorSnapshot(
        defaultStage,
        runtime.value.playRevision,
        runtime.value.startedAtMs ?? clock.value
      )
  }
  const configured = overrides.configured ?? true
  const options: IntermissionNextStateCoordinatorOptions = {
    settings,
    additional,
    runtimeProvider: {
      async getRuntime() {
        return structuredClone(runtime.value)
      }
    },
    directorProvider: {
      async getDirector() {
        return structuredClone(director.value)
      }
    },
    bpProvider: {
      async getBPPayload() {
        return { state: createDefaultBPState(), match: null }
      }
    },
    scoreTimelinesProvider: {
      async getScoreTimelines(onAirProgram) {
        scoreProgramIds.push(onAirProgram === null ? null : String(onAirProgram.sourceMatchId))
        return {}
      }
    },
    mapMediaProvider: {
      async getMapMedia(request) {
        mapMediaRequests.push({
          sourceMatchId:
            request.onAirProgram === null ? null : String(request.onAirProgram.sourceMatchId),
          nowMs: request.nowMs,
          frozen:
            request.onAirProgram === null ||
            (Object.isFrozen(request.onAirProgram) &&
              Object.isFrozen(request.onAirProgram.snapshot))
        })
        return structuredClone(overrides.mapMedia ?? [])
      }
    },
    publisher: {
      publish(payload) {
        published.push(structuredClone(payload))
      }
    },
    clock: {
      nowMs() {
        return clock.value
      }
    }
  }
  if (configured) {
    options.highlightRule = 'none'
    options.transitionTimings = TRANSITION_TIMINGS
    if (!overrides.omitBackgroundAssetsProvider) {
      options.backgroundAssetsProvider = {
        async getBackgroundAssets() {
          return structuredClone(overrides.backgroundAssets ?? BACKGROUND_ASSETS)
        }
      }
    }
  }
  return {
    coordinator: new IntermissionNextStateCoordinator(options),
    settings,
    additional,
    published,
    scoreProgramIds,
    mapMediaRequests,
    runtime,
    director,
    clock
  }
}

test('初始化新布局并迁移旧流程总时长到V3键', async () => {
  const legacyTemplates = {
    map_break: {
      defaultTotalDurationMs: 300_000,
      segments: [
        {
          contentType: 'map_report',
          enabled: true,
          minimumDurationMs: 0,
          preferredDurationMs: 0,
          maximumDurationMs: 0,
          weight: 1
        }
      ]
    }
  }
  const settings = new MemoryStore({
    [BROADCAST_FLOW_TEMPLATES_KEY]: legacyTemplates
  })
  const harness = createHarness({ settings })

  const result = await harness.coordinator.initialize()

  assert.equal(result.status, 'ready')
  assert.deepEqual(
    settings.values.get(INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY),
    createBundledIntermissionNextLayoutState()
  )
  const migratedTemplates = settings.values.get(
    INTERMISSION_NEXT_PAGE_FLOW_TEMPLATES_SETTINGS_KEY
  ) as BroadcastPageFlowTemplatesV3
  assert.equal(migratedTemplates.version, 3)
  assert.equal(migratedTemplates.templates.map_break.enabled, true)
  assert.equal(migratedTemplates.templates.map_break.defaultTotalDurationMs, 300_000)
  assert.ok(harness.additional.values.has(INTERMISSION_NEXT_RUNTIME_STATE_KEY))
})

test('缺少持久化页面配置时载入安装包内置布局与播放流程', async () => {
  const harness = createHarness()

  const result = await harness.coordinator.initialize()

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.snapshot.layout, createBundledIntermissionNextLayoutState())
  assert.deepEqual(result.snapshot.pageFlowTemplates, createBundledBroadcastPageFlowTemplates())
  assert.deepEqual(
    harness.settings.values.get(INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY),
    createBundledIntermissionNextLayoutState()
  )
  assert.deepEqual(
    harness.settings.values.get(INTERMISSION_NEXT_PAGE_FLOW_TEMPLATES_SETTINGS_KEY),
    createBundledBroadcastPageFlowTemplates()
  )
})

test('初始化优先迁移V2页面流程设置并写入V3键', async () => {
  const pageFlowV2 = createUnconfiguredBroadcastPageFlowTemplates()
  pageFlowV2.templates.map_break = {
    ...pageFlowV2.templates.map_break,
    enabled: true,
    defaultTotalDurationMs: 600_000
  }
  const settings = new MemoryStore({
    broadcastPageFlowTemplatesV2: { ...pageFlowV2, version: 2 }
  })
  const harness = createHarness({ settings })

  const result = await harness.coordinator.initialize()

  assert.equal(result.status, 'ready')
  const migratedTemplates = settings.values.get(
    INTERMISSION_NEXT_PAGE_FLOW_TEMPLATES_SETTINGS_KEY
  ) as BroadcastPageFlowTemplatesV3
  assert.equal(migratedTemplates.version, 3)
  assert.equal(migratedTemplates.templates.map_break.enabled, true)
  assert.equal(migratedTemplates.templates.map_break.defaultTotalDurationMs, 600_000)
})

test('缺少显式配置时返回未配置状态且不发布OBS输出', async () => {
  const harness = createHarness({ configured: false })

  const result = await harness.coordinator.initialize()

  assert.equal(result.status, 'unconfigured')
  if (result.status !== 'unconfigured') return
  assert.deepEqual(result.missing, ['highlightRule', 'transitionTimings', 'backgroundAssets'])
  assert.equal(result.issues.length, 3)
  assert.equal(harness.published.length, 0)
})

test('串行执行并发背景变更并按发布顺序递增修订', async () => {
  const harness = createHarness()
  await harness.coordinator.initialize()

  const selectPromise = harness.coordinator.selectBackground('background-1')
  const playPromise = harness.coordinator.playBackground()
  const [selected, playing] = await Promise.all([selectPromise, playPromise])

  assert.equal(selected.status, 'ready')
  assert.equal(playing.status, 'ready')
  if (playing.status !== 'ready') return
  assert.equal(playing.snapshot.persistedRuntime.background.activeAssetId, 'background-1')
  assert.equal(playing.snapshot.persistedRuntime.background.playbackStatus, 'playing')
  assert.deepEqual(
    harness.published.map((payload) => payload.payloadRevision),
    [1, 2, 3]
  )
})

test('管理端读取最新状态时不重复向 OBS 广播完整负载', async () => {
  const harness = createHarness()
  await harness.coordinator.initialize()
  assert.equal(harness.published.length, 1)

  const refreshed = await harness.coordinator.refreshRuntime(false)

  assert.equal(refreshed.status, 'ready')
  assert.equal(harness.published.length, 1)
})

test('OBS输出和比分时间线只读取onAirProgram而不泄露preparedProgram', async () => {
  const onAir = standbyProgram('on-air-match')
  const prepared = standbyProgram('prepared-match')
  const harness = createHarness({
    runtime: playingRuntime(onAir, { preparedProgram: prepared })
  })

  const result = await harness.coordinator.initialize()

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.equal(
    result.payload.pageData?.page === 'standby' ? result.payload.pageData.sourceMatchId : null,
    'on-air-match'
  )
  assert.deepEqual(harness.scoreProgramIds, ['on-air-match'])
  assert.deepEqual(harness.mapMediaRequests, [
    { sourceMatchId: 'on-air-match', nowMs: 1_000, frozen: true }
  ])
  assert.equal(JSON.stringify(result.payload).includes('prepared-match'), false)

  harness.runtime.value = {
    ...createDefaultBroadcastRuntime(),
    playbackStatus: 'ready',
    preparedProgram: prepared,
    revision: 9
  }
  const preparedOnly = await harness.coordinator.refreshRuntime()
  assert.equal(preparedOnly.status, 'ready')
  if (preparedOnly.status !== 'ready') return
  assert.equal(preparedOnly.payload.visible, false)
  assert.equal(preparedOnly.payload.pageData, null)
  assert.equal(JSON.stringify(preparedOnly.payload).includes('prepared-match'), false)
  assert.deepEqual(harness.scoreProgramIds, ['on-air-match', null])
  assert.deepEqual(harness.mapMediaRequests.at(-1), {
    sourceMatchId: null,
    nowMs: 1_000,
    frozen: true
  })
})

test('媒体provider数据进入输出且重连同一时刻结果稳定', async () => {
  const mediaFrame: IntermissionNextMapMediaOutputFrame = {
    mapId: 'de_mirage',
    purpose: 'hero',
    mediaRevision: 7,
    current: {
      url: '/intermission-next/assets/maps/de_mirage/current.jpg',
      fallbackUrl: '/intermission-next/assets/maps/de_mirage/fallback.jpg',
      width: 1920,
      height: 1080
    },
    preload: null,
    crossfadeProgress: 0,
    frameStartedAtMs: null,
    frameEndAtMs: null,
    crossfadeStartedAtMs: null,
    crossfadeDurationMs: 0
  }
  const program = standbyProgram('media-match')
  const settings = new MemoryStore()
  const additional = new MemoryStore()
  const first = createHarness({
    settings,
    additional,
    runtime: playingRuntime(program),
    clockMs: 4_000,
    mapMedia: [mediaFrame]
  })
  const firstResult = await first.coordinator.initialize()
  assert.equal(firstResult.status, 'ready')
  if (firstResult.status !== 'ready') return
  assert.deepEqual(firstResult.payload.mapMedia, [mediaFrame])

  const reconnected = createHarness({
    settings,
    additional,
    runtime: playingRuntime(program),
    clockMs: 4_000,
    mapMedia: [mediaFrame]
  })
  const reconnectResult = await reconnected.coordinator.initialize()
  assert.equal(reconnectResult.status, 'ready')
  if (reconnectResult.status !== 'ready') return
  assert.deepEqual(reconnectResult.payload.mapMedia, firstResult.payload.mapMedia)
  assert.deepEqual(reconnected.mapMediaRequests, [
    { sourceMatchId: 'media-match', nowMs: 4_000, frozen: true }
  ])
})

test('重连恢复同一播放修订的转场且普通修订不重播', async () => {
  const program = standbyProgram('match-1')
  const settings = new MemoryStore()
  const additional = new MemoryStore()
  const first = createHarness({
    settings,
    additional,
    runtime: playingRuntime(program, { playRevision: 3, revision: 8 }),
    clockMs: 1_000
  })

  const initialized = await first.coordinator.initialize()
  assert.equal(initialized.status, 'ready')
  if (initialized.status !== 'ready') return
  assert.equal(initialized.payload.transition.startedAtMs, 1_000)

  first.clock.value = 2_000
  first.runtime.value = playingRuntime(program, { playRevision: 3, revision: 9 })
  const ordinaryRevision = await first.coordinator.refreshRuntime()
  assert.equal(ordinaryRevision.status, 'ready')
  if (ordinaryRevision.status !== 'ready') return
  assert.equal(ordinaryRevision.payload.transition.startedAtMs, 1_000)

  const reconnected = createHarness({
    settings,
    additional,
    runtime: playingRuntime(program, { playRevision: 3, revision: 10 }),
    clockMs: 5_000
  })
  const resumed = await reconnected.coordinator.initialize()
  assert.equal(resumed.status, 'ready')
  if (resumed.status !== 'ready') return
  assert.equal(resumed.payload.transition.startedAtMs, 1_000)

  reconnected.clock.value = 6_000
  reconnected.runtime.value = playingRuntime(program, { playRevision: 4, revision: 11 })
  reconnected.director.value = directorSnapshot('standby', 4, 6_000)
  const replayed = await reconnected.coordinator.refreshRuntime()
  assert.equal(replayed.status, 'ready')
  if (replayed.status !== 'ready') return
  assert.equal(replayed.payload.transition.startedAtMs, 6_000)
})

test('隐藏背景不重置播放位置并支持预载和明确切换', async () => {
  const harness = createHarness({ clockMs: 1_000 })
  await harness.coordinator.initialize()
  await harness.coordinator.selectBackground('background-1')
  await harness.coordinator.playBackground()

  harness.clock.value = 4_000
  const hidden = await harness.coordinator.setBackgroundVisible(false)
  assert.equal(hidden.status, 'ready')
  if (hidden.status !== 'ready') return
  assert.equal(hidden.snapshot.persistedRuntime.background.playbackStatus, 'playing')
  assert.equal(
    globalBackgroundPositionAt(hidden.snapshot.persistedRuntime.background, 4_000),
    3_000
  )

  const preloaded = await harness.coordinator.preloadBackground('background-2')
  assert.equal(preloaded.status, 'ready')
  if (preloaded.status !== 'ready') return
  assert.equal(preloaded.snapshot.persistedRuntime.background.preloadAssetId, 'background-2')

  const switching = await harness.coordinator.switchBackground('background-2', 600)
  assert.equal(switching.status, 'ready')
  if (switching.status !== 'ready') return
  assert.deepEqual(switching.snapshot.persistedRuntime.background.transition, {
    fromAssetId: 'background-1',
    toAssetId: 'background-2',
    startedAtMs: 4_000,
    durationMs: 600
  })

  harness.clock.value = 4_600
  const completed = await harness.coordinator.refreshRuntime()
  assert.equal(completed.status, 'ready')
  if (completed.status !== 'ready') return
  assert.equal(completed.snapshot.persistedRuntime.background.activeAssetId, 'background-2')
  assert.equal(completed.snapshot.persistedRuntime.background.transition, null)
})

test('页面时间轴转场只触发一次并按背景素材顺序切换', async () => {
  const program = standbyProgram('timeline-transition')
  program.segments = [
    {
      id: 'standby-1-page_transition',
      contentType: 'page_transition',
      startOffsetMs: 0,
      endOffsetMs: 1_000,
      durationMs: 1_000,
      components: { teamScore: true, mapSeries: true, timerNotice: true, eventLogo: true }
    }
  ]
  const harness = createHarness({ runtime: playingRuntime(program), clockMs: 1_000 })

  const started = await harness.coordinator.initialize()
  assert.equal(started.status, 'ready')
  if (started.status !== 'ready') return
  assert.equal(started.snapshot.persistedRuntime.background.activeAssetId, 'background-1')
  assert.equal(started.snapshot.persistedRuntime.background.transition?.toAssetId, 'background-2')
  assert.equal(started.snapshot.persistedRuntime.background.switchRevision, 2)
  assert.equal(
    started.snapshot.persistedRuntime.processedTimelineTransitionKey,
    '3:standby-1-page_transition'
  )

  const repeated = await harness.coordinator.refreshRuntime()
  assert.equal(repeated.status, 'ready')
  if (repeated.status !== 'ready') return
  assert.equal(repeated.snapshot.persistedRuntime.background.switchRevision, 2)

  harness.clock.value = 2_000
  const completed = await harness.coordinator.refreshRuntime()
  assert.equal(completed.status, 'ready')
  if (completed.status !== 'ready') return
  assert.equal(completed.snapshot.persistedRuntime.background.activeAssetId, 'background-2')
  assert.equal(completed.snapshot.persistedRuntime.background.transition, null)
})

test('五页面布局与三类V3页面模板跨协调器实例持续保存', async () => {
  const settings = new MemoryStore()
  const additional = new MemoryStore()
  const first = createHarness({ settings, additional })
  await first.coordinator.initialize()

  const layout = addIntermissionNextComponent(
    createDefaultIntermissionNextLayoutState(),
    'standby',
    'eventBrand',
    0
  )
  const templates = createUnconfiguredBroadcastPageFlowTemplates()
  templates.order = ['standby', 'map_break', 'series_end']
  templates.templates.standby = {
    type: 'standby',
    pageId: 'standby',
    enabled: true,
    defaultTotalDurationMs: 60_000
  }
  await first.coordinator.setLayout(layout)
  await first.coordinator.setPageFlowTemplates(templates)

  const second = createHarness({ settings, additional })
  const restored = await second.coordinator.initialize()
  const previousPayload = first.published.at(-1)

  assert.equal(restored.status, 'ready')
  assert.deepEqual(restored.snapshot.layout, layout)
  assert.deepEqual(restored.snapshot.pageFlowTemplates, templates)
  assert.ok(previousPayload)
  assert.equal(
    restored.snapshot.persistedRuntime.payloadRevision,
    previousPayload.payloadRevision + 1
  )
})
