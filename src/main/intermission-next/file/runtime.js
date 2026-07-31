;(function attachIntermissionNextOutputRuntime(root, factory) {
  const runtime = factory()
  if (typeof module === 'object' && module.exports) module.exports = runtime
  if (root) root.IntermissionNextOutputRuntime = runtime
})(typeof globalThis === 'undefined' ? this : globalThis, function createRuntime() {
  'use strict'

  const SOCKET_EVENT = 'intermission-next-state'
  const PREVIEW_MESSAGE = 'intermission-next-preview-state'
  const PAGE_IDS = ['warmup', 'bp', 'map_break', 'series_end', 'standby']
  const MAP_MEDIA_PURPOSES = ['sequence', 'hero']
  const TRANSITION_PHASES = [
    'hidden',
    'brand_cover',
    'background_reveal',
    'page_enter',
    'hold',
    'page_exit',
    'brand_exit'
  ]

  function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value)
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value))
  }

  function progress(elapsedMs, durationMs) {
    return durationMs === 0 ? 1 : clamp(elapsedMs / durationMs, 0, 1)
  }

  function transitionFrameAt(state, timings, nowMs) {
    const timingsValid =
      isRecord(timings) &&
      Number.isInteger(timings.brandCoverMs) &&
      timings.brandCoverMs >= 0 &&
      Number.isInteger(timings.backgroundRevealMs) &&
      timings.backgroundRevealMs >= 0 &&
      Number.isInteger(timings.pageEnterMs) &&
      timings.pageEnterMs >= 0 &&
      Number.isInteger(timings.pageExitMs) &&
      timings.pageExitMs >= 0 &&
      Number.isInteger(timings.brandExitMs) &&
      timings.brandExitMs >= 0
    if (
      !isRecord(state) ||
      state.version !== 1 ||
      !PAGE_IDS.includes(state.pageId) ||
      !isFiniteNumber(state.startedAtMs) ||
      state.startedAtMs < 0 ||
      !timingsValid ||
      !isFiniteNumber(nowMs) ||
      nowMs < 0
    ) {
      return { phase: 'hidden', progress: 1, pageId: null }
    }

    const brandCoverMs = timings.brandCoverMs
    const backgroundRevealMs = timings.backgroundRevealMs
    const pageEnterMs = timings.pageEnterMs
    const pageExitMs = timings.pageExitMs
    const brandExitMs = timings.brandExitMs
    const safeNowMs = Math.round(nowMs)
    const startedAtMs = Math.round(state.startedAtMs)
    const exitStartedAtMs =
      isFiniteNumber(state.exitStartedAtMs) &&
      state.exitStartedAtMs >= startedAtMs &&
      state.exitStartedAtMs >= 0
        ? Math.round(state.exitStartedAtMs)
        : null

    if (exitStartedAtMs !== null) {
      const exitElapsedMs = Math.max(0, safeNowMs - exitStartedAtMs)
      if (exitElapsedMs < pageExitMs) {
        return {
          phase: 'page_exit',
          progress: progress(exitElapsedMs, pageExitMs),
          pageId: state.pageId
        }
      }
      if (exitElapsedMs < pageExitMs + brandExitMs) {
        return {
          phase: 'brand_exit',
          progress: progress(exitElapsedMs - pageExitMs, brandExitMs),
          pageId: state.pageId
        }
      }
      return { phase: 'hidden', progress: 1, pageId: null }
    }

    const elapsedMs = Math.max(0, safeNowMs - startedAtMs)
    if (elapsedMs < brandCoverMs) {
      return {
        phase: 'brand_cover',
        progress: progress(elapsedMs, brandCoverMs),
        pageId: state.pageId
      }
    }
    if (elapsedMs < brandCoverMs + backgroundRevealMs) {
      return {
        phase: 'background_reveal',
        progress: progress(elapsedMs - brandCoverMs, backgroundRevealMs),
        pageId: state.pageId
      }
    }
    if (elapsedMs < brandCoverMs + backgroundRevealMs + pageEnterMs) {
      return {
        phase: 'page_enter',
        progress: progress(elapsedMs - brandCoverMs - backgroundRevealMs, pageEnterMs),
        pageId: state.pageId
      }
    }
    return { phase: 'hold', progress: 1, pageId: state.pageId }
  }

  function backgroundPositionAt(state, nowMs) {
    if (!isRecord(state) || !isFiniteNumber(state.positionMs)) return 0
    if (
      state.playbackStatus === 'playing' &&
      isFiniteNumber(state.startedAtMs) &&
      isFiniteNumber(nowMs)
    ) {
      return Math.max(0, state.positionMs + nowMs - state.startedAtMs)
    }
    return Math.max(0, state.positionMs)
  }

  function backgroundTransitionProgressAt(state, nowMs) {
    if (!isRecord(state) || !isRecord(state.transition)) return 1
    const startedAtMs = state.transition.startedAtMs
    const durationMs = state.transition.durationMs
    if (!isFiniteNumber(startedAtMs) || !isFiniteNumber(durationMs)) return 1
    return progress(Math.max(0, nowMs - startedAtMs), Math.max(0, durationMs))
  }

  function playbackClockRemainingMs(clock, nowMs) {
    if (!isRecord(clock)) return null
    if (clock.status === 'playing' && isFiniteNumber(clock.deadlineAtMs)) {
      return Math.max(0, clock.deadlineAtMs - nowMs)
    }
    if (clock.status === 'paused' && isFiniteNumber(clock.pausedRemainingMs)) {
      return Math.max(0, clock.pausedRemainingMs)
    }
    if (
      (clock.status === 'idle' || clock.status === 'ready') &&
      isFiniteNumber(clock.totalDurationMs)
    ) {
      return Math.max(0, clock.totalDurationMs)
    }
    if (clock.status === 'finished') return 0
    return null
  }

  function formatDuration(milliseconds) {
    if (!isFiniteNumber(milliseconds)) return '--:--'
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  function componentStyle(layout) {
    if (!isRecord(layout)) return ''
    return [
      `left:${Number(layout.x)}px`,
      `top:${Number(layout.y)}px`,
      `width:${Number(layout.width)}px`,
      `height:${Number(layout.height)}px`
    ].join(';')
  }

  function componentWindowActive(windows, elapsedMs, totalDurationMs) {
    if (!Array.isArray(windows) || !isFiniteNumber(elapsedMs)) return false
    return windows.some((window) => {
      if (!isRecord(window) || !isFiniteNumber(window.startOffsetMs)) return false
      const endOffsetMs =
        window.endOffsetMs === null
          ? totalDurationMs
          : isFiniteNumber(window.endOffsetMs)
            ? window.endOffsetMs
            : -1
      return elapsedMs >= window.startOffsetMs && elapsedMs < endOffsetMs
    })
  }

  function bpComponentWindowActive(windows, elapsedMs, playbackStarted) {
    if (!Array.isArray(windows) || !isFiniteNumber(elapsedMs)) return false
    return windows.some((window) => {
      if (!isRecord(window) || !isFiniteNumber(window.startOffsetMs)) return false
      if (!playbackStarted) {
        return window.startOffsetMs === 0 && window.endOffsetMs === null
      }
      const endOffsetMs =
        window.endOffsetMs === null
          ? Number.POSITIVE_INFINITY
          : isFiniteNumber(window.endOffsetMs)
            ? window.endOffsetMs
            : -1
      return elapsedMs >= window.startOffsetMs && elapsedMs < endOffsetMs
    })
  }

  function activeTimelineTransition(transitions, elapsedMs) {
    if (!Array.isArray(transitions) || !isFiniteNumber(elapsedMs)) return null
    return (
      transitions.find(
        (transition) =>
          isRecord(transition) &&
          isFiniteNumber(transition.startOffsetMs) &&
          isFiniteNumber(transition.durationMs) &&
          elapsedMs >= transition.startOffsetMs &&
          elapsedMs < transition.startOffsetMs + transition.durationMs
      ) || null
    )
  }

  function findMapMediaFrame(frames, mapId, purpose) {
    if (
      !Array.isArray(frames) ||
      typeof mapId !== 'string' ||
      !MAP_MEDIA_PURPOSES.includes(purpose)
    ) {
      return null
    }
    return (
      frames.find(
        (frame) =>
          isRecord(frame) &&
          frame.mapId === mapId &&
          frame.purpose === purpose &&
          isRecord(frame.current) &&
          (frame.preload === null || isRecord(frame.preload))
      ) || null
    )
  }

  function mapMediaOpacities(frame) {
    if (!isRecord(frame) || frame.preload === null || !isRecord(frame.preload)) {
      return { current: 1, preload: 0 }
    }
    const crossfadeProgress = isFiniteNumber(frame.crossfadeProgress)
      ? clamp(frame.crossfadeProgress, 0, 1)
      : 0
    return { current: 1 - crossfadeProgress, preload: crossfadeProgress }
  }

  function mapMediaOpacitiesAt(frame, nowMs) {
    if (!isRecord(frame) || frame.preload === null || !isRecord(frame.preload)) {
      return { current: 1, preload: 0 }
    }
    let crossfadeProgress = isFiniteNumber(frame.crossfadeProgress)
      ? clamp(frame.crossfadeProgress, 0, 1)
      : 0
    if (
      isFiniteNumber(frame.crossfadeStartedAtMs) &&
      Number.isInteger(frame.crossfadeDurationMs) &&
      frame.crossfadeDurationMs > 0 &&
      isFiniteNumber(nowMs)
    ) {
      crossfadeProgress = clamp(
        (nowMs - frame.crossfadeStartedAtMs) / frame.crossfadeDurationMs,
        0,
        1
      )
    }
    if (
      isFiniteNumber(frame.frameEndAtMs) &&
      isFiniteNumber(nowMs) &&
      nowMs >= frame.frameEndAtMs
    ) {
      crossfadeProgress = 1
    }
    return { current: 1 - crossfadeProgress, preload: crossfadeProgress }
  }

  function dueMapMediaFrameEnds(frames, requestedFrameEnds, nowMs) {
    if (!Array.isArray(frames) || !(requestedFrameEnds instanceof Set) || !isFiniteNumber(nowMs)) {
      return []
    }
    return [
      ...new Set(
        frames
          .filter(
            (frame) =>
              isRecord(frame) &&
              isFiniteNumber(frame.frameEndAtMs) &&
              frame.frameEndAtMs <= nowMs &&
              !requestedFrameEnds.has(frame.frameEndAtMs)
          )
          .map((frame) => frame.frameEndAtMs)
      )
    ].sort((left, right) => left - right)
  }

  function nextMapMediaSource(file, currentSource) {
    if (
      !isRecord(file) ||
      typeof file.url !== 'string' ||
      typeof file.fallbackUrl !== 'string' ||
      typeof currentSource !== 'string'
    ) {
      return null
    }
    if (currentSource !== file.url || file.fallbackUrl === file.url) return null
    return file.fallbackUrl
  }

  function transitionStateForPayload(
    previousPlayRevision,
    effectiveTransition,
    nextPlayRevision,
    nextTransition
  ) {
    if (
      !isFiniteNumber(previousPlayRevision) ||
      previousPlayRevision !== nextPlayRevision ||
      !isRecord(effectiveTransition)
    ) {
      return nextTransition
    }
    if (
      effectiveTransition.exitStartedAtMs === null &&
      isRecord(nextTransition) &&
      isFiniteNumber(nextTransition.exitStartedAtMs)
    ) {
      return {
        ...effectiveTransition,
        exitStartedAtMs: nextTransition.exitStartedAtMs
      }
    }
    return effectiveTransition
  }

  function pageTransitionVisual(frame, reducedMotion, forceFinal) {
    if (forceFinal) return { opacity: 1, translateY: 0, blur: 0 }
    if (!isRecord(frame) || !TRANSITION_PHASES.includes(frame.phase)) {
      return { opacity: 0, translateY: 0, blur: 0 }
    }
    if (reducedMotion) {
      const hidden =
        frame.phase === 'hidden' || frame.phase === 'page_exit' || frame.phase === 'brand_exit'
      return { opacity: hidden ? 0 : 1, translateY: 0, blur: 0 }
    }
    const phaseProgress = isFiniteNumber(frame.progress) ? clamp(frame.progress, 0, 1) : 0
    if (frame.phase === 'page_enter') {
      return {
        opacity: phaseProgress,
        translateY: (1 - phaseProgress) * 18,
        blur: (1 - phaseProgress) * 5
      }
    }
    if (frame.phase === 'hold') return { opacity: 1, translateY: 0, blur: 0 }
    if (frame.phase === 'page_exit') {
      return {
        opacity: 1 - phaseProgress,
        translateY: -14 * phaseProgress,
        blur: 4 * phaseProgress
      }
    }
    return { opacity: 0, translateY: 18, blur: 5 }
  }

  function planBackgroundVideoSlots(currentAssetIds, backgroundState) {
    const current = [0, 1].map((index) =>
      Array.isArray(currentAssetIds) && typeof currentAssetIds[index] === 'string'
        ? currentAssetIds[index]
        : null
    )
    const desired = []
    if (isRecord(backgroundState) && typeof backgroundState.activeAssetId === 'string') {
      desired.push({ assetId: backgroundState.activeAssetId, role: 'active' })
    }
    if (
      isRecord(backgroundState) &&
      typeof backgroundState.preloadAssetId === 'string' &&
      backgroundState.preloadAssetId !== backgroundState.activeAssetId
    ) {
      desired.push({ assetId: backgroundState.preloadAssetId, role: 'preload' })
    }

    const assignments = [null, null]
    for (const item of desired) {
      const existingIndex = current.indexOf(item.assetId)
      if (existingIndex >= 0 && assignments[existingIndex] === null) {
        assignments[existingIndex] = item
      }
    }
    for (const item of desired) {
      if (assignments.some((assignment) => assignment?.assetId === item.assetId)) continue
      const openIndex = assignments.findIndex((assignment) => assignment === null)
      if (openIndex >= 0) assignments[openIndex] = item
    }

    return assignments.map((assignment, index) => {
      const assetId = assignment?.assetId ?? null
      const shouldLoad = current[index] !== assetId
      return {
        assetId,
        role: assignment?.role ?? 'idle',
        shouldLoad,
        shouldSeek: assetId !== null && shouldLoad
      }
    })
  }

  function stableSerialize(value) {
    if (Array.isArray(value)) {
      return `[${value.map((item) => stableSerialize(item)).join(',')}]`
    }
    if (isRecord(value)) {
      return `{${Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
        .join(',')}}`
    }
    return JSON.stringify(value)
  }

  function mapMediaPair(frame) {
    if (!isRecord(frame)) return null
    return {
      mapId: frame.mapId,
      purpose: frame.purpose,
      current: frame.current,
      preload: frame.preload
    }
  }

  function relevantMapMediaPairs(value) {
    if (!isRecord(value) || !isRecord(value.pageData) || !Array.isArray(value.mapMedia)) {
      return []
    }
    const data = value.pageData
    if (data.page === 'map_break') {
      const mapIds = [data.sourceMapId]
      if (isRecord(data.nextMap) && typeof data.nextMap.mapId === 'string') {
        mapIds.push(data.nextMap.mapId)
      }
      return mapIds.map((mapId) => mapMediaPair(findMapMediaFrame(value.mapMedia, mapId, 'hero')))
    }
    if (data.page === 'series_end' && Array.isArray(data.maps)) {
      return data.maps.map((map) =>
        mapMediaPair(
          isRecord(map) ? findMapMediaFrame(value.mapMedia, map.mapId, 'sequence') : null
        )
      )
    }
    return []
  }

  function pageRenderSignature(value) {
    if (
      !isRecord(value) ||
      !isRecord(value.pageData) ||
      !PAGE_IDS.includes(value.pageData.page) ||
      !isRecord(value.layout) ||
      !isRecord(value.layout.pages)
    ) {
      return stableSerialize({ pageData: null, layout: null, mapMedia: [] })
    }
    const pageId = value.pageData.page
    return stableSerialize({
      pageData: value.pageData,
      layout: value.layout.pages[pageId] ?? null,
      mapMedia: relevantMapMediaPairs(value),
      activeSegment: value.activeSegment ?? null,
      utilityReplay: value.utilityReplay ?? null
    })
  }

  function shouldAcceptPayload(currentPayload, nextPayload) {
    if (!isRecord(nextPayload) || !isFiniteNumber(nextPayload.payloadRevision)) return false
    if (!isRecord(currentPayload) || !isFiniteNumber(currentPayload.payloadRevision)) return true
    if (nextPayload.payloadRevision > currentPayload.payloadRevision) return true
    if (nextPayload.payloadRevision < currentPayload.payloadRevision) return false
    return stableSerialize(currentPayload) === stableSerialize(nextPayload)
  }

  const INTERNAL_ENTER_RANGES = Object.freeze({
    warmup: Object.freeze({
      opening: [0, 0.32],
      teams: [0.2, 0.72],
      timing: [0.58, 1]
    }),
    bp: Object.freeze({
      opening: [0, 1]
    }),
    map_break: Object.freeze({
      opening: [0, 0.22],
      teams: [0.16, 0.42],
      scoreTimeline: [0.34, 0.74],
      playerRows: [0.58, 1]
    }),
    series_end: Object.freeze({
      winner: [0, 0.26],
      finalScore: [0.18, 0.46],
      history: [0.36, 0.74],
      playerRows: [0.62, 1]
    }),
    standby: Object.freeze({
      previous: [0, 0.4],
      nextMatch: [0.28, 0.74],
      timing: [0.62, 1]
    })
  })

  function internalEnterProgress(pageId, group, index, total, transitionFrame, reducedMotion) {
    if (reducedMotion || transitionFrame?.phase === 'hold') return 1
    if (transitionFrame?.phase !== 'page_enter') {
      return transitionFrame?.phase === 'page_exit' || transitionFrame?.phase === 'brand_exit'
        ? 1
        : 0
    }
    const range = INTERNAL_ENTER_RANGES[pageId]?.[group]
    if (!range) return 1
    const pageProgress = isFiniteNumber(transitionFrame.progress)
      ? clamp(transitionFrame.progress, 0, 1)
      : 0
    const safeTotal = Number.isInteger(total) && total > 0 ? total : 1
    const safeIndex = Number.isInteger(index) ? clamp(index, 0, safeTotal - 1) : 0
    const rangeLength = range[1] - range[0]
    const staggerWindow = rangeLength * 0.42
    const itemStart = range[0] + (safeTotal > 1 ? (safeIndex / (safeTotal - 1)) * staggerWindow : 0)
    const itemEnd = range[1]
    return itemEnd <= itemStart
      ? pageProgress >= itemEnd
        ? 1
        : 0
      : clamp((pageProgress - itemStart) / (itemEnd - itemStart), 0, 1)
  }

  function isOutputPayload(value) {
    return (
      isRecord(value) &&
      value.version === 1 &&
      isFiniteNumber(value.payloadRevision) &&
      isFiniteNumber(value.playRevision) &&
      isFiniteNumber(value.serverNowMs) &&
      isRecord(value.director) &&
      typeof value.visible === 'boolean' &&
      isRecord(value.layout) &&
      isRecord(value.background) &&
      Array.isArray(value.backgroundAssets) &&
      isRecord(value.transition) &&
      isRecord(value.transitionTimings) &&
      Array.isArray(value.mapMedia) &&
      (value.activeSegment === null || isRecord(value.activeSegment)) &&
      (value.utilityReplay === null || isRecord(value.utilityReplay)) &&
      isRecord(value.clock) &&
      Array.isArray(value.issues) &&
      (value.pageData === null ||
        (isRecord(value.pageData) && PAGE_IDS.includes(value.pageData.page)))
    )
  }

  function resolveAsset(assets, assetId) {
    if (!Array.isArray(assets) || typeof assetId !== 'string') return null
    return assets.find((asset) => isRecord(asset) && asset.id === assetId) || null
  }

  return Object.freeze({
    SOCKET_EVENT,
    PREVIEW_MESSAGE,
    PAGE_IDS,
    MAP_MEDIA_PURPOSES,
    TRANSITION_PHASES,
    transitionFrameAt,
    backgroundPositionAt,
    backgroundTransitionProgressAt,
    playbackClockRemainingMs,
    componentWindowActive,
    bpComponentWindowActive,
    activeTimelineTransition,
    formatDuration,
    componentStyle,
    findMapMediaFrame,
    mapMediaOpacities,
    mapMediaOpacitiesAt,
    dueMapMediaFrameEnds,
    nextMapMediaSource,
    transitionStateForPayload,
    pageTransitionVisual,
    planBackgroundVideoSlots,
    pageRenderSignature,
    shouldAcceptPayload,
    internalEnterProgress,
    isOutputPayload,
    resolveAsset
  })
})
