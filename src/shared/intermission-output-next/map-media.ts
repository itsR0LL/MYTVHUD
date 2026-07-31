import type {
  MapMediaFileReference,
  MapMediaPurpose,
  MapMediaSelection,
  MapMediaTimelineInput,
  MapMediaTimelineFrame
} from '../intermission-map-media-next'

export const INTERMISSION_NEXT_MAP_ASSET_BASE_URL = '/intermission-next/assets/maps'

export interface IntermissionNextMapMediaFile {
  url: string
  fallbackUrl: string
  width: number
  height: number
}

export interface IntermissionNextMapMediaOutputFrame {
  mapId: MapMediaTimelineFrame['current']['mapId']
  purpose: MapMediaPurpose
  mediaRevision: number
  current: IntermissionNextMapMediaFile
  preload: IntermissionNextMapMediaFile | null
  crossfadeProgress: number
  frameStartedAtMs: number | null
  frameEndAtMs: number | null
  crossfadeStartedAtMs: number | null
  crossfadeDurationMs: number
}

function assetUrl(file: MapMediaFileReference): string {
  const encodedPath = file.localPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${INTERMISSION_NEXT_MAP_ASSET_BASE_URL}/${encodedPath}`
}

function outputFile(
  primary: MapMediaFileReference,
  fallback: MapMediaFileReference
): IntermissionNextMapMediaFile {
  return {
    url: assetUrl(primary),
    fallbackUrl: assetUrl(fallback),
    width: primary.width,
    height: primary.height
  }
}

function safeTimestamp(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} 必须是非负安全整数`)
  }
  return value
}

export function createIntermissionNextMapMediaOutputFrame(
  frame: MapMediaTimelineFrame,
  timeline: MapMediaTimelineInput
): IntermissionNextMapMediaOutputFrame {
  const frameStartedAtMs = safeTimestamp(
    timeline.startedAtMs + frame.cycleIndex * timeline.rotationIntervalMs,
    'frameStartedAtMs'
  )
  const frameEndAtMs = safeTimestamp(frameStartedAtMs + timeline.rotationIntervalMs, 'frameEndAtMs')
  const crossfadeDurationMs = safeTimestamp(timeline.crossfadeDurationMs, 'crossfadeDurationMs')
  return {
    mapId: frame.current.mapId,
    purpose: frame.current.purpose,
    mediaRevision: frame.mediaRevision,
    current: outputFile(frame.current.primary, frame.current.fallback),
    preload:
      frame.preload === null ? null : outputFile(frame.preload.primary, frame.preload.fallback),
    crossfadeProgress: frame.crossfadeProgress,
    frameStartedAtMs,
    frameEndAtMs,
    crossfadeStartedAtMs:
      frame.preload === null || crossfadeDurationMs === 0
        ? null
        : frameEndAtMs - crossfadeDurationMs,
    crossfadeDurationMs
  }
}

export function createStableIntermissionNextMapMediaOutputFrame(
  selection: MapMediaSelection,
  mediaRevision: number
): IntermissionNextMapMediaOutputFrame {
  return {
    mapId: selection.mapId,
    purpose: selection.purpose,
    mediaRevision: safeTimestamp(mediaRevision, 'mediaRevision'),
    current: outputFile(selection.primary, selection.fallback),
    preload: null,
    crossfadeProgress: 0,
    frameStartedAtMs: null,
    frameEndAtMs: null,
    crossfadeStartedAtMs: null,
    crossfadeDurationMs: 0
  }
}
