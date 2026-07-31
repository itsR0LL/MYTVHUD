export const GLOBAL_BACKGROUND_PLAYBACK_STATUSES = ['idle', 'playing', 'paused'] as const
export const GLOBAL_BACKGROUND_SWITCH_DURATION_MS = 1_000

export type GlobalBackgroundPlaybackStatus = (typeof GLOBAL_BACKGROUND_PLAYBACK_STATUSES)[number]

export interface GlobalBackgroundTransitionV1 {
  fromAssetId: string
  toAssetId: string
  startedAtMs: number
  durationMs: number
}

export interface GlobalBackgroundStateV1 {
  version: 1
  revision: number
  switchRevision: number
  visible: boolean
  playbackStatus: GlobalBackgroundPlaybackStatus
  activeAssetId: string | null
  preloadAssetId: string | null
  positionMs: number
  startedAtMs: number | null
  transition: GlobalBackgroundTransitionV1 | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function timestamp(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : null
}

function normalizedAssetIds(assetIds: readonly string[]): Set<string> {
  return new Set(assetIds.filter((assetId) => typeof assetId === 'string' && assetId.length > 0))
}

function normalizedAssetIdList(assetIds: readonly string[]): string[] {
  return [...normalizedAssetIds(assetIds)]
}

function normalizeAssetId(value: unknown, allowedAssetIds: ReadonlySet<string>): string | null {
  return typeof value === 'string' && allowedAssetIds.has(value) ? value : null
}

function normalizePlaybackStatus(value: unknown): GlobalBackgroundPlaybackStatus {
  return GLOBAL_BACKGROUND_PLAYBACK_STATUSES.includes(value as GlobalBackgroundPlaybackStatus)
    ? (value as GlobalBackgroundPlaybackStatus)
    : 'idle'
}

export function createDefaultGlobalBackgroundState(): GlobalBackgroundStateV1 {
  return {
    version: 1,
    revision: 0,
    switchRevision: 0,
    visible: false,
    playbackStatus: 'idle',
    activeAssetId: null,
    preloadAssetId: null,
    positionMs: 0,
    startedAtMs: null,
    transition: null
  }
}

export function nextGlobalBackgroundAssetId(
  state: GlobalBackgroundStateV1,
  assetIds: readonly string[]
): string | null {
  const orderedAssetIds = normalizedAssetIdList(assetIds)
  if (orderedAssetIds.length === 0) return null
  const activeIndex =
    state.activeAssetId === null ? -1 : orderedAssetIds.indexOf(state.activeAssetId)
  return orderedAssetIds[(activeIndex + 1) % orderedAssetIds.length]
}

export function normalizeGlobalBackgroundState(
  value: unknown,
  assetIds: readonly string[]
): GlobalBackgroundStateV1 {
  const fallback = createDefaultGlobalBackgroundState()
  if (!isRecord(value) || value.version !== 1) return fallback

  const allowedAssetIds = normalizedAssetIds(assetIds)
  const activeAssetId = normalizeAssetId(value.activeAssetId, allowedAssetIds)
  if (activeAssetId === null) {
    return {
      ...fallback,
      revision: nonNegativeInteger(value.revision),
      switchRevision: nonNegativeInteger(value.switchRevision)
    }
  }

  const requestedStatus = normalizePlaybackStatus(value.playbackStatus)
  const requestedStartedAtMs = timestamp(value.startedAtMs)
  const playbackStatus =
    requestedStatus === 'playing' && requestedStartedAtMs === null ? 'paused' : requestedStatus
  const startedAtMs = playbackStatus === 'playing' ? requestedStartedAtMs : null
  const preloadAssetId = normalizeAssetId(value.preloadAssetId, allowedAssetIds)
  const transitionSource = isRecord(value.transition) ? value.transition : null
  const transitionDurationMs = transitionSource
    ? positiveInteger(transitionSource.durationMs)
    : null
  const transitionStartedAtMs = transitionSource ? timestamp(transitionSource.startedAtMs) : null
  const transitionFromAssetId = transitionSource
    ? normalizeAssetId(transitionSource.fromAssetId, allowedAssetIds)
    : null
  const transitionToAssetId = transitionSource
    ? normalizeAssetId(transitionSource.toAssetId, allowedAssetIds)
    : null
  const transition =
    transitionDurationMs !== null &&
    transitionStartedAtMs !== null &&
    transitionFromAssetId === activeAssetId &&
    transitionToAssetId !== null &&
    transitionToAssetId === preloadAssetId &&
    transitionToAssetId !== transitionFromAssetId
      ? {
          fromAssetId: transitionFromAssetId,
          toAssetId: transitionToAssetId,
          startedAtMs: transitionStartedAtMs,
          durationMs: transitionDurationMs
        }
      : null

  return {
    version: 1,
    revision: nonNegativeInteger(value.revision),
    switchRevision: nonNegativeInteger(value.switchRevision),
    visible: value.visible === true,
    playbackStatus,
    activeAssetId,
    preloadAssetId:
      preloadAssetId !== activeAssetId && preloadAssetId !== null ? preloadAssetId : null,
    positionMs: nonNegativeInteger(value.positionMs),
    startedAtMs,
    transition
  }
}

export function globalBackgroundPositionAt(state: GlobalBackgroundStateV1, nowMs: number): number {
  const normalizedNowMs = timestamp(nowMs)
  if (
    state.playbackStatus !== 'playing' ||
    state.startedAtMs === null ||
    normalizedNowMs === null
  ) {
    return state.positionMs
  }
  return Math.max(0, state.positionMs + normalizedNowMs - state.startedAtMs)
}

export function selectInitialGlobalBackground(
  state: GlobalBackgroundStateV1,
  assetId: string,
  assetIds: readonly string[]
): GlobalBackgroundStateV1 {
  const allowedAssetIds = normalizedAssetIds(assetIds)
  if (!allowedAssetIds.has(assetId)) return normalizeGlobalBackgroundState(state, assetIds)

  const current = normalizeGlobalBackgroundState(state, assetIds)
  if (current.activeAssetId === assetId && current.transition === null) return current
  return {
    ...current,
    revision: current.revision + 1,
    switchRevision: current.switchRevision + 1,
    playbackStatus: 'paused',
    activeAssetId: assetId,
    preloadAssetId: null,
    positionMs: 0,
    startedAtMs: null,
    transition: null
  }
}

export function setGlobalBackgroundVisibility(
  state: GlobalBackgroundStateV1,
  visible: boolean
): GlobalBackgroundStateV1 {
  if (state.visible === visible) return state
  return {
    ...state,
    visible,
    revision: state.revision + 1
  }
}

export function playGlobalBackground(
  state: GlobalBackgroundStateV1,
  nowMs: number
): GlobalBackgroundStateV1 {
  const normalizedNowMs = timestamp(nowMs)
  if (
    state.activeAssetId === null ||
    normalizedNowMs === null ||
    state.playbackStatus === 'playing'
  ) {
    return state
  }
  return {
    ...state,
    playbackStatus: 'playing',
    startedAtMs: normalizedNowMs,
    revision: state.revision + 1
  }
}

export function pauseGlobalBackground(
  state: GlobalBackgroundStateV1,
  nowMs: number
): GlobalBackgroundStateV1 {
  if (state.playbackStatus !== 'playing') return state
  return {
    ...state,
    playbackStatus: 'paused',
    positionMs: globalBackgroundPositionAt(state, nowMs),
    startedAtMs: null,
    revision: state.revision + 1
  }
}

export function preloadGlobalBackground(
  state: GlobalBackgroundStateV1,
  assetId: string,
  assetIds: readonly string[]
): GlobalBackgroundStateV1 {
  const allowedAssetIds = normalizedAssetIds(assetIds)
  if (
    state.transition !== null ||
    !allowedAssetIds.has(assetId) ||
    state.activeAssetId === assetId ||
    state.preloadAssetId === assetId
  ) {
    return state
  }
  return {
    ...state,
    preloadAssetId: assetId,
    transition: null,
    revision: state.revision + 1
  }
}

export function prepareNextGlobalBackground(
  state: GlobalBackgroundStateV1,
  assetIds: readonly string[]
): GlobalBackgroundStateV1 {
  if (state.transition !== null) return state
  const nextAssetId = nextGlobalBackgroundAssetId(state, assetIds)
  return nextAssetId === null ? state : preloadGlobalBackground(state, nextAssetId, assetIds)
}

export function initializeGlobalBackgroundSequence(
  state: GlobalBackgroundStateV1,
  assetIds: readonly string[],
  nowMs: number
): GlobalBackgroundStateV1 {
  const orderedAssetIds = normalizedAssetIdList(assetIds)
  if (orderedAssetIds.length === 0) return normalizeGlobalBackgroundState(state, assetIds)

  let current = normalizeGlobalBackgroundState(state, orderedAssetIds)
  if (current.activeAssetId === null) {
    current = selectInitialGlobalBackground(current, orderedAssetIds[0], orderedAssetIds)
    current = playGlobalBackground(current, nowMs)
    current = setGlobalBackgroundVisibility(current, true)
  }
  return prepareNextGlobalBackground(current, orderedAssetIds)
}

export function beginGlobalBackgroundSwitch(
  state: GlobalBackgroundStateV1,
  assetId: string,
  nowMs: number,
  durationMs: number,
  assetIds: readonly string[]
): GlobalBackgroundStateV1 {
  const normalizedNowMs = timestamp(nowMs)
  const normalizedDurationMs = positiveInteger(durationMs)
  const allowedAssetIds = normalizedAssetIds(assetIds)
  if (
    state.transition !== null ||
    state.activeAssetId === null ||
    state.activeAssetId === assetId ||
    !allowedAssetIds.has(assetId) ||
    normalizedNowMs === null ||
    normalizedDurationMs === null
  ) {
    return state
  }
  return {
    ...state,
    preloadAssetId: assetId,
    transition: {
      fromAssetId: state.activeAssetId,
      toAssetId: assetId,
      startedAtMs: normalizedNowMs,
      durationMs: normalizedDurationMs
    },
    revision: state.revision + 1,
    switchRevision: state.switchRevision + 1
  }
}

export function completeGlobalBackgroundSwitch(
  state: GlobalBackgroundStateV1,
  nowMs: number
): GlobalBackgroundStateV1 {
  const transition = state.transition
  const normalizedNowMs = timestamp(nowMs)
  if (
    transition === null ||
    normalizedNowMs === null ||
    normalizedNowMs < transition.startedAtMs + transition.durationMs
  ) {
    return state
  }

  const wasPlaying = state.playbackStatus === 'playing'
  return {
    ...state,
    activeAssetId: transition.toAssetId,
    preloadAssetId: null,
    positionMs: wasPlaying ? normalizedNowMs - transition.startedAtMs : 0,
    startedAtMs: wasPlaying ? normalizedNowMs : null,
    transition: null,
    revision: state.revision + 1
  }
}
