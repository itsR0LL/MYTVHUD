import assert from 'node:assert/strict'
import test from 'node:test'
import type { BPMapId, BPMatchType, BPTeam } from '../../src/shared/bp'
import type { BroadcastProgram } from '../../src/shared/broadcast-flow'
import {
  createMapBreakPageData,
  createSeriesEndPageData,
  createStandbyPageData
} from '../../src/shared/intermission-page-data-next/view-model'
import {
  calculateSnapshotSeriesScore,
  snapshotSeriesHasEnded,
  type MapFinalSnapshot,
  type MatchMapRecord,
  type PlayerFinalStats
} from '../../src/shared/match-session'

type MapWinner = 'teamA' | 'teamB'

const TEAM_A: BPTeam = {
  id: 10,
  name: '战队一',
  name_ingame: 'Team One',
  avatar: 'team-a.png'
}
const TEAM_B: BPTeam = {
  id: 20,
  name: '战队二',
  name_ingame: 'Team Two',
  avatar: 'team-b.png'
}
const MAP_IDS: readonly BPMapId[] = [
  'de_mirage',
  'de_nuke',
  'de_ancient',
  'de_inferno',
  'de_anubis'
]

function mapCount(type: BPMatchType): number {
  if (type === 'BO1') return 1
  if (type === 'BO3') return 3
  return 5
}

function mapRecord(
  mapId: BPMapId,
  mapIndex: number,
  finished: boolean,
  score: { teamA: number; teamB: number } | null,
  type: BPMatchType
): MatchMapRecord {
  return {
    name: mapId,
    pickby: mapIndex % 2 === 0 ? String(TEAM_A.id) : String(TEAM_B.id),
    decider: mapIndex === mapCount(type) - 1,
    ascore: score?.teamA ?? 0,
    bscore: score?.teamB ?? 0,
    aid: TEAM_A.id,
    bid: TEAM_B.id,
    status: finished ? 'finished' : 'pending'
  }
}

function playerStats(mapIndex: number, team: 'teamA' | 'teamB'): PlayerFinalStats {
  const isTeamA = team === 'teamA'
  return {
    steamid: isTeamA ? 'steam-a-1' : 'steam-b-1',
    teamId: String(isTeamA ? TEAM_A.id : TEAM_B.id),
    name: isTeamA ? 'A1' : 'B1',
    kills: (isTeamA ? 20 : 15) + mapIndex,
    assists: (isTeamA ? 5 : 4) + mapIndex,
    deaths: (isTeamA ? 10 : 12) + mapIndex,
    mvps: (isTeamA ? 3 : 2) + mapIndex,
    score: (isTeamA ? 40 : 32) + mapIndex,
    headshots: (isTeamA ? 11 : 8) + mapIndex,
    adr: (isTeamA ? 80 : 70) + mapIndex
  }
}

function createSnapshot(
  mapId: BPMapId,
  mapIndex: number,
  winner: MapWinner,
  seriesScoreAfterMap: { teamA: number; teamB: number }
): MapFinalSnapshot {
  const teamAScore = winner === 'teamA' ? 13 : 8
  const teamBScore = winner === 'teamB' ? 13 : 9
  return {
    mapId,
    mapIndex,
    capturedAtMs: 1_000 + mapIndex,
    teamAScore,
    teamBScore,
    roundCount: teamAScore + teamBScore,
    seriesScoreAfterMap,
    players: [playerStats(mapIndex, 'teamA'), playerStats(mapIndex, 'teamB')]
  }
}

function createProgram(
  type: BPMatchType,
  winners: readonly MapWinner[],
  programType: BroadcastProgram['type'] = 'series_end'
): BroadcastProgram {
  let teamAWins = 0
  let teamBWins = 0
  const mapSnapshots: BroadcastProgram['snapshot']['mapSnapshots'] = {}
  const maps = MAP_IDS.slice(0, mapCount(type)).map((mapId, mapIndex) => {
    const winner = winners[mapIndex]
    if (winner) {
      if (winner === 'teamA') teamAWins += 1
      if (winner === 'teamB') teamBWins += 1
      mapSnapshots[mapId] = createSnapshot(mapId, mapIndex, winner, {
        teamA: teamAWins,
        teamB: teamBWins
      })
    }
    return mapRecord(
      mapId,
      mapIndex,
      winner !== undefined,
      mapSnapshots[mapId]
        ? {
            teamA: mapSnapshots[mapId]?.teamAScore ?? 0,
            teamB: mapSnapshots[mapId]?.teamBScore ?? 0
          }
        : null,
      type
    )
  })
  const seriesScore = calculateSnapshotSeriesScore(maps, mapSnapshots, type)
  const lastFinishedMapId = MAP_IDS[winners.length - 1] ?? ''
  return {
    id: `${type}-${winners.join('-')}-${programType}`,
    type: programType,
    createdAtMs: 2_000,
    sourceMatchId: `${type}-${winners.join('-')}`,
    sourceMapId: lastFinishedMapId,
    snapshot: {
      match: {
        id: `${type}-${winners.join('-')}`,
        team_a: TEAM_A,
        team_b: TEAM_B,
        type,
        bpSequence: [],
        maps
      },
      seriesScore,
      scoreOverride: { enabled: false, teamA: 0, teamB: 0 },
      lastFinishedMapId,
      nextMapId: '',
      seriesEnded: snapshotSeriesHasEnded(maps, mapSnapshots, type),
      mapSnapshots,
      nextMatch: null
    },
    issues: [],
    segments: []
  }
}

const finishedScenarios = [
  {
    name: 'BO1系列结束',
    type: 'BO1',
    winners: ['teamA'],
    expectedScore: { teamA: 1, teamB: 0 },
    completedMaps: 1
  },
  {
    name: 'BO3 2:0',
    type: 'BO3',
    winners: ['teamA', 'teamA'],
    expectedScore: { teamA: 2, teamB: 0 },
    completedMaps: 2
  },
  {
    name: 'BO3 2:1',
    type: 'BO3',
    winners: ['teamA', 'teamB', 'teamA'],
    expectedScore: { teamA: 2, teamB: 1 },
    completedMaps: 3
  },
  {
    name: 'BO5 3:0',
    type: 'BO5',
    winners: ['teamA', 'teamA', 'teamA'],
    expectedScore: { teamA: 3, teamB: 0 },
    completedMaps: 3
  },
  {
    name: 'BO5 3:1',
    type: 'BO5',
    winners: ['teamA', 'teamB', 'teamA', 'teamA'],
    expectedScore: { teamA: 3, teamB: 1 },
    completedMaps: 4
  },
  {
    name: 'BO5 3:2',
    type: 'BO5',
    winners: ['teamA', 'teamB', 'teamA', 'teamB', 'teamA'],
    expectedScore: { teamA: 3, teamB: 2 },
    completedMaps: 5
  }
] as const satisfies ReadonlyArray<{
  name: string
  type: BPMatchType
  winners: readonly MapWinner[]
  expectedScore: { teamA: number; teamB: number }
  completedMaps: number
}>

for (const scenario of finishedScenarios) {
  test(`${scenario.name}只输出真实完成地图且不依赖nextMapId`, () => {
    const program = createProgram(scenario.type, scenario.winners)
    assert.equal(program.snapshot.nextMapId, '')
    assert.equal(program.snapshot.seriesEnded, true)
    assert.deepEqual(program.snapshot.seriesScore, scenario.expectedScore)

    const data = createSeriesEndPageData(program, 'none')
    assert.ok(data)
    assert.equal(data.page, 'series_end')
    assert.deepEqual(data.finalSeriesScore, scenario.expectedScore)
    assert.equal(data.winnerTeamId, String(TEAM_A.id))
    assert.equal(
      data.maps.filter((map) => map.status === 'finished').length,
      scenario.completedMaps
    )

    const pendingMaps = data.maps.filter((map) => map.status !== 'finished')
    assert.equal(pendingMaps.length, mapCount(scenario.type) - scenario.completedMaps)
    for (const map of pendingMaps) {
      assert.equal(map.teamAScore, null)
      assert.equal(map.teamBScore, null)
    }
  })
}

test('地图间页面的比分和选手只读取刚冻结的本图快照', () => {
  const program = createProgram('BO3', ['teamA', 'teamB'], 'map_break')
  program.snapshot.seriesEnded = false
  program.snapshot.nextMapId = 'de_ancient'
  program.snapshot.match.maps[1].ascore = 1
  program.snapshot.match.maps[1].bscore = 0

  const data = createMapBreakPageData(program, null, 'none')
  assert.ok(data)
  assert.equal(data.sourceMapId, 'de_nuke')
  assert.deepEqual(data.finalScore, { teamA: 8, teamB: 13 })
  assert.equal(data.teamAPlayers.length, 1)
  assert.equal(data.teamAPlayers[0].kills, playerStats(1, 'teamA').kills)
  assert.equal(data.teamBPlayers[0].kills, playerStats(1, 'teamB').kills)
  assert.equal(data.nextMap?.mapId, 'de_ancient')
})

test('赛事待机在下一场缺失时保留上一场且不生成下一场、BP或倒计时', () => {
  const program = createProgram('BO3', ['teamA', 'teamA'], 'standby')
  const data = createStandbyPageData(program)
  assert.ok(data)
  assert.equal(data.nextMatch, null)
  assert.equal(data.nextMatchStatus, 'not_configured')
  assert.deepEqual(data.previousResult?.finalSeriesScore, { teamA: 2, teamB: 0 })
  assert.equal(data.previousResult?.winnerTeamId, String(TEAM_A.id))
  assert.deepEqual(Object.keys(data).sort(), [
    'issues',
    'nextMatch',
    'nextMatchStatus',
    'page',
    'previousResult',
    'sourceMatchId'
  ])
  assert.equal(
    Object.keys(data).some((key) => /bp|countdown|timer/i.test(key)),
    false
  )
})

test('系列赛选手汇总不生成Rating、KAST或自行平均ADR', () => {
  const program = createProgram('BO5', ['teamA', 'teamB', 'teamA', 'teamB', 'teamA'])
  const data = createSeriesEndPageData(program, 'kills')
  assert.ok(data)

  const players = [...data.teamAPlayers, ...data.teamBPlayers]
  assert.equal(players.length, 2)
  for (const player of players) {
    assert.equal(player.mapsPlayed, 5)
    assert.equal(player.adr, null)
    assert.equal('rating' in player, false)
    assert.equal('Rating' in player, false)
    assert.equal('kast' in player, false)
    assert.equal('KAST' in player, false)
  }

  assert.equal(
    data.teamAPlayers[0].kills,
    [0, 1, 2, 3, 4].reduce((total, mapIndex) => total + playerStats(mapIndex, 'teamA').kills, 0)
  )
})
