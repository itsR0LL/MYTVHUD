import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  createBundledBackgroundFileRegistry,
  createBundledGlobalBackgroundAssets
} from '../../src/main/intermission-background-next/bundled-assets'

const backgroundDirectory = resolve(process.cwd(), 'src/main/intermission-next/assets/backgrounds')

test('三段正式背景素材使用实测媒体参数并固定循环顺序', () => {
  const assets = createBundledGlobalBackgroundAssets()
  assert.deepEqual(
    assets.map((asset) => asset.id),
    ['background-video-1', 'background-video-2', 'background-video-3']
  )

  for (const asset of assets) {
    assert.equal(asset.durationMs, 20_020)
    assert.equal(asset.width, 1920)
    assert.equal(asset.height, 1080)
    assert.equal(asset.frameRate, 30_000 / 1_001)
    assert.equal(asset.videoCodec, 'h264')
    assert.equal(asset.audioCodec, null)
    assert.equal(asset.audioEnabled, false)
    assert.equal(asset.seamlessLoop, true)
  }
})

test('三段视频均从项目内正式素材目录提供', () => {
  const registry = createBundledBackgroundFileRegistry(backgroundDirectory)
  const expectedFiles = [
    ['background-video-1', '背景视频1.mp4', 23_751_969],
    ['background-video-2', '背景视频2.mp4', 19_474_859],
    ['background-video-3', '背景视频3.mp4', 15_812_883]
  ] as const

  for (const [assetId, fileName, byteLength] of expectedFiles) {
    const entry = registry.get(assetId)
    assert.ok(entry)
    assert.equal(entry.filePath, join(backgroundDirectory, fileName))
    assert.equal(entry.mimeType, 'video/mp4')
    assert.equal(statSync(entry.filePath).size, byteLength)
    assert.ok(byteLength < 24_000_000)
  }
})
