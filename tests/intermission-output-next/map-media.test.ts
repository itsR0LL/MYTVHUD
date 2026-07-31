import assert from 'node:assert/strict'
import test from 'node:test'
import { createIntermissionNextMapMediaOutputFrame } from '../../src/shared/intermission-output-next/map-media'

test('地图媒体输出使用固定本地资源路径并携带权威轮播边界', () => {
  const output = createIntermissionNextMapMediaOutputFrame(
    {
      mediaRevision: 4,
      elapsedMs: 8_000,
      cycleIndex: 1,
      timeInCycleMs: 2_000,
      current: {
        mapId: 'de_ancient',
        purpose: 'hero',
        assetIndex: 1,
        primary: {
          localPath: 'de_ancient/display/de_ancient_2_png.png',
          width: 1920,
          height: 1080,
          bytes: 100,
          sha256: 'a'.repeat(64)
        },
        fallback: {
          localPath: 'de_ancient/fallback.png',
          width: 512,
          height: 512,
          bytes: 50,
          sha256: 'b'.repeat(64)
        }
      },
      preload: {
        mapId: 'de_ancient',
        purpose: 'hero',
        assetIndex: 2,
        primary: {
          localPath: 'de_ancient/display/de_ancient_3_png.png',
          width: 1920,
          height: 1080,
          bytes: 100,
          sha256: 'c'.repeat(64)
        },
        fallback: {
          localPath: 'de_ancient/fallback.png',
          width: 512,
          height: 512,
          bytes: 50,
          sha256: 'b'.repeat(64)
        }
      },
      crossfadeProgress: 0.5
    },
    {
      mediaRevision: 4,
      startedAtMs: 100_000,
      rotationIntervalMs: 6_000,
      crossfadeDurationMs: 2_000
    }
  )

  assert.equal(
    output.current.url,
    '/intermission-next/assets/maps/de_ancient/display/de_ancient_2_png.png'
  )
  assert.equal(output.current.fallbackUrl, '/intermission-next/assets/maps/de_ancient/fallback.png')
  assert.equal(
    output.preload?.url,
    '/intermission-next/assets/maps/de_ancient/display/de_ancient_3_png.png'
  )
  assert.equal(output.crossfadeProgress, 0.5)
  assert.equal(output.frameStartedAtMs, 106_000)
  assert.equal(output.frameEndAtMs, 112_000)
  assert.equal(output.crossfadeStartedAtMs, 110_000)
  assert.equal(output.crossfadeDurationMs, 2_000)
})
