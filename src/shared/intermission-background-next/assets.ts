export interface GlobalBackgroundAssetV1 {
  version: 1
  id: string
  displayName: string
  streamUrl: string
  durationMs: number
  width: number
  height: number
  frameRate: number
  videoCodec: string
  audioCodec: string | null
  audioEnabled: boolean
  seamlessLoop: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function normalizeGlobalBackgroundAsset(value: unknown): GlobalBackgroundAssetV1 | null {
  if (!isRecord(value) || value.version !== 1) return null
  const id = nonEmptyString(value.id)
  const displayName = nonEmptyString(value.displayName)
  const streamUrl = nonEmptyString(value.streamUrl)
  const durationMs = positiveInteger(value.durationMs)
  const width = positiveInteger(value.width)
  const height = positiveInteger(value.height)
  const frameRate = positiveNumber(value.frameRate)
  const videoCodec = nonEmptyString(value.videoCodec)
  const audioCodec = value.audioCodec === null ? null : nonEmptyString(value.audioCodec)
  if (
    id === null ||
    displayName === null ||
    streamUrl === null ||
    durationMs === null ||
    width === null ||
    height === null ||
    frameRate === null ||
    videoCodec === null ||
    (value.audioCodec !== null && audioCodec === null) ||
    typeof value.audioEnabled !== 'boolean' ||
    typeof value.seamlessLoop !== 'boolean'
  ) {
    return null
  }
  return {
    version: 1,
    id,
    displayName,
    streamUrl,
    durationMs,
    width,
    height,
    frameRate,
    videoCodec,
    audioCodec,
    audioEnabled: audioCodec !== null && value.audioEnabled,
    seamlessLoop: value.seamlessLoop
  }
}

export function normalizeGlobalBackgroundAssets(value: unknown): GlobalBackgroundAssetV1[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null
  const assets = value.map(normalizeGlobalBackgroundAsset)
  if (assets.some((asset) => asset === null)) return null
  const normalized = assets as GlobalBackgroundAssetV1[]
  if (new Set(normalized.map((asset) => asset.id)).size !== normalized.length) return null
  return normalized
}
