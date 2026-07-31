import { join } from 'node:path'
import type { GlobalBackgroundAssetV1 } from '../../shared/intermission-background-next/assets'
import type { BackgroundVideoAsset } from './video-stream'

interface BundledBackgroundDescriptor {
  id: string
  displayName: string
  fileName: string
}

const BUNDLED_BACKGROUND_DESCRIPTORS: readonly BundledBackgroundDescriptor[] = [
  {
    id: 'background-video-1',
    displayName: '背景视频 1',
    fileName: '背景视频1.mp4'
  },
  {
    id: 'background-video-2',
    displayName: '背景视频 2',
    fileName: '背景视频2.mp4'
  },
  {
    id: 'background-video-3',
    displayName: '背景视频 3',
    fileName: '背景视频3.mp4'
  }
]

export function createBundledGlobalBackgroundAssets(): GlobalBackgroundAssetV1[] {
  return BUNDLED_BACKGROUND_DESCRIPTORS.map((descriptor) => ({
    version: 1,
    id: descriptor.id,
    displayName: descriptor.displayName,
    streamUrl: `/intermission-next/background/${descriptor.id}`,
    durationMs: 20_020,
    width: 3840,
    height: 2160,
    frameRate: 30_000 / 1_001,
    videoCodec: 'h264',
    audioCodec: null,
    audioEnabled: false,
    seamlessLoop: true
  }))
}

export function createBundledBackgroundFileRegistry(
  backgroundDirectory: string
): ReadonlyMap<string, BackgroundVideoAsset> {
  return new Map(
    BUNDLED_BACKGROUND_DESCRIPTORS.map((descriptor) => [
      descriptor.id,
      {
        filePath: join(backgroundDirectory, descriptor.fileName),
        mimeType: 'video/mp4'
      }
    ])
  )
}
