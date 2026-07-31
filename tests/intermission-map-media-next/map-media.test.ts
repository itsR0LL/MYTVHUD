import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  loadMapMediaManifestFile,
  resolveMapMediaAssetPath,
  verifyMapMediaManifestFiles
} from '../../src/main/intermission-next/map-media'
import {
  fallbackAfterMapMediaLoadFailure,
  mapMediaTimelineFrameAt,
  selectHeroMapMedia,
  selectSequenceMapMedia,
  validateMapMediaManifest,
  type MapMediaManifestV1,
  type MapMediaTimelineInput
} from '../../src/shared/intermission-map-media-next'

const ASSET_ROOT_PATH = resolve(process.cwd(), 'src/main/intermission-next/assets/maps')
const MANIFEST_FILE_PATH = resolve(ASSET_ROOT_PATH, 'manifest.json')
const EXPECTED_MAP_IDS = [
  'de_ancient',
  'de_anubis',
  'de_dust2',
  'de_inferno',
  'de_mirage',
  'de_nuke',
  'de_overpass',
  'de_vertigo',
  'de_cache',
  'de_train'
]

let loadedManifest: Promise<MapMediaManifestV1> | null = null

function manifest(): Promise<MapMediaManifestV1> {
  loadedManifest ??= loadMapMediaManifestFile(MANIFEST_FILE_PATH)
  return loadedManifest
}

async function rawManifest(): Promise<Record<string, unknown>> {
  const manifestText = await readFile(MANIFEST_FILE_PATH, 'utf8')
  return JSON.parse(manifestText.replace(/^\uFEFF/, '')) as Record<string, unknown>
}

test('真实manifest严格覆盖项目当前十张地图和全部素材', async () => {
  const value = await manifest()
  assert.deepEqual(
    value.maps.map((map) => map.id),
    EXPECTED_MAP_IDS
  )
  assert.deepEqual(value.totals, {
    maps: 10,
    displayAssets: 51,
    componentAssets: 51,
    fallbackAssets: 10,
    bytes: 172_274_469
  })
  for (const map of value.maps) {
    assert.equal(map.fallback.width, 512)
    assert.equal(map.fallback.height, 512)
    assert.ok(map.displayAssets.length >= 1)
    for (const pair of map.displayAssets) {
      assert.equal(pair.display.width, 1920)
      assert.equal(pair.display.height, 1080)
      assert.equal(pair.component.width, 640)
      assert.equal(pair.component.height, 360)
      assert.equal(pair.component.derivedFrom, pair.display.localPath)
    }
  }
})

test('真实manifest中的112张图片通过存在性、尺寸、字节数和哈希校验', async () => {
  assert.deepEqual(await verifyMapMediaManifestFiles(await manifest(), ASSET_ROOT_PATH), {
    maps: 10,
    files: 112,
    bytes: 172_274_469
  })
})

test('manifest缺图、字段扩展、尺寸错误和越界路径均被拒绝', async () => {
  const missingMap = await rawManifest()
  ;(missingMap.maps as unknown[]).pop()
  assert.throws(() => validateMapMediaManifest(missingMap), /必须精确覆盖 10 张项目地图/)

  const extraField = await rawManifest()
  extraField.unexpected = true
  assert.throws(() => validateMapMediaManifest(extraField), /字段必须精确为/)

  const invalidDimension = await rawManifest()
  const invalidDimensionMaps = invalidDimension.maps as Array<Record<string, unknown>>
  const invalidDimensionPairs = invalidDimensionMaps[0].displayAssets as Array<
    Record<string, Record<string, unknown>>
  >
  invalidDimensionPairs[0].component.width = 641
  assert.throws(() => validateMapMediaManifest(invalidDimension), /必须等于 640/)

  const traversal = await rawManifest()
  const traversalMaps = traversal.maps as Array<Record<string, unknown>>
  const traversalFallback = traversalMaps[0].fallback as Record<string, unknown>
  traversalFallback.localPath = '../fallback.png'
  assert.throws(() => validateMapMediaManifest(traversal), /安全相对路径/)
})

test('地图序列只选择640×360组件图并绑定同地图回退图', async () => {
  const selection = selectSequenceMapMedia(await manifest(), 'de_dust2', 2)
  assert.equal(selection.purpose, 'sequence')
  assert.equal(selection.primary.localPath, 'de_dust2/component/de_dust2_3.jpg')
  assert.deepEqual([selection.primary.width, selection.primary.height], [640, 360])
  assert.equal(selection.fallback.localPath, 'de_dust2/fallback.png')
  assert.deepEqual([selection.fallback.width, selection.fallback.height], [512, 512])
})

test('大型当前或下一地图只选择1920×1080展示图', async () => {
  const selection = selectHeroMapMedia(await manifest(), 'de_mirage', 1)
  assert.equal(selection.purpose, 'hero')
  assert.equal(selection.primary.localPath, 'de_mirage/display/de_mirage_2_png.png')
  assert.deepEqual([selection.primary.width, selection.primary.height], [1920, 1080])
  assert.equal(selection.fallback.localPath, 'de_mirage/fallback.png')
})

test('主素材加载失败只回退到当前地图的512×512图标', async () => {
  const selection = selectHeroMapMedia(await manifest(), 'de_cache', 0)
  assert.deepEqual(
    fallbackAfterMapMediaLoadFailure(selection, selection.primary.localPath),
    selection.fallback
  )
  assert.throws(
    () => fallbackAfterMapMediaLoadFailure(selection, 'de_train/display/de_train_1_png.png'),
    /不属于当前主素材/
  )
})

test('显式媒体修订和主进程时间唯一确定索引、预载图和淡化进度', async () => {
  const timeline: MapMediaTimelineInput = {
    mediaRevision: 2,
    startedAtMs: 1_000,
    rotationIntervalMs: 10_000,
    crossfadeDurationMs: 2_000
  }
  const value = await manifest()
  const initial = mapMediaTimelineFrameAt(value, 'de_ancient', 'hero', timeline, 1_000)
  assert.equal(initial.current.assetIndex, 2)
  assert.equal(initial.preload?.assetIndex, 3)
  assert.equal(initial.crossfadeProgress, 0)

  const fading = mapMediaTimelineFrameAt(value, 'de_ancient', 'hero', timeline, 9_500)
  assert.equal(fading.current.assetIndex, 2)
  assert.equal(fading.preload?.assetIndex, 3)
  assert.equal(fading.crossfadeProgress, 0.25)

  const nextCycle = mapMediaTimelineFrameAt(value, 'de_ancient', 'hero', timeline, 11_000)
  assert.equal(nextCycle.current.assetIndex, 3)
  assert.equal(nextCycle.preload?.assetIndex, 4)
  assert.equal(nextCycle.crossfadeProgress, 0)
})

test('普通数据刷新和OBS重连在媒体修订不变时恢复相同帧', async () => {
  const timeline: MapMediaTimelineInput = {
    mediaRevision: 4,
    startedAtMs: 20_000,
    rotationIntervalMs: 12_000,
    crossfadeDurationMs: 1_500
  }
  const value = await manifest()
  const beforeRefresh = mapMediaTimelineFrameAt(value, 'de_overpass', 'sequence', timeline, 54_250)
  const afterRefresh = mapMediaTimelineFrameAt(value, 'de_overpass', 'sequence', timeline, 54_250)
  const afterReconnect = mapMediaTimelineFrameAt(value, 'de_overpass', 'sequence', timeline, 54_250)

  assert.deepEqual(afterRefresh, beforeRefresh)
  assert.deepEqual(afterReconnect, beforeRefresh)
  assert.notEqual(
    mapMediaTimelineFrameAt(
      value,
      'de_overpass',
      'sequence',
      { ...timeline, mediaRevision: timeline.mediaRevision + 1 },
      54_250
    ).current.assetIndex,
    beforeRefresh.current.assetIndex
  )
})

test('每个媒体时间轴帧只提供当前与预载两张主素材', async () => {
  const frame = mapMediaTimelineFrameAt(
    await manifest(),
    'de_anubis',
    'hero',
    {
      mediaRevision: 0,
      startedAtMs: 0,
      rotationIntervalMs: 8_000,
      crossfadeDurationMs: 1_000
    },
    3_000
  )
  const decodedPrimaryPaths = [
    frame.current.primary.localPath,
    frame.preload?.primary.localPath
  ].filter((path): path is string => typeof path === 'string')
  assert.equal(decodedPrimaryPaths.length, 2)
  assert.equal(new Set(decodedPrimaryPaths).size, 2)
})

test('轮换间隔和淡化时长必须由调用方传入有效值', async () => {
  const value = await manifest()
  assert.throws(
    () =>
      mapMediaTimelineFrameAt(
        value,
        'de_nuke',
        'hero',
        {
          mediaRevision: 0,
          startedAtMs: 0,
          rotationIntervalMs: 0,
          crossfadeDurationMs: 0
        },
        0
      ),
    /rotationIntervalMs/
  )
  assert.throws(
    () =>
      mapMediaTimelineFrameAt(
        value,
        'de_nuke',
        'hero',
        {
          mediaRevision: 0,
          startedAtMs: 0,
          rotationIntervalMs: 1_000,
          crossfadeDurationMs: 1_001
        },
        0
      ),
    /不得大于/
  )
})

test('主进程路径解析拒绝越出素材根目录', () => {
  assert.equal(
    resolveMapMediaAssetPath(ASSET_ROOT_PATH, 'de_train/fallback.png'),
    resolve(ASSET_ROOT_PATH, 'de_train/fallback.png')
  )
  assert.throws(
    () => resolveMapMediaAssetPath(ASSET_ROOT_PATH, '../outside.png'),
    /素材路径越出根目录/
  )
})
