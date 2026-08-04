import assert from 'node:assert/strict'
import test from 'node:test'
import type { CSGO } from '../src/main/csgo-extended'
import {
  buildActiveMatchScoreUpdate,
  resolveActiveMatchTeamSides
} from '../src/main/gsi/match-runtime'
import { LatestFrameProcessor } from '../src/main/gsi/latest-frame-processor'
import { UtilityReplayCapture } from '../src/main/gsi/utility-replay-capture'
import {
  BP_SERIES_ACTION_ORDER,
  isBPSequenceComplete,
  normalizeBPState,
  type BPAction,
  type BPMapId,
  type BPMatchType,
  type BPSequenceItem,
  type BPTeam
} from '../src/shared/bp'
import {
  MAP_BREAK_DURATION_PRESETS_MS,
  normalizeBroadcastRuntime,
  programContentTypes
} from '../src/shared/broadcast-flow'
import { projectWorldPositionToRadar } from '../src/shared/radar'
import { PlayerHeadshotTracker } from '../src/shared/player-headshot-tracker'
import {
  createEmptyMapUtilityReplay,
  finalizeMapUtilityReplay,
  normalizeMapUtilityReplay
} from '../src/shared/utility-replay'
import {
  aggregateSeriesPlayerStats,
  calculateMatchSeriesScore,
  calculateNextMapId,
  calculateNextMapIdFromSnapshots,
  calculateSnapshotSeriesScore,
  createMatchMapsFromBP,
  matchSeriesHasEnded,
  normalizeMatchRuntime,
  normalizeMatchRecord,
  snapshotSeriesHasEnded,
  type MapFinalSnapshot,
  type MatchMapRecord
} from '../src/shared/match-session'
import {
  createDefaultBroadcastDirectorRuntime,
  resolveBroadcastDirectorAdvance
} from '../src/shared/broadcast-director'
import {
  createDefaultIntermissionTestModeState,
  nextIntermissionTestStage
} from '../src/shared/intermission-test-mode'
import { normalizeIntermissionState } from '../src/shared/intermission'
import {
  buildAliveSituation,
  buildEconomySummary,
  normalizeFlashOpacity,
  parseHlaePlayerDeathMessage
} from '../src/shared/gameplay-hud'

const MAP_IDS: BPMapId[] = [
  'de_ancient',
  'de_anubis',
  'de_dust2',
  'de_inferno',
  'de_mirage',
  'de_nuke',
  'de_overpass'
]

const TEAM_A: BPTeam = { id: 'team-a', name: '战队一', name_ingame: 'TEAM A' }
const TEAM_B: BPTeam = { id: 'team-b', name: '战队二', name_ingame: 'TEAM B' }

function completeSequence(type: BPMatchType): BPSequenceItem[] {
  return BP_SERIES_ACTION_ORDER[type].map((action: BPAction, index) => ({
    map: MAP_IDS[index],
    action,
    actor: action === 'decider' ? '' : index % 2 === 0 ? 'team_a' : 'team_b',
    startingSide: action === 'pick' ? (index % 2 === 0 ? 'CT' : 'T') : ''
  }))
}

function matchMap(
  name: BPMapId,
  status: MatchMapRecord['status'],
  ascore: number,
  bscore: number
): MatchMapRecord {
  return {
    name,
    pickby: '',
    decider: false,
    ascore,
    bscore,
    aid: TEAM_A.id,
    bid: TEAM_B.id,
    status
  }
}

function snapshotFromMap(map: MatchMapRecord, mapIndex: number): MapFinalSnapshot {
  return {
    mapId: map.name,
    mapIndex,
    capturedAtMs: mapIndex + 1,
    teamAScore: map.ascore,
    teamBScore: map.bscore,
    roundCount: map.ascore + map.bscore,
    seriesScoreAfterMap: { teamA: 0, teamB: 0 },
    players: []
  }
}

test('BO1、BO3、BO5 完整七步 BP 均通过固定顺序校验', () => {
  for (const type of ['BO1', 'BO3', 'BO5'] as const) {
    assert.equal(isBPSequenceComplete(completeSequence(type), type), true)
  }
})

test('统一播出导演台从空闲状态手动进入暖场', () => {
  const runtime = createDefaultBroadcastDirectorRuntime(1)
  assert.deepEqual(
    resolveBroadcastDirectorAdvance(runtime, {
      bpReady: false,
      preparedProgramId: null,
      preparedProgramType: null
    }),
    {
      allowed: true,
      targetStage: 'warmup',
      actionLabel: '开始暖场',
      reason: ''
    }
  )
})

test('暖场只有在完整 BP 已准备后才能进入 BP 展示', () => {
  const runtime = {
    ...createDefaultBroadcastDirectorRuntime(1),
    stage: 'warmup' as const
  }
  assert.equal(
    resolveBroadcastDirectorAdvance(runtime, {
      bpReady: false,
      preparedProgramId: null,
      preparedProgramType: null
    }).allowed,
    false
  )
  assert.equal(
    resolveBroadcastDirectorAdvance(runtime, {
      bpReady: true,
      preparedProgramId: null,
      preparedProgramType: null
    }).targetStage,
    'bp'
  )
})

test('比赛阶段只允许使用尚未消费的地图结束节目', () => {
  const runtime = {
    ...createDefaultBroadcastDirectorRuntime(1),
    hiddenReason: 'gameplay' as const,
    consumedProgramId: 'program-1'
  }
  const repeated = resolveBroadcastDirectorAdvance(runtime, {
    bpReady: true,
    preparedProgramId: 'program-1',
    preparedProgramType: 'map_break'
  })
  const next = resolveBroadcastDirectorAdvance(runtime, {
    bpReady: true,
    preparedProgramId: 'program-2',
    preparedProgramType: 'series_end'
  })
  assert.equal(repeated.allowed, false)
  assert.equal(next.targetStage, 'series_end')
})

test('赛事待机只能由导播手动进入下一场暖场', () => {
  const runtime = {
    ...createDefaultBroadcastDirectorRuntime(1),
    stage: 'standby' as const
  }
  assert.equal(
    resolveBroadcastDirectorAdvance(runtime, {
      bpReady: true,
      preparedProgramId: null,
      preparedProgramType: null
    }).targetStage,
    'warmup'
  )
})

test('无比赛测试状态默认关闭且完整页面顺序不依赖比赛数据', () => {
  assert.deepEqual(createDefaultIntermissionTestModeState(100), {
    version: 1,
    enabled: false,
    stage: 'hidden',
    stageStartedAtMs: 100,
    revision: 0,
    visibleStageCount: 0
  })
  assert.deepEqual(
    ['hidden', 'warmup', 'bp', 'map_break', 'series_end', 'standby'].map((stage) =>
      nextIntermissionTestStage(stage as Parameters<typeof nextIntermissionTestStage>[0])
    ),
    ['warmup', 'bp', 'map_break', 'series_end', 'standby', 'warmup']
  )
})

test('BP 动作顺序被修改后拒绝完成状态', () => {
  const sequence = completeSequence('BO3')
  sequence[0] = { ...sequence[0], action: 'pick', startingSide: 'CT' }
  assert.equal(isBPSequenceComplete(sequence, 'BO3'), false)
})

test('BP 播放起点只接受明确的非负整数时间戳', () => {
  assert.equal(
    normalizeBPState({ playbackStarted: true, playbackStartedAtMs: null }).playbackStartedAtMs,
    null
  )
  assert.equal(
    normalizeBPState({ playbackStarted: true, playbackStartedAtMs: '1000' }).playbackStartedAtMs,
    null
  )
  assert.equal(
    normalizeBPState({ playbackStarted: true, playbackStartedAtMs: 1_000 }).playbackStartedAtMs,
    1_000
  )
  assert.equal(
    normalizeBPState({ playbackStarted: false, playbackStartedAtMs: 1_000 }).playbackStartedAtMs,
    null
  )
})

test('完整 BP 只按顺序生成选用图和决胜图', () => {
  const maps = createMatchMapsFromBP(completeSequence('BO3'), 'BO3', TEAM_A.id, TEAM_B.id)
  assert.deepEqual(
    maps.map((map) => ({ name: map.name, pickby: map.pickby, decider: map.decider })),
    [
      { name: MAP_IDS[2], pickby: String(TEAM_A.id), decider: false },
      { name: MAP_IDS[3], pickby: String(TEAM_B.id), decider: false },
      { name: MAP_IDS[6], pickby: '', decider: true }
    ]
  )
})

test('BO3 打满前正确计算系列赛比分和下一张地图', () => {
  const maps = [
    matchMap('de_ancient', 'finished', 13, 11),
    matchMap('de_anubis', 'finished', 10, 13),
    matchMap('de_dust2', 'pending', 0, 0)
  ]
  assert.deepEqual(calculateMatchSeriesScore(maps, 'BO3'), { teamA: 1, teamB: 1 })
  assert.equal(matchSeriesHasEnded(maps, 'BO3'), false)
  assert.equal(calculateNextMapId(maps, 'BO3', 'de_anubis'), 'de_dust2')
})

test('BO3 以 2:0 结束后不再生成下一张地图', () => {
  const maps = [
    matchMap('de_ancient', 'finished', 13, 8),
    matchMap('de_anubis', 'finished', 13, 11),
    matchMap('de_dust2', 'pending', 0, 0)
  ]
  assert.deepEqual(calculateMatchSeriesScore(maps, 'BO3'), { teamA: 2, teamB: 0 })
  assert.equal(matchSeriesHasEnded(maps, 'BO3'), true)
  assert.equal(calculateNextMapId(maps, 'BO3', 'de_anubis'), '')
})

test('自动化系列赛只统计存在最终快照的已结束地图', () => {
  const maps = [
    matchMap('de_ancient', 'finished', 13, 8),
    matchMap('de_anubis', 'finished', 13, 11),
    matchMap('de_dust2', 'pending', 0, 0)
  ]
  const firstSnapshot: MapFinalSnapshot = {
    mapId: 'de_ancient',
    mapIndex: 0,
    capturedAtMs: 1,
    teamAScore: 13,
    teamBScore: 8,
    roundCount: 21,
    seriesScoreAfterMap: { teamA: 1, teamB: 0 },
    players: []
  }
  const snapshots = { de_ancient: firstSnapshot }
  assert.deepEqual(calculateSnapshotSeriesScore(maps, snapshots, 'BO3'), { teamA: 1, teamB: 0 })
  assert.equal(snapshotSeriesHasEnded(maps, snapshots, 'BO3'), false)
  assert.equal(calculateNextMapIdFromSnapshots(maps, snapshots, 'BO3', 'de_ancient'), '')
})

test('BO5 打满五张时按三胜条件结束', () => {
  const maps = [
    matchMap('de_ancient', 'finished', 13, 9),
    matchMap('de_anubis', 'finished', 10, 13),
    matchMap('de_dust2', 'finished', 13, 7),
    matchMap('de_inferno', 'finished', 11, 13),
    matchMap('de_mirage', 'finished', 16, 14)
  ]
  assert.deepEqual(calculateMatchSeriesScore(maps, 'BO5'), { teamA: 3, teamB: 2 })
  assert.equal(matchSeriesHasEnded(maps, 'BO5'), true)
})

test('BO1、BO3 2:1 与 BO5 3:0/3:1/3:2 均按最终快照判定结束', () => {
  const cases: Array<{
    type: BPMatchType
    scores: Array<[number, number]>
    expected: { teamA: number; teamB: number }
  }> = [
    { type: 'BO1', scores: [[13, 9]], expected: { teamA: 1, teamB: 0 } },
    {
      type: 'BO3',
      scores: [
        [13, 9],
        [10, 13],
        [13, 11]
      ],
      expected: { teamA: 2, teamB: 1 }
    },
    {
      type: 'BO5',
      scores: [
        [13, 8],
        [13, 10],
        [13, 11]
      ],
      expected: { teamA: 3, teamB: 0 }
    },
    {
      type: 'BO5',
      scores: [
        [13, 8],
        [9, 13],
        [13, 7],
        [13, 11]
      ],
      expected: { teamA: 3, teamB: 1 }
    },
    {
      type: 'BO5',
      scores: [
        [13, 8],
        [9, 13],
        [13, 7],
        [11, 13],
        [16, 14]
      ],
      expected: { teamA: 3, teamB: 2 }
    }
  ]
  for (const item of cases) {
    const maps = item.scores.map(([scoreA, scoreB], index) =>
      matchMap(MAP_IDS[index], 'finished', scoreA, scoreB)
    )
    const snapshots = Object.fromEntries(
      maps.map((map, index) => [map.name, snapshotFromMap(map, index)])
    ) as Partial<Record<BPMapId, MapFinalSnapshot>>
    assert.deepEqual(calculateSnapshotSeriesScore(maps, snapshots, item.type), item.expected)
    assert.equal(snapshotSeriesHasEnded(maps, snapshots, item.type), true)
  }
})

test('系列赛选手数据按 SteamID 跨已完成地图汇总', () => {
  const maps = [
    matchMap('de_ancient', 'finished', 13, 8),
    matchMap('de_anubis', 'finished', 10, 13),
    matchMap('de_dust2', 'pending', 0, 0)
  ]
  const player = {
    steamid: '76561198000000001',
    teamId: String(TEAM_A.id),
    name: '选手一',
    kills: 20,
    assists: 5,
    deaths: 10,
    mvps: 3,
    score: 45,
    headshots: 11,
    adr: 90
  }
  const snapshots: Partial<Record<BPMapId, MapFinalSnapshot>> = {
    de_ancient: {
      mapId: 'de_ancient',
      mapIndex: 0,
      capturedAtMs: 1,
      teamAScore: 13,
      teamBScore: 8,
      roundCount: 21,
      seriesScoreAfterMap: { teamA: 1, teamB: 0 },
      players: [player]
    },
    de_anubis: {
      mapId: 'de_anubis',
      mapIndex: 1,
      capturedAtMs: 2,
      teamAScore: 10,
      teamBScore: 13,
      roundCount: 23,
      seriesScoreAfterMap: { teamA: 1, teamB: 1 },
      players: [{ ...player, kills: 18, assists: 7, deaths: 14, mvps: 2, score: 39, headshots: 8 }]
    }
  }
  assert.deepEqual(aggregateSeriesPlayerStats(maps, snapshots), [
    {
      ...player,
      kills: 38,
      assists: 12,
      deaths: 24,
      mvps: 5,
      score: 84,
      headshots: 19,
      adr: null,
      mapsPlayed: 2
    }
  ])
})

test('爆头击杀只在对局阶段累计并忽略冻结期残留值', () => {
  const tracker = new PlayerHeadshotTracker()
  const frame = (
    completedRoundCount: number,
    roundPhase: string,
    countdownPhase: string,
    first: { kills: number; headshots: number },
    second: { kills: number; headshots: number },
    mapPhase = 'live'
  ) => ({
    map: { name: 'de_ancient', phase: mapPhase, round: completedRoundCount },
    round: { phase: roundPhase },
    phase_countdowns: { phase: countdownPhase },
    players: [
      {
        steamid: 'steam-a',
        state: { round_kills: first.kills, round_killhs: first.headshots }
      },
      {
        steamid: 'steam-b',
        state: { round_kills: second.kills, round_killhs: second.headshots }
      }
    ]
  })

  tracker.capture(frame(0, 'live', 'live', { kills: 1, headshots: 1 }, { kills: 0, headshots: 0 }))
  tracker.capture(frame(1, 'over', 'over', { kills: 1, headshots: 1 }, { kills: 1, headshots: 1 }))
  tracker.capture(
    frame(1, 'freezetime', 'freezetime', { kills: 1, headshots: 1 }, { kills: 1, headshots: 1 })
  )
  tracker.capture(frame(1, 'live', 'live', { kills: 0, headshots: 0 }, { kills: 2, headshots: 1 }))
  tracker.capture(frame(2, 'over', 'over', { kills: 1, headshots: 2 }, { kills: 2, headshots: 1 }))
  tracker.capture(
    frame(2, 'live', 'warmup', { kills: 5, headshots: 5 }, { kills: 5, headshots: 5 }, 'warmup')
  )

  assert.equal(tracker.total('de_ancient', 'steam-a'), 2)
  assert.equal(tracker.total('de_ancient', 'steam-b'), 2)
  tracker.clear()
  assert.equal(tracker.total('de_ancient', 'steam-a'), 0)
})

test('道具回放内容在地图间和系列赛结束流程中均存在且位于待机之前', () => {
  assert.equal(programContentTypes('map_break', false).includes('map_utility_replay'), true)
  const seriesEnd = programContentTypes('series_end', false)
  assert.equal(seriesEnd.includes('map_utility_replay'), true)
  assert.ok(seriesEnd.indexOf('map_utility_replay') < seriesEnd.indexOf('standby'))
  assert.equal(programContentTypes('series_end', true).at(-1), 'standby')
})

test('现有 HUD 雷达坐标精确转换为可直接绘制坐标', () => {
  assert.deepEqual(projectWorldPositionToRadar('de_mirage', [0, 0, 0]), [645.72, 340.3])
  assert.deepEqual(projectWorldPositionToRadar('de_nuke', [0, 0, 0]), [473.12, 165.74])
  assert.deepEqual(projectWorldPositionToRadar('de_nuke', [0, 0, -451]), [473.66, 638.3])
})

test('地图道具回放在正式回合齐全时可播放并保留未归属道具数量', () => {
  const replay = createEmptyMapUtilityReplay('de_mirage')
  replay.rounds = [
    {
      roundIndex: 1,
      teamCTId: String(TEAM_A.id),
      teamTId: String(TEAM_B.id),
      unassignedGrenadeCount: 0
    },
    {
      roundIndex: 2,
      teamCTId: String(TEAM_B.id),
      teamTId: String(TEAM_A.id),
      unassignedGrenadeCount: 0
    }
  ]
  replay.events = [
    {
      id: '1:smoke:1',
      grenadeId: '1',
      roundIndex: 1,
      teamId: String(TEAM_A.id),
      side: 'CT',
      type: 'smoke',
      trajectory: [
        [0, 640, 340],
        [500, 680, 380]
      ],
      flameFrames: [],
      effectStartedAtMs: 500,
      effectEndedAtMs: 17_000,
      explodedAtMs: null,
      endedAtMs: 17_000
    }
  ]
  const complete = finalizeMapUtilityReplay(replay, 2)
  assert.equal(complete.complete, true)
  assert.equal(normalizeMapUtilityReplay(complete)?.complete, true)
  complete.rounds[1].unassignedGrenadeCount = 1
  const replayWithSkippedUtility = finalizeMapUtilityReplay(complete, 2)
  assert.equal(replayWithSkippedUtility.complete, true)
  assert.equal(replayWithSkippedUtility.unassignedGrenadeCount, 1)
})

test('旧地图快照中的完整道具数据规范化后不再进入比赛运行态', () => {
  const replay = finalizeMapUtilityReplay(
    {
      ...createEmptyMapUtilityReplay('de_ancient'),
      rounds: [
        {
          roundIndex: 1,
          teamCTId: String(TEAM_A.id),
          teamTId: String(TEAM_B.id),
          unassignedGrenadeCount: 0
        }
      ]
    },
    1
  )
  const runtime = normalizeMatchRuntime({
    version: 1,
    matchId: 'match-1',
    currentMapId: '',
    lastFinishedMapId: 'de_ancient',
    handledMapEndIds: ['de_ancient'],
    mapSnapshots: {
      de_ancient: {
        mapId: 'de_ancient',
        mapIndex: 0,
        capturedAtMs: 1,
        teamAScore: 13,
        teamBScore: 10,
        roundCount: 23,
        seriesScoreAfterMap: { teamA: 1, teamB: 0 },
        players: [],
        utilityReplay: replay
      }
    },
    seriesEnded: true,
    lastCompleteGSIAtMs: 1,
    revision: 1
  })
  assert.equal(
    Object.prototype.hasOwnProperty.call(runtime.mapSnapshots.de_ancient, 'utilityReplay'),
    false
  )
})

test('地图间快捷时长固定为 5、10、15、20 分钟', () => {
  assert.deepEqual(
    [...MAP_BREAK_DURATION_PRESETS_MS],
    [5 * 60 * 1000, 10 * 60 * 1000, 15 * 60 * 1000, 20 * 60 * 1000]
  )
})

test('旧赛间状态迁移后只保留人工系列赛比分', () => {
  assert.deepEqual(
    normalizeIntermissionState(
      {
        version: 2,
        visible: true,
        revision: 7,
        nextMapId: 'de_mirage',
        timer: { status: 'running', durationMs: 600_000, remainingMs: 500_000 },
        layout: { teamScore: { x: 1, y: 2, scale: 1 } },
        scoreOverride: { enabled: true, teamA: 1, teamB: 0 }
      },
      'BO3'
    ),
    {
      version: 3,
      revision: 7,
      scoreOverride: { enabled: true, teamA: 1, teamB: 0 }
    }
  )
})

test('旧比赛缺少 bpSequence 时保留地图但不推断 BP', () => {
  const stored = normalizeMatchRecord({
    id: 'legacy-match',
    team_a: TEAM_A,
    team_b: TEAM_B,
    type: 'BO1',
    maps: [matchMap('de_ancient', 'finished', 13, 9)]
  })
  assert.ok(stored)
  assert.deepEqual(stored.bpSequence, [])
  assert.equal(stored.maps[0].ascore, 13)
  assert.equal(stored.maps[0].status, 'finished')
})

test('无效最终快照不会进入运行状态', () => {
  const normalized = normalizeMatchRuntime({
    version: 1,
    matchId: 'match-1',
    currentMapId: '',
    lastFinishedMapId: 'de_ancient',
    handledMapEndIds: ['de_ancient'],
    mapSnapshots: {
      de_ancient: {
        mapId: 'de_ancient',
        mapIndex: 0,
        capturedAtMs: 0,
        teamAScore: 13,
        teamBScore: 13,
        roundCount: 26,
        seriesScoreAfterMap: { teamA: 0, teamB: 0 },
        players: []
      }
    },
    seriesEnded: false,
    lastCompleteGSIAtMs: null,
    revision: 1
  })
  assert.equal(normalized.mapSnapshots.de_ancient, undefined)
})

test('空时间字段保持 null，不再被转换为 1970 年时间戳', () => {
  const matchRuntime = normalizeMatchRuntime({
    version: 1,
    matchId: null,
    currentMapId: '',
    lastFinishedMapId: '',
    handledMapEndIds: [],
    mapSnapshots: {},
    seriesEnded: false,
    lastCompleteGSIAtMs: null,
    revision: 0
  })
  const broadcastRuntime = normalizeBroadcastRuntime({
    version: 1,
    visible: false,
    playbackStatus: 'idle',
    preparedProgram: null,
    onAirProgram: null,
    activeSegmentIndex: 0,
    totalDurationMs: 0,
    startedAtMs: null,
    deadlineAtMs: null,
    pausedRemainingMs: null,
    playRevision: 0,
    revision: 0
  })
  assert.equal(matchRuntime.lastCompleteGSIAtMs, null)
  assert.equal(broadcastRuntime.startedAtMs, null)
  assert.equal(broadcastRuntime.deadlineAtMs, null)
  assert.equal(broadcastRuntime.pausedRemainingMs, null)

  const legacyZeroRuntime = normalizeBroadcastRuntime({
    version: 1,
    visible: false,
    playbackStatus: 'idle',
    preparedProgram: null,
    onAirProgram: null,
    activeSegmentIndex: 0,
    totalDurationMs: 0,
    startedAtMs: 0,
    deadlineAtMs: 0,
    pausedRemainingMs: 0,
    playRevision: 0,
    revision: 0
  })
  assert.equal(legacyZeroRuntime.startedAtMs, null)
  assert.equal(legacyZeroRuntime.deadlineAtMs, null)
  assert.equal(legacyZeroRuntime.pausedRemainingMs, null)
})

test('GSI 通过注册选手 SteamID 精确解析比赛双方当前阵营', () => {
  const activeMatch = {
    id: 'match-1',
    team_a: TEAM_A,
    team_b: TEAM_B,
    type: 'BO1',
    maps: []
  }
  const data = {
    players: [
      { steamid: 'steam-a', team: { side: 'CT' } },
      { steamid: 'steam-b', team: { side: 'T' } }
    ]
  } as unknown as CSGO
  const resolved = resolveActiveMatchTeamSides(data, {
    activeMatch,
    teams: [],
    players: [
      { id: 'player-a', type: 'player', steamid: 'steam-a', team_id: TEAM_A.id },
      { id: 'player-b', type: 'player', steamid: 'steam-b', team_id: TEAM_B.id }
    ]
  })
  assert.deepEqual(resolved, { CT: String(TEAM_A.id), T: String(TEAM_B.id) })
})

test('GSI 地图状态只按精确阶段推进且重复结束帧不再修改结果', () => {
  const activeMatch = {
    id: 'match-1',
    team_a: TEAM_A,
    team_b: TEAM_B,
    type: 'BO1',
    maps: [matchMap('de_ancient', 'pending', 0, 0)]
  }
  const sides = { CT: String(TEAM_A.id), T: String(TEAM_B.id) }
  const liveData = {
    map: {
      name: 'de_ancient',
      phase: 'live',
      team_ct: { score: 6 },
      team_t: { score: 4 }
    }
  } as unknown as CSGO
  const liveMatch = buildActiveMatchScoreUpdate(liveData, activeMatch, sides)
  assert.equal(liveMatch?.maps[0].status, 'live')
  assert.equal(liveMatch?.maps[0].ascore, 6)
  assert.equal(liveMatch?.maps[0].bscore, 4)

  const gameoverData = {
    map: {
      name: 'de_ancient',
      phase: 'gameover',
      team_ct: { score: 13 },
      team_t: { score: 10 }
    }
  } as unknown as CSGO
  const finishedMatch = buildActiveMatchScoreUpdate(gameoverData, liveMatch, sides)
  assert.equal(finishedMatch?.maps[0].status, 'finished')
  assert.equal(buildActiveMatchScoreUpdate(gameoverData, finishedMatch, sides), null)
})

function utilityGSIFrame(
  roundPhase: 'freezetime' | 'live' | 'over',
  score: number,
  players: Array<{
    steamid: string
    side: 'CT' | 'T'
    position?: number[]
    health?: number
  }>,
  grenades: unknown[] = []
): CSGO {
  return {
    map: {
      name: 'de_ancient',
      phase: 'live',
      team_ct: { score },
      team_t: { score: 0 }
    },
    round: { phase: roundPhase },
    players: players.map((player) => ({
      steamid: player.steamid,
      team: { side: player.side },
      position: player.position,
      state: { health: player.health ?? 100 }
    })),
    grenades
  } as unknown as CSGO
}

const UTILITY_MATCH_CONTEXT = {
  matchId: 'match-utility',
  teamAId: String(TEAM_A.id),
  teamBId: String(TEAM_B.id)
}
const UTILITY_SIDES = {
  CT: String(TEAM_A.id),
  T: String(TEAM_B.id)
}

test('道具采集只在冻结阶段武装，并在比分增加后提交已消失的道具', () => {
  const capture = new UtilityReplayCapture()
  const players = [
    { steamid: 'steam-a', side: 'CT' as const },
    { steamid: 'steam-b', side: 'T' as const }
  ]
  assert.equal(
    capture.processFrame(
      utilityGSIFrame('freezetime', 0, players),
      UTILITY_MATCH_CONTEXT,
      UTILITY_SIDES,
      1_000
    ),
    null
  )
  capture.processFrame(
    utilityGSIFrame('live', 0, players, [
      {
        id: 'smoke-1',
        owner: 'steam-a',
        lifetime: 0.1,
        position: [0, 0, 0],
        velocity: [0, 0, 0],
        type: 'smoke',
        effecttime: 0
      }
    ]),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    2_000
  )
  capture.processFrame(
    utilityGSIFrame('live', 0, players),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    2_500
  )
  const completed = capture.processFrame(
    utilityGSIFrame('freezetime', 1, players),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    3_000
  )
  assert.equal(completed?.replay.rounds.length, 1)
  assert.equal(completed?.replay.events.length, 1)
  assert.equal(completed?.replay.events[0].endedAtMs, 500)
  assert.equal(capture.finalizeMap('de_ancient', 1).complete, true)
})

test('道具回放忽略旧版选手移动路径且不再生成路径字段', () => {
  const legacy = normalizeMapUtilityReplay({
    ...createEmptyMapUtilityReplay('de_ancient'),
    version: 1,
    rounds: [
      {
        roundIndex: 1,
        teamCTId: String(TEAM_A.id),
        teamTId: String(TEAM_B.id),
        unassignedGrenadeCount: 0
      }
    ],
    playerPaths: [
      {
        steamId: 'steam-a',
        roundIndex: 1,
        teamId: String(TEAM_A.id),
        side: 'CT',
        trajectory: [[0, 583.26, 428.92]]
      }
    ]
  })
  assert.equal(legacy?.version, 2)
  assert.equal(Object.hasOwn(legacy ?? {}, 'playerPaths'), false)
  assert.equal(Object.hasOwn(createEmptyMapUtilityReplay('de_ancient'), 'playerPaths'), false)
})

test('道具 owner 与 SteamID 先不匹配后精确匹配时清除未归属记录', () => {
  const capture = new UtilityReplayCapture()
  capture.processFrame(
    utilityGSIFrame('freezetime', 0, []),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    1_000
  )
  const smoke = {
    id: 'smoke-owner',
    owner: 'steam-a',
    lifetime: 0.1,
    position: [0, 0, 0],
    velocity: [0, 0, 0],
    type: 'smoke',
    effecttime: 0
  }
  capture.processFrame(
    utilityGSIFrame('live', 0, [{ steamid: 'other', side: 'CT' }], [smoke]),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    2_000
  )
  capture.processFrame(
    utilityGSIFrame('live', 0, [{ steamid: 'steam-a', side: 'CT' }], [smoke]),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    2_100
  )
  capture.processFrame(
    utilityGSIFrame('freezetime', 1, [{ steamid: 'steam-a', side: 'CT' }]),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    3_000
  )
  const replay = capture.finalizeMap('de_ancient', 1)
  assert.equal(replay.unassignedGrenadeCount, 0)
  assert.equal(replay.complete, true)
  const diagnostics = capture.getDiagnostics()
  assert.equal(diagnostics.lastUnmatchedOwnerObservation?.owner, 'steam-a')
  assert.deepEqual(diagnostics.lastUnmatchedOwnerObservation?.playerSteamIds, ['other'])
  assert.equal(diagnostics.lastOwnerObservation?.matchedSteamId, 'steam-a')
})

test('燃烧区域坐标没有变化时不会重复写入 100ms 火焰帧', () => {
  const capture = new UtilityReplayCapture()
  const players = [{ steamid: 'steam-a', side: 'CT' as const }]
  capture.processFrame(
    utilityGSIFrame('freezetime', 0, players),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    1_000
  )
  const inferno = (position: number[]) => ({
    id: 'inferno-1',
    owner: 'steam-a',
    lifetime: 1,
    type: 'inferno',
    flames: [{ id: 'flame-1', position }]
  })
  capture.processFrame(
    utilityGSIFrame('live', 0, players, [inferno([0, 0, 0])]),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    2_000
  )
  capture.processFrame(
    utilityGSIFrame('live', 0, players, [inferno([0, 0, 0])]),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    2_200
  )
  capture.processFrame(
    utilityGSIFrame('live', 0, players, [inferno([100, 0, 0])]),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    2_400
  )
  capture.processFrame(
    utilityGSIFrame('freezetime', 1, players),
    UTILITY_MATCH_CONTEXT,
    UTILITY_SIDES,
    3_000
  )
  const replay = capture.finalizeMap('de_ancient', 1)
  assert.equal(replay.events[0].flameFrames.length, 2)
})

test('最新帧处理器最多保留一个待处理帧并让被替换帧等待到新帧完成', async () => {
  let releaseFirst: () => void = () => undefined
  let markFirstStarted: () => void = () => undefined
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve
  })
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const processed: number[] = []
  const processor = new LatestFrameProcessor<number>(async (value) => {
    processed.push(value)
    if (value === 1) {
      markFirstStarted()
      await firstGate
    }
  })
  const first = processor.submit(1)
  await firstStarted
  const second = processor.submit(2)
  const third = processor.submit(3)
  const secondDone = processor.waitFor(second)
  const thirdDone = processor.waitFor(third)
  releaseFirst()
  assert.equal(await processor.waitFor(first), 'processed')
  assert.equal(await secondDone, 'superseded')
  assert.equal(await thirdDone, 'processed')
  assert.deepEqual(processed, [1, 3])
  assert.equal(processor.getStats().supersededFrames, 1)
  assert.equal(processor.getStats().pending, false)
})

test('最新帧处理器暂停时等待当前帧并丢弃旧待处理帧', async () => {
  let releaseFirst: () => void = () => undefined
  let markFirstStarted: () => void = () => undefined
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve
  })
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const processed: number[] = []
  const processor = new LatestFrameProcessor<number>(async (value) => {
    processed.push(value)
    if (value === 1) {
      markFirstStarted()
      await firstGate
    }
  })
  processor.submit(1)
  await firstStarted
  const pending = processor.submit(2)
  const suspended = processor.suspendAndDrain()
  releaseFirst()
  await suspended
  assert.equal(await processor.waitFor(pending), 'discarded')
  assert.equal(processor.submit(99), 0)
  processor.resume()
  const resumed = processor.submit(3)
  assert.equal(await processor.waitFor(resumed), 'processed')
  assert.deepEqual(processed, [1, 3])
})

test('最新帧处理器保留高优先级阶段帧并让后续帧等待同一处理结果', async () => {
  let releaseFirst: () => void = () => undefined
  let markFirstStarted: () => void = () => undefined
  const firstStarted = new Promise<void>((resolve) => {
    markFirstStarted = resolve
  })
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const processed: number[] = []
  const processor = new LatestFrameProcessor<number>(
    async (value) => {
      processed.push(value)
      if (value === 0) {
        markFirstStarted()
        await firstGate
      }
    },
    () => undefined,
    (pending, incoming) => pending > incoming
  )
  processor.submit(0)
  await firstStarted
  const critical = processor.submit(2)
  const sharedCritical = processor.submit(1)
  assert.equal(sharedCritical, critical)
  releaseFirst()
  assert.equal(await processor.waitFor(sharedCritical), 'processed')
  assert.deepEqual(processed, [0, 2])
  assert.equal(processor.getStats().discardedFrames, 1)
})

test('冻结时间经济汇总按队伍统计现金、装备和选手明细', () => {
  const summary = buildEconomySummary(
    'CT',
    [
      {
        steamid: '1',
        name: '选手一',
        observer_slot: 1,
        team: { side: 'CT' },
        state: { money: 2300, equip_value: 4800, armor: 100, helmet: true, defusekit: true },
        primary_weapon: { name: 'weapon_m4a1_silencer' },
        grenades: [{ name: 'weapon_smokegrenade' }, { name: 'weapon_flashbang' }]
      },
      {
        steamid: '2',
        name: '选手二',
        observer_slot: 2,
        team: { side: 'CT' },
        state: { money: 900, equip_value: 3100, armor: 50 },
        secondary_weapon: { name: 'weapon_deagle' },
        grenades: []
      },
      {
        steamid: '3',
        name: '另一队选手',
        team: { side: 'T' },
        state: { money: 16000, equip_value: 9000 }
      }
    ],
    2
  )

  assert.equal(summary.totalMoney, 3200)
  assert.equal(summary.totalEquipmentValue, 7900)
  assert.equal(summary.consecutiveRoundLosses, 2)
  assert.deepEqual(
    summary.players.map((player) => [player.name, player.weapon]),
    [
      ['选手一', 'm4a1_silencer'],
      ['选手二', 'deagle']
    ]
  )
})

test('存活人数只在有效对局阶段生成残局信息', () => {
  const players = [
    { team: { side: 'CT' as const }, state: { health: 100 } },
    { team: { side: 'T' as const }, state: { health: 100 } },
    { team: { side: 'T' as const }, state: { health: 35 } },
    { team: { side: 'T' as const }, state: { health: 0 } }
  ]
  assert.equal(buildAliveSituation(players, 'freezetime'), null)
  assert.deepEqual(buildAliveSituation(players, 'live'), {
    ct: 1,
    t: 2,
    primary: '1 对 2',
    secondary: 'CT 残局 · 1 对 2',
    clutchSide: 'CT'
  })
})

test('闪光强度兼容零到一和零到二百五十五两种实值范围', () => {
  assert.equal(normalizeFlashOpacity(0), 0)
  assert.equal(normalizeFlashOpacity(0.5), 0.5)
  assert.equal(normalizeFlashOpacity(255), 1)
  assert.equal(normalizeFlashOpacity(128), 128 / 255)
})

test('HLAE player_death 消息严格转换为 csgogsi MIRV 数据', () => {
  const parsed = parseHlaePlayerDeathMessage({
    type: 'player_death',
    clientTime: 1234,
    data: {
      userid: 4,
      attacker: 8,
      assister: 65535,
      user_steamid: '76561198000000004',
      attacker_steamid: '76561198000000008',
      assister_steamid: '0',
      assistedflash: false,
      weapon: 'ak47',
      weapon_itemid: '',
      weapon_fauxitemid: '',
      weapon_originalowner_xuid: '0',
      headshot: true,
      dominated: 0,
      revenge: 0,
      wipe: 0,
      attackerblind: false,
      thrusmoke: true,
      noscope: false,
      penetrated: 1,
      noreplay: false,
      attackerinair: false
    }
  })

  assert.equal(parsed?.keys.userid.xuid, '76561198000000004')
  assert.equal(parsed?.keys.attacker.xuid, '76561198000000008')
  assert.equal(parsed?.keys.headshot, true)
  assert.equal(parsed?.keys.thrusmoke, true)
  assert.equal(parsed?.keys.penetrated, 1)
  assert.equal(parseHlaePlayerDeathMessage({ type: 'player_death', data: {} }), null)
})
