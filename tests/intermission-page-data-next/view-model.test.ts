import assert from 'node:assert/strict'
import test from 'node:test'
import type { BPMapId, BPTeam } from '../../src/shared/bp'
import type { BroadcastProgram } from '../../src/shared/broadcast-flow'
import type {
  MapFinalSnapshot,
  MatchMapRecord,
  PlayerFinalStats
} from '../../src/shared/match-session'
import {
  createMapBreakPageData,
  createSeriesEndPageData,
  createStandbyPageData
} from '../../src/shared/intermission-page-data-next/view-model'

const TEAM_A: BPTeam = {
  id: 10,
  name: '战队一',
  name_ingame: 'Team One',
  avatar: 'team-a.png'
}
const TEAM_B: BPTeam = {
  id: 20,
  name: '战队二',
  name_ingame: 'Team Two'
}

function map(
  name: BPMapId,
  pickby: string,
  decider: boolean,
  status: MatchMapRecord['status']
): MatchMapRecord {
  return {
    name,
    pickby,
    decider,
    ascore: 0,
    bscore: 0,
    aid: TEAM_A.id,
    bid: TEAM_B.id,
    status
  }
}

function player(
  steamid: string,
  teamId: string,
  name: string,
  kills: number,
  score: number
): PlayerFinalStats {
  return {
    steamid,
    teamId,
    name,
    kills,
    assists: 3,
    deaths: 8,
    mvps: 2,
    score,
    headshots: Math.round(kills / 2),
    adr: 80
  }
}

function snapshot(
  mapId: BPMapId,
  mapIndex: number,
  teamAScore: number,
  teamBScore: number,
  players: PlayerFinalStats[]
): MapFinalSnapshot {
  return {
    mapId,
    mapIndex,
    capturedAtMs: 100,
    teamAScore,
    teamBScore,
    roundCount: teamAScore + teamBScore,
    seriesScoreAfterMap: {
      teamA: teamAScore > teamBScore ? 1 : 0,
      teamB: teamBScore > teamAScore ? 1 : 0
    },
    players
  }
}

function program(type: BroadcastProgram['type']): BroadcastProgram {
  const maps = [
    map('de_mirage', String(TEAM_A.id), false, 'finished'),
    map('de_nuke', String(TEAM_B.id), false, 'pending'),
    map('de_ancient', '', true, 'pending')
  ]
  return {
    id: 'program-1',
    type,
    createdAtMs: 1,
    sourceMatchId: 'match-1',
    sourceMapId: 'de_mirage',
    snapshot: {
      match: {
        id: 'match-1',
        team_a: TEAM_A,
        team_b: TEAM_B,
        type: 'BO3',
        bpSequence: [],
        maps
      },
      seriesScore: { teamA: 1, teamB: 0 },
      scoreOverride: { enabled: false, teamA: 0, teamB: 0 },
      lastFinishedMapId: 'de_mirage',
      nextMapId: 'de_nuke',
      seriesEnded: false,
      mapSnapshots: {
        de_mirage: snapshot('de_mirage', 0, 13, 9, [
          player('a-1', String(TEAM_A.id), 'A1', 20, 35),
          player('b-1', String(TEAM_B.id), 'B1', 15, 28)
        ])
      },
      nextMatch: null
    },
    issues: [],
    segments: []
  }
}

test('地图间数据只播放完整的真实逐回合比分', () => {
  const data = createMapBreakPageData(
    program('map_break'),
    {
      version: 1,
      complete: false,
      points: [{ roundIndex: 1, teamAScore: 1, teamBScore: 0, winnerTeamId: String(TEAM_A.id) }]
    },
    'score'
  )

  assert.ok(data)
  assert.deepEqual(data.finalScore, { teamA: 13, teamB: 9 })
  assert.equal(data.nextMap?.mapId, 'de_nuke')
  assert.equal(data.scoreTimelineComplete, false)
  assert.deepEqual(data.scoreTimeline, [])
  assert.equal(data.highlightedSteamid, 'a-1')
  assert.equal(data.teamAPlayers[0].headshotRate, 50)
})

test('同分时不自行指定突出选手', () => {
  const source = program('map_break')
  const mapSnapshot = source.snapshot.mapSnapshots.de_mirage
  assert.ok(mapSnapshot)
  mapSnapshot.players[1].score = 35

  const data = createMapBreakPageData(source, null, 'score')
  assert.ok(data)
  assert.equal(data.highlightedSteamid, null)
})

test('双方本图选手数据分别按 ADR 从高到低排列', () => {
  const source = program('map_break')
  const mapSnapshot = source.snapshot.mapSnapshots.de_mirage
  assert.ok(mapSnapshot)
  mapSnapshot.players = [
    { ...player('a-low', String(TEAM_A.id), 'A Low', 18, 31), adr: 65 },
    { ...player('b-low', String(TEAM_B.id), 'B Low', 17, 30), adr: 58 },
    { ...player('a-high', String(TEAM_A.id), 'A High', 19, 34), adr: 112 },
    { ...player('b-high', String(TEAM_B.id), 'B High', 20, 36), adr: 96 }
  ]

  const data = createMapBreakPageData(source, null, 'none')
  assert.ok(data)
  assert.deepEqual(
    data.teamAPlayers.map((player) => player.steamid),
    ['a-high', 'a-low']
  )
  assert.deepEqual(
    data.teamBPlayers.map((player) => player.steamid),
    ['b-high', 'b-low']
  )
})

test('系列赛结束页只汇总实际完成地图并保留下一场状态', () => {
  const source = program('series_end')
  source.snapshot.match.maps[1].status = 'finished'
  source.snapshot.mapSnapshots.de_nuke = snapshot('de_nuke', 1, 13, 7, [
    player('a-1', String(TEAM_A.id), 'A1', 18, 30),
    player('b-1', String(TEAM_B.id), 'B1', 12, 24)
  ])
  source.snapshot.seriesScore = { teamA: 2, teamB: 0 }
  source.snapshot.seriesEnded = true
  source.snapshot.nextMapId = ''
  source.snapshot.nextMatch = {
    matchId: 'match-2',
    type: 'BO1',
    team_a: { id: 30, name: '战队三', name_ingame: 'Team Three' },
    team_b: { id: 40, name: '战队四', name_ingame: 'Team Four' },
    bpReady: false
  }

  const data = createSeriesEndPageData(source, 'kills')
  assert.ok(data)
  assert.equal(data.winnerTeamId, String(TEAM_A.id))
  assert.equal(data.teamAPlayers[0].kills, 38)
  assert.equal(data.teamAPlayers[0].mapsPlayed, 2)
  assert.equal(data.nextMatch?.status, 'bp_pending')
  assert.equal(data.maps[2].teamAScore, null)
})

test('赛事待机在下一场未配置时仍保留上一场结果', () => {
  const source = program('standby')
  source.snapshot.seriesEnded = true
  source.snapshot.seriesScore = { teamA: 2, teamB: 0 }
  source.snapshot.nextMapId = ''

  const data = createStandbyPageData(source)
  assert.ok(data)
  assert.equal(data.nextMatchStatus, 'not_configured')
  assert.equal(data.nextMatch, null)
  assert.equal(data.previousResult?.winnerTeamId, String(TEAM_A.id))
})
