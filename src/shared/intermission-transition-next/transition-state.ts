import {
  INTERMISSION_NEXT_PAGE_IDS,
  isIntermissionNextPageId,
  type IntermissionNextPageId
} from '../intermission-next'

export const INTERMISSION_NEXT_TRANSITION_PAGE_IDS = INTERMISSION_NEXT_PAGE_IDS
export type IntermissionNextTransitionPageId = IntermissionNextPageId | 'bp'

export const INTERMISSION_NEXT_TRANSITION_PHASES = [
  'hidden',
  'brand_cover',
  'background_reveal',
  'page_enter',
  'hold',
  'page_exit',
  'brand_exit'
] as const

export type IntermissionNextTransitionPhase = (typeof INTERMISSION_NEXT_TRANSITION_PHASES)[number]

export interface IntermissionNextTransitionTimings {
  brandCoverMs: number
  backgroundRevealMs: number
  pageEnterMs: number
  pageExitMs: number
  brandExitMs: number
}

export interface IntermissionNextTransitionStateV1 {
  version: 1
  pageId: IntermissionNextTransitionPageId | null
  playRevision: number
  startedAtMs: number | null
  exitStartedAtMs: number | null
}

export interface IntermissionNextTransitionFrame {
  phase: IntermissionNextTransitionPhase
  progress: number
  pageId: IntermissionNextTransitionPageId | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

function timestamp(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null
}

function duration(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

function phaseFrame(
  phase: IntermissionNextTransitionPhase,
  elapsedMs: number,
  durationMs: number,
  pageId: IntermissionNextTransitionPageId | null
): IntermissionNextTransitionFrame {
  return {
    phase,
    progress: durationMs === 0 ? 1 : Math.min(1, Math.max(0, elapsedMs / durationMs)),
    pageId
  }
}

export function normalizeIntermissionNextTransitionTimings(
  value: unknown
): IntermissionNextTransitionTimings | null {
  if (!isRecord(value)) return null
  const brandCoverMs = duration(value.brandCoverMs)
  const backgroundRevealMs = duration(value.backgroundRevealMs)
  const pageEnterMs = duration(value.pageEnterMs)
  const pageExitMs = duration(value.pageExitMs)
  const brandExitMs = duration(value.brandExitMs)
  if (
    brandCoverMs === null ||
    backgroundRevealMs === null ||
    pageEnterMs === null ||
    pageExitMs === null ||
    brandExitMs === null
  ) {
    return null
  }
  return { brandCoverMs, backgroundRevealMs, pageEnterMs, pageExitMs, brandExitMs }
}

export function createHiddenIntermissionNextTransitionState(): IntermissionNextTransitionStateV1 {
  return {
    version: 1,
    pageId: null,
    playRevision: 0,
    startedAtMs: null,
    exitStartedAtMs: null
  }
}

export function normalizeIntermissionNextTransitionState(
  value: unknown
): IntermissionNextTransitionStateV1 {
  const fallback = createHiddenIntermissionNextTransitionState()
  if (!isRecord(value) || value.version !== 1) return fallback
  const pageId: IntermissionNextTransitionPageId | null =
    value.pageId === 'bp' || isIntermissionNextPageId(value.pageId) ? value.pageId : null
  const startedAtMs = timestamp(value.startedAtMs)
  if (pageId === null || startedAtMs === null) {
    return {
      ...fallback,
      playRevision: nonNegativeInteger(value.playRevision)
    }
  }
  const exitStartedAtMs = timestamp(value.exitStartedAtMs)
  return {
    version: 1,
    pageId,
    playRevision: nonNegativeInteger(value.playRevision),
    startedAtMs,
    exitStartedAtMs:
      exitStartedAtMs !== null && exitStartedAtMs >= startedAtMs ? exitStartedAtMs : null
  }
}

export function startIntermissionNextTransition(
  state: IntermissionNextTransitionStateV1,
  pageId: IntermissionNextTransitionPageId,
  playRevision: number,
  nowMs: number
): IntermissionNextTransitionStateV1 {
  const normalizedRevision = nonNegativeInteger(playRevision, state.playRevision)
  const normalizedNowMs = timestamp(nowMs)
  if (normalizedNowMs === null) return state
  if (
    state.pageId === pageId &&
    state.playRevision === normalizedRevision &&
    state.startedAtMs !== null
  ) {
    return state
  }
  return {
    version: 1,
    pageId,
    playRevision: normalizedRevision,
    startedAtMs: normalizedNowMs,
    exitStartedAtMs: null
  }
}

export function beginIntermissionNextExit(
  state: IntermissionNextTransitionStateV1,
  nowMs: number
): IntermissionNextTransitionStateV1 {
  const normalizedNowMs = timestamp(nowMs)
  if (
    state.pageId === null ||
    state.startedAtMs === null ||
    state.exitStartedAtMs !== null ||
    normalizedNowMs === null ||
    normalizedNowMs < state.startedAtMs
  ) {
    return state
  }
  return {
    ...state,
    exitStartedAtMs: normalizedNowMs
  }
}

export function intermissionNextTransitionFrameAt(
  stateValue: unknown,
  timingsValue: unknown,
  nowMs: number
): IntermissionNextTransitionFrame {
  const state = normalizeIntermissionNextTransitionState(stateValue)
  const timings = normalizeIntermissionNextTransitionTimings(timingsValue)
  const normalizedNowMs = timestamp(nowMs)
  if (
    state.pageId === null ||
    state.startedAtMs === null ||
    timings === null ||
    normalizedNowMs === null
  ) {
    return phaseFrame('hidden', 0, 0, null)
  }

  if (state.exitStartedAtMs !== null) {
    const elapsedExitMs = Math.max(0, normalizedNowMs - state.exitStartedAtMs)
    if (elapsedExitMs < timings.pageExitMs) {
      return phaseFrame('page_exit', elapsedExitMs, timings.pageExitMs, state.pageId)
    }
    const elapsedBrandExitMs = elapsedExitMs - timings.pageExitMs
    if (elapsedBrandExitMs < timings.brandExitMs) {
      return phaseFrame('brand_exit', elapsedBrandExitMs, timings.brandExitMs, state.pageId)
    }
    return phaseFrame('hidden', 0, 0, null)
  }

  let elapsedMs = Math.max(0, normalizedNowMs - state.startedAtMs)
  if (elapsedMs < timings.brandCoverMs) {
    return phaseFrame('brand_cover', elapsedMs, timings.brandCoverMs, state.pageId)
  }
  elapsedMs -= timings.brandCoverMs
  if (elapsedMs < timings.backgroundRevealMs) {
    return phaseFrame('background_reveal', elapsedMs, timings.backgroundRevealMs, state.pageId)
  }
  elapsedMs -= timings.backgroundRevealMs
  if (elapsedMs < timings.pageEnterMs) {
    return phaseFrame('page_enter', elapsedMs, timings.pageEnterMs, state.pageId)
  }
  return phaseFrame('hold', 0, 0, state.pageId)
}
