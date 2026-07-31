import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import {
  validateMapMediaManifest,
  type MapMediaManifestV1
} from '../../../shared/intermission-map-media-next'

export interface MapMediaFileVerificationSummary {
  maps: number
  files: number
  bytes: number
}

export class MapMediaFileValidationError extends Error {
  constructor(
    readonly localPath: string,
    message: string
  ) {
    super(`${localPath}: ${message}`)
    this.name = 'MapMediaFileValidationError'
  }
}

interface ExpectedMapMediaFile {
  localPath: string
  width: number
  height: number
  bytes: number
  sha256: string
  format: 'png' | 'jpeg'
}

interface ImageDimensions {
  width: number
  height: number
  format: 'png' | 'jpeg'
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
])

function detectPngDimensions(data: Buffer): ImageDimensions | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (data.length < 24 || !data.subarray(0, 8).equals(signature)) return null
  if (data.toString('ascii', 12, 16) !== 'IHDR') return null
  const width = data.readUInt32BE(16)
  const height = data.readUInt32BE(20)
  return width > 0 && height > 0 ? { width, height, format: 'png' } : null
}

function detectJpegDimensions(data: Buffer): ImageDimensions | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null
  let offset = 2
  while (offset < data.length) {
    while (offset < data.length && data[offset] !== 0xff) offset += 1
    while (offset < data.length && data[offset] === 0xff) offset += 1
    if (offset >= data.length) return null
    const marker = data[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (marker === 0xd9 || marker === 0xda || offset + 2 > data.length) return null
    const segmentLength = data.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > data.length) return null
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) return null
      const height = data.readUInt16BE(offset + 3)
      const width = data.readUInt16BE(offset + 5)
      return width > 0 && height > 0 ? { width, height, format: 'jpeg' } : null
    }
    offset += segmentLength
  }
  return null
}

function detectImageDimensions(data: Buffer, localPath: string): ImageDimensions {
  const dimensions = detectPngDimensions(data) ?? detectJpegDimensions(data)
  if (!dimensions) {
    throw new MapMediaFileValidationError(localPath, '无法识别PNG或JPEG尺寸')
  }
  return dimensions
}

function expectedFiles(manifest: MapMediaManifestV1): ExpectedMapMediaFile[] {
  const files: ExpectedMapMediaFile[] = []
  for (const map of manifest.maps) {
    files.push({
      localPath: map.fallback.localPath,
      width: map.fallback.width,
      height: map.fallback.height,
      bytes: map.fallback.bytes,
      sha256: map.fallback.sha256,
      format: 'png'
    })
    for (const pair of map.displayAssets) {
      files.push({
        localPath: pair.display.localPath,
        width: pair.display.width,
        height: pair.display.height,
        bytes: pair.display.bytes,
        sha256: pair.display.sha256,
        format: 'png'
      })
      files.push({
        localPath: pair.component.localPath,
        width: pair.component.width,
        height: pair.component.height,
        bytes: pair.component.bytes,
        sha256: pair.component.sha256,
        format: 'jpeg'
      })
    }
  }
  return files
}

export function resolveMapMediaAssetPath(assetRootPath: string, localPath: string): string {
  const root = resolve(assetRootPath)
  const target = resolve(root, localPath)
  const relativePath = relative(root, target)
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath === '..' ||
    relativePath.startsWith(`..\\`) ||
    relativePath.startsWith('../')
  ) {
    throw new MapMediaFileValidationError(localPath, '素材路径越出根目录')
  }
  return target
}

export async function loadMapMediaManifestFile(
  manifestFilePath: string
): Promise<MapMediaManifestV1> {
  let parsed: unknown
  try {
    const manifestText = await readFile(manifestFilePath, 'utf8')
    parsed = JSON.parse(manifestText.replace(/^\uFEFF/, ''))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new MapMediaFileValidationError(manifestFilePath, `无法读取清单：${message}`)
  }
  return validateMapMediaManifest(parsed)
}

export async function verifyMapMediaManifestFiles(
  manifest: MapMediaManifestV1,
  assetRootPath: string
): Promise<MapMediaFileVerificationSummary> {
  const files = expectedFiles(manifest)
  const usedPaths = new Set<string>()
  let bytes = 0

  for (const file of files) {
    if (usedPaths.has(file.localPath)) {
      throw new MapMediaFileValidationError(file.localPath, '本地素材路径重复')
    }
    usedPaths.add(file.localPath)
    const filePath = resolveMapMediaAssetPath(assetRootPath, file.localPath)
    let fileStat
    try {
      fileStat = await stat(filePath)
    } catch {
      throw new MapMediaFileValidationError(file.localPath, '文件不存在')
    }
    if (!fileStat.isFile()) {
      throw new MapMediaFileValidationError(file.localPath, '不是普通文件')
    }
    if (fileStat.size !== file.bytes) {
      throw new MapMediaFileValidationError(
        file.localPath,
        `字节数不符，清单为 ${file.bytes}，实际为 ${fileStat.size}`
      )
    }

    const data = await readFile(filePath)
    const dimensions = detectImageDimensions(data, file.localPath)
    if (
      dimensions.width !== file.width ||
      dimensions.height !== file.height ||
      dimensions.format !== file.format
    ) {
      throw new MapMediaFileValidationError(
        file.localPath,
        `图像信息不符，清单为 ${file.format} ${file.width}x${file.height}，实际为 ${dimensions.format} ${dimensions.width}x${dimensions.height}`
      )
    }
    const hash = createHash('sha256').update(data).digest('hex')
    if (hash !== file.sha256) {
      throw new MapMediaFileValidationError(file.localPath, 'SHA-256不符')
    }
    bytes += fileStat.size
  }

  if (
    files.length !==
    manifest.totals.displayAssets + manifest.totals.componentAssets + manifest.totals.fallbackAssets
  ) {
    throw new MapMediaFileValidationError('manifest.totals', '文件总数与清单统计不符')
  }
  if (bytes !== manifest.totals.bytes) {
    throw new MapMediaFileValidationError(
      'manifest.totals.bytes',
      `素材总字节数不符，清单为 ${manifest.totals.bytes}，实际为 ${bytes}`
    )
  }

  return {
    maps: manifest.maps.length,
    files: files.length,
    bytes
  }
}
