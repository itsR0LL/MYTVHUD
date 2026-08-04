import type { BaseEntity } from '../database/database'
import type { CSGO } from '../csgo-extended'
import { getTeamAbbreviation } from '../../shared/bp'

export interface GSIRuntimeContext {
  players: BaseEntity[]
  teams: BaseEntity[]
  activeMatch: BaseEntity | null
}

export interface ResolvedTeamSides {
  CT: string
  T: string
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function entityId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function activeMatchTeamIds(activeMatch: BaseEntity | null): [string, string] | null {
  if (!activeMatch || !isRecord(activeMatch.team_a) || !isRecord(activeMatch.team_b)) return null
  const teamAId = entityId(activeMatch.team_a.id)
  const teamBId = entityId(activeMatch.team_b.id)
  if (!teamAId || !teamBId || teamAId === teamBId) return null
  return [teamAId, teamBId]
}

export function activeMatchFromSnapshot(
  settings: Record<string, any>,
  matches: Record<string, BaseEntity>
): BaseEntity | null {
  const currentMatchId = entityId(settings.currentMatchId)
  if (!currentMatchId) return null
  const match = matches[currentMatchId]
  return match && entityId(match.id) ? match : null
}

export function resolveActiveMatchTeamSides(
  data: CSGO,
  context: GSIRuntimeContext
): ResolvedTeamSides | null {
  const teamIds = activeMatchTeamIds(context.activeMatch)
  if (!teamIds || !Array.isArray(data.players)) return null
  const [teamAId, teamBId] = teamIds
  const activeTeamIds = new Set(teamIds)
  const teamBySteamId = new Map<string, string>()

  for (const player of context.players) {
    if (player.type !== 'player' || typeof player.steamid !== 'string') continue
    const steamid = player.steamid.trim()
    const teamId = entityId(player.team_id)
    if (!steamid || !teamId || !activeTeamIds.has(teamId)) continue
    if (teamBySteamId.has(steamid)) return null
    teamBySteamId.set(steamid, teamId)
  }

  const counts = {
    CT: new Map<string, number>(),
    T: new Map<string, number>()
  }

  for (const player of data.players) {
    const steamid = typeof player.steamid === 'string' ? player.steamid.trim() : ''
    const side = player.team?.side
    if (!steamid || (side !== 'CT' && side !== 'T')) continue
    const teamId = teamBySteamId.get(steamid)
    if (!teamId) continue
    counts[side].set(teamId, (counts[side].get(teamId) ?? 0) + 1)
  }

  const strongestTeam = (side: 'CT' | 'T'): string | null => {
    const teamACount = counts[side].get(teamAId) ?? 0
    const teamBCount = counts[side].get(teamBId) ?? 0
    if (teamACount === teamBCount) return null
    return teamACount > teamBCount ? teamAId : teamBId
  }

  const teamCT = strongestTeam('CT')
  const teamT = strongestTeam('T')
  if (!teamCT || !teamT || teamCT === teamT) return null
  return { CT: teamCT, T: teamT }
}

function teamRecordById(context: GSIRuntimeContext, id: string): Record<string, any> | null {
  const storedTeam = context.teams.find((team) => String(team.id) === id)
  if (storedTeam) return storedTeam
  const match = context.activeMatch
  if (!match) return null
  for (const slot of ['team_a', 'team_b'] as const) {
    const team = match[slot]
    if (isRecord(team) && entityId(team.id) === id) return team
  }
  return null
}

export function injectResolvedTeamInfo(
  data: CSGO,
  context: GSIRuntimeContext,
  resolvedSides: ResolvedTeamSides | null
): CSGO {
  if (!resolvedSides || !data.map) return data
  const teamCTRecord = teamRecordById(context, resolvedSides.CT)
  const teamTRecord = teamRecordById(context, resolvedSides.T)
  if (!teamCTRecord || !teamTRecord) return data

  const createInfos = (team: Record<string, any>): Record<string, any> => {
    const abbreviation = getTeamAbbreviation({
      name: typeof team.name === 'string' ? team.name : '',
      name_ingame: typeof team.name_ingame === 'string' ? team.name_ingame : ''
    })
    const infos: Record<string, any> = { ...team, name: abbreviation }
    delete infos.avatar
    return infos
  }
  const infosBySide = {
    CT: createInfos(teamCTRecord),
    T: createInfos(teamTRecord)
  }
  const teamBySide = {
    CT: { ...data.map.team_ct, infos: infosBySide.CT },
    T: { ...data.map.team_t, infos: infosBySide.T }
  }
  const attachPlayerTeam = (player: CSGO['players'][number]) => {
    const side = player.team?.side
    return side === 'CT' || side === 'T' ? { ...player, team: teamBySide[side] } : player
  }

  return {
    ...data,
    map: {
      ...data.map,
      team_ct: teamBySide.CT,
      team_t: teamBySide.T
    },
    players: data.players.map(attachPlayerTeam),
    player: data.player ? attachPlayerTeam(data.player) : data.player
  } as CSGO
}

export function buildActiveMatchScoreUpdate(
  data: CSGO,
  activeMatch: BaseEntity | null,
  resolvedSides: ResolvedTeamSides | null
): BaseEntity | null {
  if (!activeMatch || !resolvedSides || !data.map || !Array.isArray(activeMatch.maps)) return null
  if (data.map.phase !== 'live' && data.map.phase !== 'gameover') return null

  const teamIds = activeMatchTeamIds(activeMatch)
  if (!teamIds) return null
  const [teamAId, teamBId] = teamIds
  const normalSides = resolvedSides.CT === teamAId && resolvedSides.T === teamBId
  const reversedSides = resolvedSides.CT === teamBId && resolvedSides.T === teamAId
  if (!normalSides && !reversedSides) return null

  const ctScore = Number(data.map.team_ct.score)
  const tScore = Number(data.map.team_t.score)
  if (!Number.isInteger(ctScore) || ctScore < 0 || !Number.isInteger(tScore) || tScore < 0) {
    return null
  }

  const mapIndex = activeMatch.maps.findIndex(
    (map: unknown) => isRecord(map) && map.name === data.map.name
  )
  if (mapIndex < 0) return null
  const currentMap = activeMatch.maps[mapIndex]
  if (!isRecord(currentMap) || currentMap.status === 'finished') return null
  if (
    currentMap.status !== 'live' &&
    activeMatch.maps.some(
      (map: unknown, index: number) => index !== mapIndex && isRecord(map) && map.status === 'live'
    )
  ) {
    return null
  }

  const ascore = normalSides ? ctScore : tScore
  const bscore = normalSides ? tScore : ctScore
  const status = data.map.phase === 'gameover' && ascore !== bscore ? 'finished' : 'live'
  if (
    Number(currentMap.ascore) === ascore &&
    Number(currentMap.bscore) === bscore &&
    currentMap.status === status
  ) {
    return null
  }

  const maps = activeMatch.maps.map((map: unknown, index: number) =>
    index === mapIndex && isRecord(map) ? { ...map, ascore, bscore, status } : map
  )
  return { ...activeMatch, maps }
}
