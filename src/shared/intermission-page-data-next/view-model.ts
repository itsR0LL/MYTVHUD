import {
  BP_MAPS,
  isBPSequenceComplete,
  type BPMapId,
  type BPMatchType,
  type BPSequenceItem,
  type BPPayload,
  type BPTeam
} from '../bp'
import type { BroadcastNextMatch, BroadcastProgram } from '../broadcast-flow'
import {
  aggregateSeriesPlayerStats,
  type MapFinalSnapshot,
  type MatchMapRecord,
  type PlayerFinalStats,
  type SeriesPlayerStats
} from '../match-session'
import type {
  MapScoreTimelinePoint,
  MapScoreTimelineV1
} from '../intermission-score-next/score-timeline'

export const PLAYER_HIGHLIGHT_RULES = ['none', 'score', 'kills'] as const

export type PlayerHighlightRule = (typeof PLAYER_HIGHLIGHT_RULES)[number]

export interface IntermissionPageTeam {
  id: string
  name: string
  avatar: string | null
}

export interface IntermissionPagePlayer {
  steamid: string
  teamId: string
  name: string
  kills: number
  assists: number
  deaths: number
  mvps: number
  score: number
  headshotRate: number
  adr: number | null
  mapsPlayed: number | null
}

export interface IntermissionPageMap {
  mapId: BPMapId
  name: string
  decider: boolean
  pickedByTeamId: string | null
  status: MatchMapRecord['status']
  teamAScore: number | null
  teamBScore: number | null
}

export interface IntermissionPageNextMatch {
  matchId: string
  type: BroadcastNextMatch['type']
  teamA: IntermissionPageTeam
  teamB: IntermissionPageTeam
  status: 'bp_ready' | 'bp_pending'
}

export interface WarmupPageData {
  page: 'warmup'
  matchId: string | null
  matchType: BPMatchType | null
  teamA: IntermissionPageTeam | null
  teamB: IntermissionPageTeam | null
  bpStatus: 'not_configured' | 'bp_pending' | 'bp_ready'
  prompt: string
  issues: string[]
}

export interface BPPageData {
  page: 'bp'
  matchId: string
  matchType: BPMatchType
  teamA: IntermissionPageTeam
  teamB: IntermissionPageTeam
  sequence: BPSequenceItem[]
  playbackStarted: boolean
  playbackStartedAtMs: number | null
  animationEnabled: boolean
  playRevision: number
  preview: boolean
  issues: string[]
}

export interface MapBreakPageData {
  page: 'map_break'
  sourceMatchId: string
  sourceMapId: BPMapId
  teamA: IntermissionPageTeam
  teamB: IntermissionPageTeam
  seriesScore: { teamA: number; teamB: number }
  finalScore: { teamA: number; teamB: number }
  maps: IntermissionPageMap[]
  nextMap: IntermissionPageMap | null
  teamAPlayers: IntermissionPagePlayer[]
  teamBPlayers: IntermissionPagePlayer[]
  unassignedPlayerCount: number
  highlightedSteamid: string | null
  scoreTimeline: MapScoreTimelinePoint[]
  scoreTimelineComplete: boolean
  issues: string[]
}

export interface SeriesEndPageData {
  page: 'series_end'
  sourceMatchId: string
  teamA: IntermissionPageTeam
  teamB: IntermissionPageTeam
  finalSeriesScore: { teamA: number; teamB: number }
  winnerTeamId: string | null
  maps: IntermissionPageMap[]
  teamAPlayers: IntermissionPagePlayer[]
  teamBPlayers: IntermissionPagePlayer[]
  unassignedPlayerCount: number
  highlightedSteamid: string | null
  nextMatch: IntermissionPageNextMatch | null
  issues: string[]
}

export interface StandbyPageData {
  page: 'standby'
  sourceMatchId: string
  previousResult: {
    teamA: IntermissionPageTeam
    teamB: IntermissionPageTeam
    finalSeriesScore: { teamA: number; teamB: number }
    winnerTeamId: string | null
  } | null
  nextMatch: IntermissionPageNextMatch | null
  nextMatchStatus: 'not_configured' | 'bp_pending' | 'bp_ready'
  issues: string[]
}

function teamView(team: BPTeam): IntermissionPageTeam {
  const registeredName = team.name.trim()
  const inGameName = team.name_ingame.trim()
  return {
    id: String(team.id),
    name: registeredName || inGameName || String(team.id),
    avatar: typeof team.avatar === 'string' && team.avatar.length > 0 ? team.avatar : null
  }
}

export function calculateHeadshotKillRate(totalKills: number, headshotKills: number): number {
  if (!Number.isInteger(totalKills) || totalKills <= 0) return 0
  const normalizedHeadshotKills =
    Number.isInteger(headshotKills) && headshotKills > 0 ? Math.min(totalKills, headshotKills) : 0
  return Math.round((normalizedHeadshotKills / totalKills) * 100)
}

function playerView(
  player: PlayerFinalStats | SeriesPlayerStats,
  mapsPlayed: number | null
): IntermissionPagePlayer {
  return {
    steamid: player.steamid,
    teamId: player.teamId,
    name: player.name,
    kills: player.kills,
    assists: player.assists,
    deaths: player.deaths,
    mvps: player.mvps,
    score: player.score,
    headshotRate: calculateHeadshotKillRate(player.kills, player.headshots),
    adr: player.adr,
    mapsPlayed
  }
}

function mapName(mapId: BPMapId): string {
  return BP_MAPS.find((map) => map.id === mapId)?.name ?? mapId
}

function validSnapshotForMap(
  map: MatchMapRecord,
  snapshots: BroadcastProgram['snapshot']['mapSnapshots']
): MapFinalSnapshot | null {
  const snapshot = snapshots[map.name]
  return snapshot?.mapId === map.name ? snapshot : null
}

function mapView(
  map: MatchMapRecord,
  snapshots: BroadcastProgram['snapshot']['mapSnapshots'],
  teamAId: string,
  teamBId: string
): IntermissionPageMap {
  const snapshot = validSnapshotForMap(map, snapshots)
  const pickedByTeamId =
    String(map.pickby) === teamAId ? teamAId : String(map.pickby) === teamBId ? teamBId : null
  return {
    mapId: map.name,
    name: mapName(map.name),
    decider: map.decider,
    pickedByTeamId,
    status: map.status,
    teamAScore: snapshot?.teamAScore ?? null,
    teamBScore: snapshot?.teamBScore ?? null
  }
}

function groupPlayers(
  players: readonly (PlayerFinalStats | SeriesPlayerStats)[],
  teamAId: string,
  teamBId: string,
  series: boolean
): {
  teamAPlayers: IntermissionPagePlayer[]
  teamBPlayers: IntermissionPagePlayer[]
  unassignedPlayerCount: number
} {
  const teamAPlayers: IntermissionPagePlayer[] = []
  const teamBPlayers: IntermissionPagePlayer[] = []
  let unassignedPlayerCount = 0

  for (const player of players) {
    const view = playerView(player, series && 'mapsPlayed' in player ? player.mapsPlayed : null)
    if (String(player.teamId) === teamAId) {
      teamAPlayers.push(view)
    } else if (String(player.teamId) === teamBId) {
      teamBPlayers.push(view)
    } else {
      unassignedPlayerCount += 1
    }
  }
  const byADRDescending = (
    first: IntermissionPagePlayer,
    second: IntermissionPagePlayer
  ): number => {
    const firstADR = first.adr ?? -1
    const secondADR = second.adr ?? -1
    return (
      secondADR - firstADR ||
      second.kills - first.kills ||
      first.steamid.localeCompare(second.steamid)
    )
  }
  teamAPlayers.sort(byADRDescending)
  teamBPlayers.sort(byADRDescending)
  return { teamAPlayers, teamBPlayers, unassignedPlayerCount }
}

function highlightedSteamid(
  players: readonly IntermissionPagePlayer[],
  rule: PlayerHighlightRule
): string | null {
  if (rule === 'none' || players.length === 0) return null
  const maximum = Math.max(...players.map((player) => player[rule]))
  const leaders = players.filter((player) => player[rule] === maximum)
  return leaders.length === 1 ? leaders[0].steamid : null
}

function nextMatchView(nextMatch: BroadcastNextMatch | null): IntermissionPageNextMatch | null {
  if (!nextMatch) return null
  return {
    matchId: String(nextMatch.matchId),
    type: nextMatch.type,
    teamA: teamView(nextMatch.team_a),
    teamB: teamView(nextMatch.team_b),
    status: nextMatch.bpReady ? 'bp_ready' : 'bp_pending'
  }
}

function seriesWinnerTeamId(program: BroadcastProgram): string | null {
  const score = program.snapshot.seriesScore
  if (score.teamA === score.teamB) return null
  return score.teamA > score.teamB
    ? String(program.snapshot.match.team_a.id)
    : String(program.snapshot.match.team_b.id)
}

export function createWarmupPageData(payload: BPPayload): WarmupPageData {
  const match = payload.match
  if (!match) {
    return {
      page: 'warmup',
      matchId: null,
      matchType: null,
      teamA: null,
      teamB: null,
      bpStatus: 'not_configured',
      prompt: '直播即将开始',
      issues: []
    }
  }
  const bpReady = isBPSequenceComplete(payload.state.sequence, match.type)
  return {
    page: 'warmup',
    matchId: String(match.id),
    matchType: match.type,
    teamA: teamView(match.team_a),
    teamB: teamView(match.team_b),
    bpStatus: bpReady ? 'bp_ready' : 'bp_pending',
    prompt: '直播即将开始',
    issues: []
  }
}

export function createBPPageData(payload: BPPayload): BPPageData | null {
  const match = payload.match
  if (!match || !isBPSequenceComplete(payload.state.sequence, match.type)) return null
  return {
    page: 'bp',
    matchId: String(match.id),
    matchType: match.type,
    teamA: teamView(match.team_a),
    teamB: teamView(match.team_b),
    sequence: payload.state.sequence.map((item) => ({ ...item })),
    playbackStarted: payload.state.playbackStarted,
    playbackStartedAtMs: payload.state.playbackStartedAtMs,
    animationEnabled: payload.state.animationEnabled,
    playRevision: payload.state.revision,
    preview: false,
    issues: []
  }
}

export function createMapBreakPageData(
  program: BroadcastProgram,
  timeline: MapScoreTimelineV1 | null,
  highlightRule: PlayerHighlightRule
): MapBreakPageData | null {
  if (program.type !== 'map_break' || !program.sourceMapId) return null
  const match = program.snapshot.match
  const mapSnapshot = program.snapshot.mapSnapshots[program.sourceMapId]
  if (!mapSnapshot || mapSnapshot.mapId !== program.sourceMapId) return null

  const teamAId = String(match.team_a.id)
  const teamBId = String(match.team_b.id)
  const maps = match.maps.map((map) =>
    mapView(map, program.snapshot.mapSnapshots, teamAId, teamBId)
  )
  const groupedPlayers = groupPlayers(mapSnapshot.players, teamAId, teamBId, false)
  const allPlayers = [...groupedPlayers.teamAPlayers, ...groupedPlayers.teamBPlayers]
  const scoreTimelineComplete = timeline?.complete === true
  return {
    page: 'map_break',
    sourceMatchId: String(program.sourceMatchId),
    sourceMapId: program.sourceMapId,
    teamA: teamView(match.team_a),
    teamB: teamView(match.team_b),
    seriesScore: { ...program.snapshot.seriesScore },
    finalScore: {
      teamA: mapSnapshot.teamAScore,
      teamB: mapSnapshot.teamBScore
    },
    maps,
    nextMap:
      maps.find((map) => map.mapId === program.snapshot.nextMapId && map.status !== 'finished') ??
      null,
    ...groupedPlayers,
    highlightedSteamid: highlightedSteamid(allPlayers, highlightRule),
    scoreTimeline: scoreTimelineComplete ? timeline.points : [],
    scoreTimelineComplete,
    issues: [...program.issues]
  }
}

export function createSeriesEndPageData(
  program: BroadcastProgram,
  highlightRule: PlayerHighlightRule
): SeriesEndPageData | null {
  if (program.type !== 'series_end') return null
  const match = program.snapshot.match
  const teamAId = String(match.team_a.id)
  const teamBId = String(match.team_b.id)
  const maps = match.maps.map((map) =>
    mapView(map, program.snapshot.mapSnapshots, teamAId, teamBId)
  )
  const players = aggregateSeriesPlayerStats(match.maps, program.snapshot.mapSnapshots)
  const groupedPlayers = groupPlayers(players, teamAId, teamBId, true)
  const allPlayers = [...groupedPlayers.teamAPlayers, ...groupedPlayers.teamBPlayers]
  return {
    page: 'series_end',
    sourceMatchId: String(program.sourceMatchId),
    teamA: teamView(match.team_a),
    teamB: teamView(match.team_b),
    finalSeriesScore: { ...program.snapshot.seriesScore },
    winnerTeamId: seriesWinnerTeamId(program),
    maps,
    ...groupedPlayers,
    highlightedSteamid: highlightedSteamid(allPlayers, highlightRule),
    nextMatch: nextMatchView(program.snapshot.nextMatch),
    issues: [...program.issues]
  }
}

export function createStandbyPageData(program: BroadcastProgram): StandbyPageData | null {
  if (program.type !== 'standby') return null
  const nextMatch = nextMatchView(program.snapshot.nextMatch)
  const match = program.snapshot.match
  const previousResult = program.snapshot.seriesEnded
    ? {
        teamA: teamView(match.team_a),
        teamB: teamView(match.team_b),
        finalSeriesScore: { ...program.snapshot.seriesScore },
        winnerTeamId: seriesWinnerTeamId(program)
      }
    : null
  return {
    page: 'standby',
    sourceMatchId: String(program.sourceMatchId),
    previousResult,
    nextMatch,
    nextMatchStatus: nextMatch?.status ?? 'not_configured',
    issues: [...program.issues]
  }
}
