import type { BPMapId } from '../../../shared/bp'
import type { BPPayload } from '../../../shared/bp'
import type { BroadcastDirectorSnapshot } from '../../../shared/broadcast-director'
import {
  BROADCAST_FLOW_TEMPLATES_KEY,
  normalizeBroadcastFlowTemplates,
  normalizeBroadcastRuntime,
  type BroadcastProgram,
  type BroadcastRuntimeV1
} from '../../../shared/broadcast-flow'
import {
  createUnconfiguredBroadcastPageFlowTemplates,
  migrateBroadcastFlowTemplatesV1ToPageFlowV3,
  normalizeBroadcastPageFlowTemplates,
  type BroadcastPageFlowTemplatesV3
} from '../../../shared/broadcast-page-flow-next/page-flow'
import {
  normalizeGlobalBackgroundAssets,
  type GlobalBackgroundAssetV1
} from '../../../shared/intermission-background-next/assets'
import {
  beginGlobalBackgroundSwitch,
  completeGlobalBackgroundSwitch,
  createDefaultGlobalBackgroundState,
  initializeGlobalBackgroundSequence,
  nextGlobalBackgroundAssetId,
  normalizeGlobalBackgroundState,
  pauseGlobalBackground,
  playGlobalBackground,
  preloadGlobalBackground,
  selectInitialGlobalBackground,
  setGlobalBackgroundVisibility,
  type GlobalBackgroundStateV1
} from '../../../shared/intermission-background-next/background-state'
import {
  createDefaultIntermissionNextLayoutState,
  normalizeIntermissionNextLayoutState,
  type IntermissionNextLayoutState
} from '../../../shared/intermission-next'
import { buildIntermissionNextOutputPayload } from '../../../shared/intermission-output-next/builder'
import type { IntermissionNextMapMediaOutputFrame } from '../../../shared/intermission-output-next/map-media'
import type { IntermissionNextOutputPayloadV1 } from '../../../shared/intermission-output-next/output'
import {
  PLAYER_HIGHLIGHT_RULES,
  type PlayerHighlightRule
} from '../../../shared/intermission-page-data-next/view-model'
import type { MapScoreTimelineV1 } from '../../../shared/intermission-score-next/score-timeline'
import type { MapUtilityReplay } from '../../../shared/utility-replay'
import {
  createHiddenIntermissionNextTransitionState,
  normalizeIntermissionNextTransitionState,
  normalizeIntermissionNextTransitionTimings,
  startIntermissionNextTransition,
  type IntermissionNextTransitionStateV1,
  type IntermissionNextTransitionTimings
} from '../../../shared/intermission-transition-next/transition-state'
import {
  INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY,
  INTERMISSION_NEXT_PAGE_FLOW_TEMPLATES_SETTINGS_KEY,
  INTERMISSION_NEXT_RUNTIME_STATE_KEY
} from './storage-keys'

export const INTERMISSION_NEXT_CONFIGURATION_ITEMS = [
  'highlightRule',
  'transitionTimings',
  'backgroundAssets'
] as const

export type IntermissionNextConfigurationItem =
  (typeof INTERMISSION_NEXT_CONFIGURATION_ITEMS)[number]

export interface IntermissionNextKeyValueStoreAdapter {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
}

export interface IntermissionNextRuntimeProvider {
  getRuntime(): Promise<unknown>
}

export interface IntermissionNextDirectorProvider {
  getDirector(): Promise<BroadcastDirectorSnapshot>
}

export interface IntermissionNextBPProvider {
  getBPPayload(): Promise<BPPayload>
}

export interface IntermissionNextBackgroundAssetsProvider {
  getBackgroundAssets(): Promise<unknown>
}

export interface IntermissionNextScoreTimelinesProvider {
  getScoreTimelines(
    onAirProgram: BroadcastProgram | null
  ): Promise<Partial<Record<BPMapId, MapScoreTimelineV1>>>
}

export interface IntermissionNextMapMediaRequest {
  readonly onAirProgram: Readonly<BroadcastProgram> | null
  readonly nowMs: number
}

export interface IntermissionNextMapMediaProvider {
  getMapMedia(
    request: IntermissionNextMapMediaRequest
  ): Promise<readonly IntermissionNextMapMediaOutputFrame[]>
}

export interface IntermissionNextUtilityReplayProvider {
  getUtilityReplay(matchId: string | number, mapId: BPMapId): Promise<MapUtilityReplay | null>
}

export interface IntermissionNextPublisher {
  publish(payload: IntermissionNextOutputPayloadV1): Promise<void> | void
}

export interface IntermissionNextClock {
  nowMs(): number
}

export interface IntermissionNextStateCoordinatorOptions {
  settings: IntermissionNextKeyValueStoreAdapter
  additional: IntermissionNextKeyValueStoreAdapter
  runtimeProvider: IntermissionNextRuntimeProvider
  directorProvider: IntermissionNextDirectorProvider
  bpProvider: IntermissionNextBPProvider
  backgroundAssetsProvider?: IntermissionNextBackgroundAssetsProvider
  scoreTimelinesProvider: IntermissionNextScoreTimelinesProvider
  mapMediaProvider: IntermissionNextMapMediaProvider
  utilityReplayProvider?: IntermissionNextUtilityReplayProvider
  publisher: IntermissionNextPublisher
  clock: IntermissionNextClock
  highlightRule?: unknown
  transitionTimings?: unknown
}

export interface IntermissionNextPersistedRuntimeStateV1 {
  version: 1
  payloadRevision: number
  background: GlobalBackgroundStateV1
  transition: IntermissionNextTransitionStateV1
  processedDirectorTransitionKey: string | null
  processedTimelineTransitionKey: string | null
}

export interface IntermissionNextCoordinatorSnapshot {
  layout: IntermissionNextLayoutState
  pageFlowTemplates: BroadcastPageFlowTemplatesV3
  persistedRuntime: IntermissionNextPersistedRuntimeStateV1
}

export type IntermissionNextCoordinatorResult =
  | {
      status: 'unconfigured'
      missing: IntermissionNextConfigurationItem[]
      issues: string[]
      snapshot: IntermissionNextCoordinatorSnapshot
    }
  | {
      status: 'ready'
      payload: IntermissionNextOutputPayloadV1
      snapshot: IntermissionNextCoordinatorSnapshot
    }

interface ResolvedConfiguration {
  highlightRule: PlayerHighlightRule | null
  transitionTimings: IntermissionNextTransitionTimings | null
  backgroundAssets: GlobalBackgroundAssetV1[] | null
  missing: IntermissionNextConfigurationItem[]
  issues: string[]
}

class SerialMutationQueue {
  private tail: Promise<void> = Promise.resolve()

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation)
    this.tail = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

function normalizedNowMs(clock: IntermissionNextClock): number {
  const nowMs = clock.nowMs()
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error('clock.nowMs() 必须返回非负安全整数')
  }
  return nowMs
}

function cloneSnapshot(
  layout: IntermissionNextLayoutState,
  pageFlowTemplates: BroadcastPageFlowTemplatesV3,
  persistedRuntime: IntermissionNextPersistedRuntimeStateV1
): IntermissionNextCoordinatorSnapshot {
  return structuredClone({ layout, pageFlowTemplates, persistedRuntime })
}

function createDefaultPersistedRuntimeState(): IntermissionNextPersistedRuntimeStateV1 {
  return {
    version: 1,
    payloadRevision: 0,
    background: createDefaultGlobalBackgroundState(),
    transition: createHiddenIntermissionNextTransitionState(),
    processedDirectorTransitionKey: null,
    processedTimelineTransitionKey: null
  }
}

function normalizePersistedRuntimeState(
  value: unknown,
  backgroundAssetIds: readonly string[]
): IntermissionNextPersistedRuntimeStateV1 {
  const fallback = createDefaultPersistedRuntimeState()
  if (!isRecord(value) || value.version !== 1) return fallback
  return {
    version: 1,
    payloadRevision: nonNegativeInteger(value.payloadRevision),
    background: normalizeGlobalBackgroundState(value.background, backgroundAssetIds),
    transition: normalizeIntermissionNextTransitionState(value.transition),
    processedDirectorTransitionKey:
      typeof value.processedDirectorTransitionKey === 'string'
        ? value.processedDirectorTransitionKey
        : null,
    processedTimelineTransitionKey:
      typeof value.processedTimelineTransitionKey === 'string'
        ? value.processedTimelineTransitionKey
        : null
  }
}

function pageFlowTemplatesFromStoredValues(
  currentValue: unknown,
  legacyValue: unknown
): BroadcastPageFlowTemplatesV3 {
  if (currentValue !== undefined && currentValue !== null) {
    return normalizeBroadcastPageFlowTemplates(currentValue)
  }
  if (legacyValue !== undefined && legacyValue !== null) {
    return migrateBroadcastFlowTemplatesV1ToPageFlowV3(normalizeBroadcastFlowTemplates(legacyValue))
  }
  return createUnconfiguredBroadcastPageFlowTemplates()
}

function outputRuntime(runtime: BroadcastRuntimeV1): BroadcastRuntimeV1 {
  return {
    ...runtime,
    preparedProgram: null
  }
}

function deepFreeze<T>(value: T, visited = new WeakSet<object>()): Readonly<T> {
  if (typeof value !== 'object' || value === null || visited.has(value)) return value
  visited.add(value)
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue, visited)
  }
  return Object.freeze(value)
}

function frozenOnAirProgram(program: BroadcastProgram | null): Readonly<BroadcastProgram> | null {
  return program === null ? null : deepFreeze(structuredClone(program))
}

function runtimeElapsedAtMs(runtime: BroadcastRuntimeV1, nowMs: number): number {
  if (runtime.playbackStatus === 'playing' && runtime.deadlineAtMs !== null) {
    return Math.max(0, runtime.totalDurationMs - Math.max(0, runtime.deadlineAtMs - nowMs))
  }
  if (runtime.playbackStatus === 'paused' && runtime.pausedRemainingMs !== null) {
    return Math.max(0, runtime.totalDurationMs - runtime.pausedRemainingMs)
  }
  return runtime.playbackStatus === 'finished' ? runtime.totalDurationMs : 0
}

export class IntermissionNextStateCoordinator {
  private readonly queue = new SerialMutationQueue()
  private initialized = false
  private layout = createDefaultIntermissionNextLayoutState()
  private pageFlowTemplates = createUnconfiguredBroadcastPageFlowTemplates()
  private persistedRuntime = createDefaultPersistedRuntimeState()
  private configuration: ResolvedConfiguration = {
    highlightRule: null,
    transitionTimings: null,
    backgroundAssets: null,
    missing: [...INTERMISSION_NEXT_CONFIGURATION_ITEMS],
    issues: ['未配置选手高亮规则', '未配置页面转场时长', '未配置三段全局背景视频素材']
  }

  constructor(private readonly options: IntermissionNextStateCoordinatorOptions) {}

  initialize(): Promise<IntermissionNextCoordinatorResult> {
    return this.queue.enqueue(async () => {
      await this.loadState()
      return this.publishCurrent()
    })
  }

  refreshRuntime(): Promise<IntermissionNextCoordinatorResult> {
    return this.queue.enqueue(async () => {
      await this.loadState()
      return this.publishCurrent()
    })
  }

  setLayout(value: unknown): Promise<IntermissionNextCoordinatorResult> {
    return this.queue.enqueue(async () => {
      await this.loadState()
      this.layout = normalizeIntermissionNextLayoutState(value)
      await this.options.settings.set(INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY, this.layout)
      return this.publishCurrent()
    })
  }

  setPageFlowTemplates(value: unknown): Promise<IntermissionNextCoordinatorResult> {
    return this.queue.enqueue(async () => {
      await this.loadState()
      this.pageFlowTemplates = normalizeBroadcastPageFlowTemplates(value)
      await this.options.settings.set(
        INTERMISSION_NEXT_PAGE_FLOW_TEMPLATES_SETTINGS_KEY,
        this.pageFlowTemplates
      )
      return this.publishCurrent()
    })
  }

  selectBackground(assetId: string): Promise<IntermissionNextCoordinatorResult> {
    return this.changeBackground((state, assetIds) =>
      selectInitialGlobalBackground(state, assetId, assetIds)
    )
  }

  setBackgroundVisible(visible: boolean): Promise<IntermissionNextCoordinatorResult> {
    return this.changeBackground((state) => setGlobalBackgroundVisibility(state, visible))
  }

  playBackground(): Promise<IntermissionNextCoordinatorResult> {
    return this.changeBackground((state) =>
      playGlobalBackground(state, normalizedNowMs(this.options.clock))
    )
  }

  pauseBackground(): Promise<IntermissionNextCoordinatorResult> {
    return this.changeBackground((state) =>
      pauseGlobalBackground(state, normalizedNowMs(this.options.clock))
    )
  }

  preloadBackground(assetId: string): Promise<IntermissionNextCoordinatorResult> {
    return this.changeBackground((state, assetIds) =>
      preloadGlobalBackground(state, assetId, assetIds)
    )
  }

  switchBackground(
    assetId: string,
    durationMs: number
  ): Promise<IntermissionNextCoordinatorResult> {
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
      return Promise.reject(new Error('durationMs 必须由调用方传入正安全整数'))
    }
    return this.changeBackground((state, assetIds) =>
      beginGlobalBackgroundSwitch(
        state,
        assetId,
        normalizedNowMs(this.options.clock),
        durationMs,
        assetIds
      )
    )
  }

  private changeBackground(
    update: (state: GlobalBackgroundStateV1, assetIds: readonly string[]) => GlobalBackgroundStateV1
  ): Promise<IntermissionNextCoordinatorResult> {
    return this.queue.enqueue(async () => {
      await this.loadState()
      if (this.configuration.backgroundAssets !== null) {
        const assetIds = this.configuration.backgroundAssets.map((asset) => asset.id)
        this.persistedRuntime = {
          ...this.persistedRuntime,
          background: update(this.persistedRuntime.background, assetIds)
        }
        await this.persistRuntime()
      }
      return this.publishCurrent()
    })
  }

  private async loadState(): Promise<void> {
    if (this.initialized) return

    const currentLayout = await this.options.settings.get(INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY)
    this.layout = normalizeIntermissionNextLayoutState(currentLayout)

    const currentPageFlowTemplates = await this.options.settings.get(
      INTERMISSION_NEXT_PAGE_FLOW_TEMPLATES_SETTINGS_KEY
    )
    const legacyPageFlowTemplates =
      currentPageFlowTemplates === undefined || currentPageFlowTemplates === null
        ? await this.options.settings.get(BROADCAST_FLOW_TEMPLATES_KEY)
        : undefined
    this.pageFlowTemplates = pageFlowTemplatesFromStoredValues(
      currentPageFlowTemplates,
      legacyPageFlowTemplates
    )

    this.configuration = await this.resolveConfiguration()
    const backgroundAssetIds = this.configuration.backgroundAssets?.map((asset) => asset.id) ?? []
    this.persistedRuntime = normalizePersistedRuntimeState(
      await this.options.additional.get(INTERMISSION_NEXT_RUNTIME_STATE_KEY),
      backgroundAssetIds
    )

    await this.options.settings.set(INTERMISSION_NEXT_LAYOUT_SETTINGS_KEY, this.layout)
    await this.options.settings.set(
      INTERMISSION_NEXT_PAGE_FLOW_TEMPLATES_SETTINGS_KEY,
      this.pageFlowTemplates
    )
    await this.persistRuntime()
    this.initialized = true
  }

  private async resolveConfiguration(): Promise<ResolvedConfiguration> {
    const missing: IntermissionNextConfigurationItem[] = []
    const issues: string[] = []
    const highlightRule =
      typeof this.options.highlightRule === 'string' &&
      PLAYER_HIGHLIGHT_RULES.includes(this.options.highlightRule as PlayerHighlightRule)
        ? (this.options.highlightRule as PlayerHighlightRule)
        : null
    if (highlightRule === null) {
      missing.push('highlightRule')
      issues.push('未配置选手高亮规则')
    }

    const transitionTimings = normalizeIntermissionNextTransitionTimings(
      this.options.transitionTimings
    )
    if (transitionTimings === null) {
      missing.push('transitionTimings')
      issues.push('未配置页面转场时长')
    }

    let backgroundAssets: GlobalBackgroundAssetV1[] | null = null
    if (this.options.backgroundAssetsProvider) {
      const value = await this.options.backgroundAssetsProvider.getBackgroundAssets()
      backgroundAssets =
        Array.isArray(value) && value.length === 0 ? [] : normalizeGlobalBackgroundAssets(value)
    }
    if (backgroundAssets === null) {
      missing.push('backgroundAssets')
      issues.push('未配置三段全局背景视频素材')
    }

    return {
      highlightRule,
      transitionTimings,
      backgroundAssets,
      missing,
      issues
    }
  }

  private unconfiguredResult(): IntermissionNextCoordinatorResult {
    return {
      status: 'unconfigured',
      missing: [...this.configuration.missing],
      issues: [...this.configuration.issues],
      snapshot: cloneSnapshot(this.layout, this.pageFlowTemplates, this.persistedRuntime)
    }
  }

  private async publishCurrent(): Promise<IntermissionNextCoordinatorResult> {
    if (
      this.configuration.highlightRule === null ||
      this.configuration.transitionTimings === null ||
      this.configuration.backgroundAssets === null
    ) {
      return this.unconfiguredResult()
    }

    const nowMs = normalizedNowMs(this.options.clock)
    const [runtimeValue, director, bpPayload] = await Promise.all([
      this.options.runtimeProvider.getRuntime(),
      this.options.directorProvider.getDirector(),
      this.options.bpProvider.getBPPayload()
    ])
    const runtime = normalizeBroadcastRuntime(runtimeValue)
    const onAirProgram = runtime.onAirProgram
    const programStage =
      director.runtime.stage === 'map_break' ||
      director.runtime.stage === 'series_end' ||
      director.runtime.stage === 'standby'
    const activeSegment = programStage
      ? (onAirProgram?.segments[runtime.activeSegmentIndex] ?? null)
      : null
    const backgroundAssetIds = this.configuration.backgroundAssets.map((asset) => asset.id)
    let currentBackground = initializeGlobalBackgroundSequence(
      completeGlobalBackgroundSwitch(this.persistedRuntime.background, nowMs),
      backgroundAssetIds,
      nowMs
    )
    let processedDirectorTransitionKey = this.persistedRuntime.processedDirectorTransitionKey
    let processedTimelineTransitionKey = this.persistedRuntime.processedTimelineTransitionKey
    if (director.runtime.stage !== 'hidden') {
      const directorTransitionKey = `director:${director.runtime.revision}`
      if (processedDirectorTransitionKey !== directorTransitionKey) {
        if (processedDirectorTransitionKey !== null) {
          const nextAssetId = nextGlobalBackgroundAssetId(currentBackground, backgroundAssetIds)
          if (nextAssetId !== null) {
            currentBackground = beginGlobalBackgroundSwitch(
              currentBackground,
              nextAssetId,
              director.runtime.stageStartedAtMs,
              1_000,
              backgroundAssetIds
            )
          }
        }
        processedDirectorTransitionKey = directorTransitionKey
      }
    }
    if (activeSegment?.contentType === 'page_transition') {
      const transitionKey = `${runtime.playRevision}:${activeSegment.id}`
      if (processedTimelineTransitionKey !== transitionKey) {
        const nextAssetId = nextGlobalBackgroundAssetId(currentBackground, backgroundAssetIds)
        if (nextAssetId !== null) {
          const segmentElapsedMs = Math.min(
            activeSegment.durationMs,
            Math.max(0, runtimeElapsedAtMs(runtime, nowMs) - activeSegment.startOffsetMs)
          )
          currentBackground = beginGlobalBackgroundSwitch(
            currentBackground,
            nextAssetId,
            Math.max(0, nowMs - segmentElapsedMs),
            activeSegment.durationMs,
            backgroundAssetIds
          )
        }
        processedTimelineTransitionKey = transitionKey
      }
    }
    let transition: IntermissionNextTransitionStateV1
    const visualPageId =
      director.runtime.stage === 'hidden'
        ? null
        : director.runtime.stage === 'bp'
          ? 'bp'
          : director.runtime.stage
    if (visualPageId === null) {
      transition = {
        ...createHiddenIntermissionNextTransitionState(),
        playRevision: director.runtime.revision
      }
    } else {
      transition = startIntermissionNextTransition(
        this.persistedRuntime.transition,
        visualPageId,
        director.runtime.revision,
        director.runtime.stageStartedAtMs
      )
      if (transition.exitStartedAtMs !== null) {
        transition = {
          ...transition,
          exitStartedAtMs: null
        }
      }
    }
    const payloadRevision = this.persistedRuntime.payloadRevision + 1
    this.persistedRuntime = {
      version: 1,
      payloadRevision,
      background: currentBackground,
      transition,
      processedDirectorTransitionKey,
      processedTimelineTransitionKey
    }
    const scoreTimelines = await this.options.scoreTimelinesProvider.getScoreTimelines(onAirProgram)
    const mapMedia = await this.options.mapMediaProvider.getMapMedia({
      onAirProgram: frozenOnAirProgram(onAirProgram),
      nowMs
    })
    const utilityReplay =
      activeSegment?.contentType === 'map_utility_replay' &&
      onAirProgram !== null &&
      onAirProgram.sourceMapId !== '' &&
      this.options.utilityReplayProvider
        ? await this.options.utilityReplayProvider.getUtilityReplay(
            onAirProgram.sourceMatchId,
            onAirProgram.sourceMapId
          )
        : null
    const payload = buildIntermissionNextOutputPayload({
      runtime: outputRuntime(runtime),
      director,
      bpPayload,
      payloadRevision,
      serverNowMs: nowMs,
      layout: this.layout,
      background: currentBackground,
      backgroundAssets: this.configuration.backgroundAssets,
      transition,
      transitionTimings: this.configuration.transitionTimings,
      mapMedia,
      utilityReplay,
      scoreTimelines,
      highlightRule: this.configuration.highlightRule
    })

    await this.persistRuntime()
    await this.options.publisher.publish(payload)
    return {
      status: 'ready',
      payload,
      snapshot: cloneSnapshot(this.layout, this.pageFlowTemplates, this.persistedRuntime)
    }
  }

  private persistRuntime(): Promise<void> {
    return this.options.additional.set(INTERMISSION_NEXT_RUNTIME_STATE_KEY, this.persistedRuntime)
  }
}
