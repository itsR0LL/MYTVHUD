import { BP_BROADCAST_TIMELINE_DURATION_MS, type BPMapId, type BPPayload } from '../bp'
import type { BroadcastDirectorSnapshot } from '../broadcast-director'
import {
  BROADCAST_MAX_TOTAL_DURATION_MS,
  type BroadcastProgram,
  type BroadcastRuntimeV1
} from '../broadcast-flow'
import {
  normalizeGlobalBackgroundState,
  type GlobalBackgroundStateV1
} from '../intermission-background-next/background-state'
import {
  normalizeGlobalBackgroundAssets,
  type GlobalBackgroundAssetV1
} from '../intermission-background-next/assets'
import {
  normalizeIntermissionNextLayoutState,
  type IntermissionNextLayoutState
} from '../intermission-next'
import {
  createBPPageData,
  createMapBreakPageData,
  createSeriesEndPageData,
  createStandbyPageData,
  createWarmupPageData,
  type PlayerHighlightRule
} from '../intermission-page-data-next/view-model'
import type { MapScoreTimelineV1 } from '../intermission-score-next/score-timeline'
import {
  normalizeIntermissionNextTransitionTimings,
  normalizeIntermissionNextTransitionState,
  type IntermissionNextTransitionStateV1,
  type IntermissionNextTransitionTimings
} from '../intermission-transition-next/transition-state'
import type {
  IntermissionNextOutputPayloadV1,
  IntermissionNextPageData,
  IntermissionNextPlaybackClock
} from './output'
import type { IntermissionNextMapMediaOutputFrame } from './map-media'
import { normalizeMapUtilityReplay, type MapUtilityReplay } from '../utility-replay'

export interface IntermissionNextOutputBuildOptions {
  runtime: BroadcastRuntimeV1
  director: BroadcastDirectorSnapshot
  bpPayload: BPPayload
  payloadRevision: number
  serverNowMs: number
  layout: IntermissionNextLayoutState
  background: GlobalBackgroundStateV1
  backgroundAssets: GlobalBackgroundAssetV1[]
  transition: IntermissionNextTransitionStateV1
  transitionTimings: IntermissionNextTransitionTimings
  mapMedia?: readonly IntermissionNextMapMediaOutputFrame[]
  utilityReplay?: MapUtilityReplay | null
  scoreTimelines: Partial<Record<BPMapId, MapScoreTimelineV1>>
  highlightRule: PlayerHighlightRule
}

function nonNegativeInteger(value: number): number {
  return Number.isInteger(value) && value >= 0 ? value : 0
}

function playbackClock(
  runtime: BroadcastRuntimeV1,
  director: BroadcastDirectorSnapshot,
  bpPayload: BPPayload,
  nowMs: number
): IntermissionNextPlaybackClock {
  if (director.runtime.stage === 'warmup' || director.runtime.stage === 'standby') {
    return {
      status: 'playing',
      totalDurationMs: BROADCAST_MAX_TOTAL_DURATION_MS,
      deadlineAtMs: director.runtime.stageStartedAtMs + BROADCAST_MAX_TOTAL_DURATION_MS,
      pausedRemainingMs: Math.max(
        0,
        director.runtime.stageStartedAtMs + BROADCAST_MAX_TOTAL_DURATION_MS - nowMs
      )
    }
  }
  if (director.runtime.stage === 'bp') {
    const startedAtMs = bpPayload.state.playbackStartedAtMs
    if (!bpPayload.state.playbackStarted || startedAtMs === null) {
      return {
        status: 'paused',
        totalDurationMs: BP_BROADCAST_TIMELINE_DURATION_MS,
        deadlineAtMs: null,
        pausedRemainingMs: BP_BROADCAST_TIMELINE_DURATION_MS
      }
    }
    return {
      status: 'playing',
      totalDurationMs: BP_BROADCAST_TIMELINE_DURATION_MS,
      deadlineAtMs: startedAtMs + BP_BROADCAST_TIMELINE_DURATION_MS,
      pausedRemainingMs: Math.max(0, startedAtMs + BP_BROADCAST_TIMELINE_DURATION_MS - nowMs)
    }
  }
  return {
    status: runtime.playbackStatus,
    totalDurationMs: runtime.totalDurationMs,
    deadlineAtMs: runtime.deadlineAtMs,
    pausedRemainingMs: runtime.pausedRemainingMs
  }
}

function pageDataFromProgram(
  director: BroadcastDirectorSnapshot,
  bpPayload: BPPayload,
  program: BroadcastProgram | null,
  activeContentType: BroadcastProgram['segments'][number]['contentType'] | null,
  scoreTimelines: Partial<Record<BPMapId, MapScoreTimelineV1>>,
  highlightRule: PlayerHighlightRule
): IntermissionNextPageData | null {
  const stage = director.runtime.stage
  if (stage === 'hidden') return null
  if (stage === 'warmup') return createWarmupPageData(bpPayload)
  if (stage === 'bp') return createBPPageData(bpPayload)
  if (!program) return null
  if (
    stage === 'standby' ||
    activeContentType === 'standby' ||
    activeContentType === 'next_match'
  ) {
    return createStandbyPageData({ ...program, type: 'standby' })
  }
  if (stage === 'map_break' && program.type === 'map_break') {
    const timeline = program.sourceMapId ? (scoreTimelines[program.sourceMapId] ?? null) : null
    return createMapBreakPageData(program, timeline, highlightRule)
  }
  if (stage === 'series_end' && program.type === 'series_end') {
    return createSeriesEndPageData(program, highlightRule)
  }
  return null
}

function activeSegment(runtime: BroadcastRuntimeV1) {
  const segment = runtime.onAirProgram?.segments[runtime.activeSegmentIndex]
  return segment
    ? {
        id: segment.id,
        contentType: segment.contentType,
        startOffsetMs: segment.startOffsetMs,
        durationMs: segment.durationMs
      }
    : null
}

export function buildIntermissionNextOutputPayload(
  options: IntermissionNextOutputBuildOptions
): IntermissionNextOutputPayloadV1 {
  const currentSegment = ['map_break', 'series_end', 'standby'].includes(
    options.director.runtime.stage
  )
    ? activeSegment(options.runtime)
    : null
  const pageData = pageDataFromProgram(
    options.director,
    options.bpPayload,
    options.runtime.onAirProgram,
    currentSegment?.contentType ?? null,
    options.scoreTimelines,
    options.highlightRule
  )
  const normalizedBackgroundAssets =
    options.backgroundAssets.length === 0
      ? []
      : (normalizeGlobalBackgroundAssets(options.backgroundAssets) ?? [])
  const backgroundConfigurationIssue =
    options.backgroundAssets.length > 0 && normalizedBackgroundAssets.length === 0
      ? ['全局背景素材配置无效']
      : []
  const normalizedTransitionTimings = normalizeIntermissionNextTransitionTimings(
    options.transitionTimings
  )
  const transitionConfigurationIssue =
    normalizedTransitionTimings === null ? ['页面转场时长配置无效，已直接显示最终状态'] : []
  const transitionTimings = normalizedTransitionTimings ?? {
    brandCoverMs: 0,
    backgroundRevealMs: 0,
    pageEnterMs: 0,
    pageExitMs: 0,
    brandExitMs: 0
  }
  const assetIds = normalizedBackgroundAssets.map((asset) => asset.id)
  const programIssues = options.runtime.onAirProgram?.issues ?? []
  return {
    version: 1,
    payloadRevision: nonNegativeInteger(options.payloadRevision),
    playRevision: nonNegativeInteger(options.director.runtime.revision),
    serverNowMs: options.serverNowMs,
    director: structuredClone(options.director),
    visible: options.director.runtime.stage !== 'hidden' && pageData !== null,
    pageData,
    layout: normalizeIntermissionNextLayoutState(options.layout),
    background: normalizeGlobalBackgroundState(options.background, assetIds),
    backgroundAssets: normalizedBackgroundAssets.map((asset) => ({ ...asset })),
    transition: normalizeIntermissionNextTransitionState(options.transition),
    transitionTimings,
    mapMedia: (options.mapMedia ?? []).map((frame) => ({
      ...frame,
      current: { ...frame.current },
      preload: frame.preload === null ? null : { ...frame.preload }
    })),
    activeSegment: currentSegment,
    utilityReplay:
      currentSegment?.contentType === 'map_utility_replay'
        ? normalizeMapUtilityReplay(options.utilityReplay)
        : null,
    clock: playbackClock(options.runtime, options.director, options.bpPayload, options.serverNowMs),
    issues:
      options.runtime.onAirProgram !== null && pageData === null
        ? [
            ...programIssues,
            ...backgroundConfigurationIssue,
            ...transitionConfigurationIssue,
            '当前在播节目缺少完整页面数据'
          ]
        : [...programIssues, ...backgroundConfigurationIssue, ...transitionConfigurationIssue]
  }
}
