import type { BPMapId } from '../bp'
import {
  mapMediaById,
  type MapMediaComponentFileV1,
  type MapMediaManifestV1,
  type MapMediaSourceFileV1
} from './manifest'

export const MAP_MEDIA_PURPOSES = ['sequence', 'hero'] as const

export type MapMediaPurpose = (typeof MAP_MEDIA_PURPOSES)[number]

export interface MapMediaFileReference {
  localPath: string
  width: number
  height: number
  bytes: number
  sha256: string
}

export interface MapMediaSelection {
  mapId: BPMapId
  purpose: MapMediaPurpose
  assetIndex: number
  primary: MapMediaFileReference
  fallback: MapMediaFileReference
}

export interface MapMediaTimelineInput {
  mediaRevision: number
  startedAtMs: number
  rotationIntervalMs: number
  crossfadeDurationMs: number
}

export interface MapMediaTimelineFrame {
  mediaRevision: number
  elapsedMs: number
  cycleIndex: number
  timeInCycleMs: number
  current: MapMediaSelection
  preload: MapMediaSelection | null
  crossfadeProgress: number
}

export class MapMediaTimelineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MapMediaTimelineError'
  }
}

function nonNegativeSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MapMediaTimelineError(`${field} 必须是非负安全整数`)
  }
  return value
}

function positiveSafeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new MapMediaTimelineError(`${field} 必须是正安全整数`)
  }
  return value
}

function fileReference(
  file: MapMediaSourceFileV1 | MapMediaComponentFileV1
): MapMediaFileReference {
  return {
    localPath: file.localPath,
    width: file.width,
    height: file.height,
    bytes: file.bytes,
    sha256: file.sha256
  }
}

function selectMapMedia(
  manifest: MapMediaManifestV1,
  mapId: BPMapId,
  purpose: MapMediaPurpose,
  assetIndex: number
): MapMediaSelection {
  const map = mapMediaById(manifest, mapId)
  nonNegativeSafeInteger(assetIndex, 'assetIndex')
  if (assetIndex >= map.displayAssets.length) {
    throw new MapMediaTimelineError(
      `assetIndex ${assetIndex} 超出 ${mapId} 的 ${map.displayAssets.length} 张素材`
    )
  }
  const pair = map.displayAssets[assetIndex]
  const primary = purpose === 'sequence' ? pair.component : pair.display
  return {
    mapId,
    purpose,
    assetIndex,
    primary: fileReference(primary),
    fallback: fileReference(map.fallback)
  }
}

export function selectSequenceMapMedia(
  manifest: MapMediaManifestV1,
  mapId: BPMapId,
  assetIndex: number
): MapMediaSelection {
  return selectMapMedia(manifest, mapId, 'sequence', assetIndex)
}

export function selectHeroMapMedia(
  manifest: MapMediaManifestV1,
  mapId: BPMapId,
  assetIndex: number
): MapMediaSelection {
  return selectMapMedia(manifest, mapId, 'hero', assetIndex)
}

export function fallbackAfterMapMediaLoadFailure(
  selection: MapMediaSelection,
  failedLocalPath: string
): MapMediaFileReference {
  if (failedLocalPath !== selection.primary.localPath) {
    throw new MapMediaTimelineError(
      `加载失败路径 ${failedLocalPath} 不属于当前主素材 ${selection.primary.localPath}`
    )
  }
  return selection.fallback
}

export function mapMediaTimelineFrameAt(
  manifest: MapMediaManifestV1,
  mapId: BPMapId,
  purpose: MapMediaPurpose,
  timeline: MapMediaTimelineInput,
  nowMs: number
): MapMediaTimelineFrame {
  const mediaRevision = nonNegativeSafeInteger(timeline.mediaRevision, 'mediaRevision')
  const startedAtMs = nonNegativeSafeInteger(timeline.startedAtMs, 'startedAtMs')
  const rotationIntervalMs = positiveSafeInteger(timeline.rotationIntervalMs, 'rotationIntervalMs')
  const crossfadeDurationMs = nonNegativeSafeInteger(
    timeline.crossfadeDurationMs,
    'crossfadeDurationMs'
  )
  nonNegativeSafeInteger(nowMs, 'nowMs')
  if (crossfadeDurationMs > rotationIntervalMs) {
    throw new MapMediaTimelineError('crossfadeDurationMs 不得大于 rotationIntervalMs')
  }
  if (!MAP_MEDIA_PURPOSES.includes(purpose)) {
    throw new MapMediaTimelineError(`不支持的素材用途 ${String(purpose)}`)
  }

  const map = mapMediaById(manifest, mapId)
  const assetCount = map.displayAssets.length
  const elapsedMs = Math.max(0, nowMs - startedAtMs)
  const cycleIndex = Math.floor(elapsedMs / rotationIntervalMs)
  const timeInCycleMs = elapsedMs % rotationIntervalMs
  const currentIndex = (mediaRevision + cycleIndex) % assetCount
  const preloadIndex = assetCount > 1 ? (currentIndex + 1) % assetCount : null
  const select = purpose === 'sequence' ? selectSequenceMapMedia : selectHeroMapMedia
  const fadeStartMs = rotationIntervalMs - crossfadeDurationMs
  const crossfadeProgress =
    crossfadeDurationMs === 0 || timeInCycleMs <= fadeStartMs
      ? 0
      : Math.min(1, (timeInCycleMs - fadeStartMs) / crossfadeDurationMs)

  return {
    mediaRevision,
    elapsedMs,
    cycleIndex,
    timeInCycleMs,
    current: select(manifest, mapId, currentIndex),
    preload: preloadIndex === null ? null : select(manifest, mapId, preloadIndex),
    crossfadeProgress
  }
}
