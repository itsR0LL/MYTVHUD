import type { BPMapId } from '../../../shared/bp'
import type { BroadcastProgram } from '../../../shared/broadcast-flow'
import {
  mapMediaById,
  mapMediaTimelineFrameAt,
  selectSequenceMapMedia,
  type MapMediaManifestV1,
  type MapMediaPurpose,
  type MapMediaTimelineInput
} from '../../../shared/intermission-map-media-next'
import {
  createIntermissionNextMapMediaOutputFrame,
  createStableIntermissionNextMapMediaOutputFrame,
  type IntermissionNextMapMediaOutputFrame
} from '../../../shared/intermission-output-next/map-media'
import { loadMapMediaManifestFile, verifyMapMediaManifestFiles } from './manifest-loader'

export interface IntermissionNextMapMediaProviderRequest {
  readonly onAirProgram: Readonly<BroadcastProgram> | null
  readonly nowMs: number
}

export interface VerifiedIntermissionNextMapMediaProvider {
  getMapMedia(
    request: IntermissionNextMapMediaProviderRequest
  ): Promise<readonly IntermissionNextMapMediaOutputFrame[]>
}

export interface VerifiedIntermissionNextMapMediaProviderConfiguration {
  manifestFilePath: string
  assetRootPath: string
  mediaRevision: number
  startedAtMs: number
  rotationIntervalMs: number
  crossfadeDurationMs: number
}

export class IntermissionNextMapMediaProviderConfigurationError extends Error {
  constructor(
    readonly field: keyof VerifiedIntermissionNextMapMediaProviderConfiguration | 'configuration',
    message: string
  ) {
    super(`${field}: ${message}`)
    this.name = 'IntermissionNextMapMediaProviderConfigurationError'
  }
}

interface MapMediaTarget {
  mapId: BPMapId
  purpose: MapMediaPurpose
  animated: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown, field: 'manifestFilePath' | 'assetRootPath'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new IntermissionNextMapMediaProviderConfigurationError(field, '必须是非空字符串')
  }
  return value
}

function nonNegativeSafeInteger(
  value: unknown,
  field: 'mediaRevision' | 'startedAtMs' | 'crossfadeDurationMs'
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new IntermissionNextMapMediaProviderConfigurationError(field, '必须是非负安全整数')
  }
  return Number(value)
}

function positiveSafeInteger(value: unknown, field: 'rotationIntervalMs'): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new IntermissionNextMapMediaProviderConfigurationError(field, '必须是正安全整数')
  }
  return Number(value)
}

function validateConfiguration(
  value: unknown
): VerifiedIntermissionNextMapMediaProviderConfiguration {
  if (!isRecord(value)) {
    throw new IntermissionNextMapMediaProviderConfigurationError('configuration', '必须是对象')
  }
  const configuration: VerifiedIntermissionNextMapMediaProviderConfiguration = {
    manifestFilePath: nonEmptyString(value.manifestFilePath, 'manifestFilePath'),
    assetRootPath: nonEmptyString(value.assetRootPath, 'assetRootPath'),
    mediaRevision: nonNegativeSafeInteger(value.mediaRevision, 'mediaRevision'),
    startedAtMs: nonNegativeSafeInteger(value.startedAtMs, 'startedAtMs'),
    rotationIntervalMs: positiveSafeInteger(value.rotationIntervalMs, 'rotationIntervalMs'),
    crossfadeDurationMs: nonNegativeSafeInteger(value.crossfadeDurationMs, 'crossfadeDurationMs')
  }
  if (configuration.crossfadeDurationMs > configuration.rotationIntervalMs) {
    throw new IntermissionNextMapMediaProviderConfigurationError(
      'crossfadeDurationMs',
      '不得大于 rotationIntervalMs'
    )
  }
  return configuration
}

function mapMediaTargets(program: Readonly<BroadcastProgram> | null): MapMediaTarget[] {
  if (program === null || program.type === 'standby') return []

  const targets: MapMediaTarget[] = []
  if (program.type === 'map_break') {
    if (program.snapshot.nextMapId !== '') {
      targets.push({ mapId: program.snapshot.nextMapId, purpose: 'hero', animated: true })
    }
    for (const map of program.snapshot.match.maps) {
      targets.push({ mapId: map.name, purpose: 'sequence', animated: true })
    }
  } else {
    for (const map of program.snapshot.match.maps) {
      if (map.status === 'finished') {
        targets.push({ mapId: map.name, purpose: 'sequence', animated: false })
      }
    }
  }

  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = `${target.mapId}:${target.purpose}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function stableSequenceFrame(
  manifest: MapMediaManifestV1,
  mapId: BPMapId,
  mediaRevision: number
): IntermissionNextMapMediaOutputFrame {
  const assetCount = mapMediaById(manifest, mapId).displayAssets.length
  return createStableIntermissionNextMapMediaOutputFrame(
    selectSequenceMapMedia(manifest, mapId, mediaRevision % assetCount),
    mediaRevision
  )
}

class VerifiedIntermissionNextMapMediaProviderImplementation
  implements VerifiedIntermissionNextMapMediaProvider
{
  constructor(
    private readonly manifest: MapMediaManifestV1,
    private readonly timeline: MapMediaTimelineInput
  ) {}

  async getMapMedia(
    request: IntermissionNextMapMediaProviderRequest
  ): Promise<readonly IntermissionNextMapMediaOutputFrame[]> {
    return mapMediaTargets(request.onAirProgram).map((target) =>
      target.animated
        ? createIntermissionNextMapMediaOutputFrame(
            mapMediaTimelineFrameAt(
              this.manifest,
              target.mapId,
              target.purpose,
              this.timeline,
              request.nowMs
            ),
            this.timeline
          )
        : stableSequenceFrame(this.manifest, target.mapId, this.timeline.mediaRevision)
    )
  }
}

export async function createVerifiedIntermissionNextMapMediaProvider(
  configurationValue: unknown
): Promise<VerifiedIntermissionNextMapMediaProvider> {
  const configuration = validateConfiguration(configurationValue)
  const manifest = await loadMapMediaManifestFile(configuration.manifestFilePath)
  await verifyMapMediaManifestFiles(manifest, configuration.assetRootPath)
  return new VerifiedIntermissionNextMapMediaProviderImplementation(manifest, {
    mediaRevision: configuration.mediaRevision,
    startedAtMs: configuration.startedAtMs,
    rotationIntervalMs: configuration.rotationIntervalMs,
    crossfadeDurationMs: configuration.crossfadeDurationMs
  })
}
