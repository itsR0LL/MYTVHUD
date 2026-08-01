import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  createVerifiedIntermissionNextMapMediaProvider,
  IntermissionNextMapMediaProviderConfigurationError,
  type VerifiedIntermissionNextMapMediaProviderConfiguration
} from '../../src/main/intermission-next/map-media'
import type { IntermissionNextMapMediaProvider as CoordinatorMapMediaProvider } from '../../src/main/intermission-next/state/coordinator'
import type { BroadcastProgram, BroadcastProgramType } from '../../src/shared/broadcast-flow'
import type { MatchMapRecord } from '../../src/shared/match-session'

const ASSET_ROOT_PATH = resolve(process.cwd(), 'src/main/intermission-next/assets/maps')
const MANIFEST_FILE_PATH = resolve(ASSET_ROOT_PATH, 'manifest.json')
const CONFIGURATION: VerifiedIntermissionNextMapMediaProviderConfiguration = {
  manifestFilePath: MANIFEST_FILE_PATH,
  assetRootPath: ASSET_ROOT_PATH,
  mediaRevision: 2,
  startedAtMs: 1_000,
  rotationIntervalMs: 10_000,
  crossfadeDurationMs: 2_000
}

let loadedProvider: Promise<CoordinatorMapMediaProvider> | null = null

function provider(): Promise<CoordinatorMapMediaProvider> {
  loadedProvider ??= createVerifiedIntermissionNextMapMediaProvider(CONFIGURATION)
  return loadedProvider
}

function matchMap(name: MatchMapRecord['name'], status: MatchMapRecord['status']): MatchMapRecord {
  return {
    name,
    pickby: '',
    decider: false,
    ascore: 0,
    bscore: 0,
    aid: 'team-a',
    bid: 'team-b',
    status
  }
}

function program(
  type: BroadcastProgramType,
  options: {
    sourceMapId?: BroadcastProgram['sourceMapId']
    nextMapId?: BroadcastProgram['snapshot']['nextMapId']
    maps?: MatchMapRecord[]
  } = {}
): BroadcastProgram {
  return {
    id: `${type}-program`,
    type,
    createdAtMs: 1,
    sourceMatchId: 'match-1',
    sourceMapId: options.sourceMapId ?? '',
    snapshot: {
      match: {
        id: 'match-1',
        type: 'BO3',
        team_a: { id: 'team-a', name: '战队A', name_ingame: 'Team A' },
        team_b: { id: 'team-b', name: '战队B', name_ingame: 'Team B' },
        bpSequence: [],
        maps: options.maps ?? []
      },
      seriesScore: { teamA: 0, teamB: 0 },
      scoreOverride: { enabled: false, teamA: 0, teamB: 0 },
      lastFinishedMapId: '',
      nextMapId: options.nextMapId ?? '',
      seriesEnded: type !== 'map_break',
      mapSnapshots: {},
      nextMatch: null
    },
    issues: [],
    segments: []
  }
}

test('map_break只为下一张地图输出hero帧并为全系列赛输出动态sequence帧', async () => {
  const value = await provider()
  const frames = await value.getMapMedia({
    onAirProgram: program('map_break', {
      sourceMapId: 'de_mirage',
      nextMapId: 'de_nuke',
      maps: [
        matchMap('de_mirage', 'finished'),
        matchMap('de_nuke', 'pending'),
        matchMap('de_dust2', 'pending')
      ]
    }),
    nowMs: 9_500
  })

  assert.deepEqual(
    frames.map((frame) => [frame.mapId, frame.purpose]),
    [
      ['de_nuke', 'hero'],
      ['de_mirage', 'sequence'],
      ['de_nuke', 'sequence'],
      ['de_dust2', 'sequence']
    ]
  )
  assert.deepEqual(
    frames.map((frame) => [frame.current.width, frame.current.height]),
    [
      [1920, 1080],
      [640, 360],
      [640, 360],
      [640, 360]
    ]
  )
  assert.deepEqual(
    frames.map((frame) => frame.crossfadeProgress),
    [0.25, 0.25, 0.25, 0.25]
  )
  assert.deepEqual(
    frames.map((frame) => [
      frame.frameStartedAtMs,
      frame.frameEndAtMs,
      frame.crossfadeStartedAtMs,
      frame.crossfadeDurationMs
    ]),
    [
      [1_000, 11_000, 9_000, 2_000],
      [1_000, 11_000, 9_000, 2_000],
      [1_000, 11_000, 9_000, 2_000],
      [1_000, 11_000, 9_000, 2_000]
    ]
  )
})

test('map_break没有nextMapId时不输出hero帧，有nextMapId时仅输出该地图hero帧', async () => {
  const value = await provider()
  const withoutNextMap = await value.getMapMedia({
    onAirProgram: program('map_break', { sourceMapId: 'de_dust2' }),
    nowMs: 1_000
  })
  const duplicateTarget = await value.getMapMedia({
    onAirProgram: program('map_break', {
      sourceMapId: 'de_dust2',
      nextMapId: 'de_dust2'
    }),
    nowMs: 1_000
  })

  assert.deepEqual(
    withoutNextMap.map((frame) => [frame.mapId, frame.purpose]),
    []
  )
  assert.deepEqual(
    duplicateTarget.map((frame) => [frame.mapId, frame.purpose]),
    [['de_dust2', 'hero']]
  )
})

test('series_end只按比赛顺序输出finished地图的sequence帧', async () => {
  const value = await provider()
  const onAirProgram = program('series_end', {
    maps: [
      matchMap('de_ancient', 'finished'),
      matchMap('de_anubis', 'live'),
      matchMap('de_dust2', 'pending'),
      matchMap('de_inferno', 'finished'),
      matchMap('de_ancient', 'finished')
    ]
  })
  const frames = await value.getMapMedia({
    onAirProgram,
    nowMs: 1_000
  })
  const afterTimeProgress = await value.getMapMedia({
    onAirProgram,
    nowMs: 91_000
  })

  assert.deepEqual(
    frames.map((frame) => [frame.mapId, frame.purpose]),
    [
      ['de_ancient', 'sequence'],
      ['de_inferno', 'sequence']
    ]
  )
  assert.deepEqual(
    frames.map((frame) => [frame.current.width, frame.current.height]),
    [
      [640, 360],
      [640, 360]
    ]
  )
  assert.deepEqual(
    frames.map((frame) => frame.mediaRevision),
    [CONFIGURATION.mediaRevision, CONFIGURATION.mediaRevision]
  )
  assert.equal(
    frames.every((frame) => frame.preload === null),
    true
  )
  assert.equal(
    frames.every((frame) => frame.crossfadeProgress === 0),
    true
  )
  assert.equal(
    frames.every(
      (frame) =>
        frame.frameStartedAtMs === null &&
        frame.frameEndAtMs === null &&
        frame.crossfadeStartedAtMs === null &&
        frame.crossfadeDurationMs === 0
    ),
    true
  )
  assert.deepEqual(afterTimeProgress, frames)
})

test('standby不从历史地图或nextMapId推导媒体', async () => {
  const value = await provider()
  const frames = await value.getMapMedia({
    onAirProgram: program('standby', {
      sourceMapId: 'de_mirage',
      nextMapId: 'de_nuke',
      maps: [matchMap('de_ancient', 'finished')]
    }),
    nowMs: 20_000
  })

  assert.deepEqual(frames, [])
})

test('相同配置和nowMs在重新创建provider后生成完全相同的帧', async () => {
  const first = await provider()
  const reconnected = await createVerifiedIntermissionNextMapMediaProvider(CONFIGURATION)
  const request = {
    onAirProgram: program('map_break', {
      sourceMapId: 'de_overpass',
      nextMapId: 'de_train'
    }),
    nowMs: 54_250
  }

  assert.deepEqual(await reconnected.getMapMedia(request), await first.getMapMedia(request))
})

test('四项时间线配置缺失或无效时逐项明确失败且不设置默认值', async () => {
  const missingFields = [
    'mediaRevision',
    'startedAtMs',
    'rotationIntervalMs',
    'crossfadeDurationMs'
  ] as const
  for (const field of missingFields) {
    const configuration = { ...CONFIGURATION } as Record<string, unknown>
    delete configuration[field]
    await assert.rejects(
      createVerifiedIntermissionNextMapMediaProvider(configuration),
      (error) =>
        error instanceof IntermissionNextMapMediaProviderConfigurationError && error.field === field
    )
  }

  for (const [field, value] of [
    ['mediaRevision', -1],
    ['startedAtMs', -1],
    ['rotationIntervalMs', 0],
    ['crossfadeDurationMs', -1],
    ['crossfadeDurationMs', CONFIGURATION.rotationIntervalMs + 1]
  ] as const) {
    await assert.rejects(
      createVerifiedIntermissionNextMapMediaProvider({
        ...CONFIGURATION,
        [field]: value
      }),
      (error) =>
        error instanceof IntermissionNextMapMediaProviderConfigurationError && error.field === field
    )
  }
})
