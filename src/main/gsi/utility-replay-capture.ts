import type { CSGO } from '../csgo-extended'
import type { BPMapId } from '../../shared/bp'
import { RADAR_MAP_CONFIGS, projectWorldPositionToRadar } from '../../shared/radar'
import {
  UTILITY_REPLAY_EVENT_TYPES,
  UTILITY_REPLAY_ROUND_DURATION_MS,
  createDefaultMatchUtilityReplayState,
  createEmptyMapUtilityReplay,
  finalizeMapUtilityReplay,
  normalizeMatchUtilityReplayState,
  type MapUtilityReplay,
  type MatchUtilityReplayStateV1,
  type UtilityReplayEvent,
  type UtilityReplayEventType,
  type UtilityReplayPlayerPath,
  type UtilityReplayRound,
  type UtilityReplaySide
} from '../../shared/utility-replay'
import type { ResolvedTeamSides } from './match-runtime'

const INFERNO_SAMPLE_INTERVAL_MS = 100
const PLAYER_PATH_SAMPLE_INTERVAL_MS = 250
const FLASH_EXPLOSION_LIFETIME_SECONDS = 1.45
const SMOKE_EFFECT_DURATION_SECONDS = 16.5

export interface UtilityReplayMatchContext {
  matchId: string
  teamAId: string
  teamBId: string
}

export interface UtilityReplayOwnerObservation {
  observedAtMs: number
  mapId: BPMapId
  roundIndex: number
  grenadeId: string
  grenadeType: UtilityReplayEventType
  owner: string
  matchedSteamId: string | null
  playerSteamIds: string[]
}

export interface UtilityReplayCaptureDiagnostics {
  processedFrames: number
  supportedGrenadeObservations: number
  matchedOwnerObservations: number
  unmatchedOwnerObservations: number
  lastFrameAtMs: number | null
  lastOwnerObservation: UtilityReplayOwnerObservation | null
  lastUnmatchedOwnerObservation: UtilityReplayOwnerObservation | null
}

export interface CompletedUtilityReplayRound {
  matchId: string
  replay: MapUtilityReplay
}

interface ArmedRound {
  matchId: string
  mapId: BPMapId
  scoreAtStart: number
  teamCTId: string
  teamTId: string
}

interface ActiveRound extends ArmedRound {
  roundIndex: number
  startedAtMs: number
  events: Map<string, UtilityReplayEvent>
  playerPaths: Map<string, UtilityReplayPlayerPath>
  unassignedGrenadeIds: Set<string>
}

function createEmptyDiagnostics(): UtilityReplayCaptureDiagnostics {
  return {
    processedFrames: 0,
    supportedGrenadeObservations: 0,
    matchedOwnerObservations: 0,
    unmatchedOwnerObservations: 0,
    lastFrameAtMs: null,
    lastOwnerObservation: null,
    lastUnmatchedOwnerObservation: null
  }
}

function isBPMapId(value: unknown): value is BPMapId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RADAR_MAP_CONFIGS, value)
}

function mapScore(data: CSGO): number | null {
  const ctScore = Number(data.map?.team_ct?.score)
  const tScore = Number(data.map?.team_t?.score)
  return Number.isInteger(ctScore) && ctScore >= 0 && Number.isInteger(tScore) && tScore >= 0
    ? ctScore + tScore
    : null
}

function eventKey(type: UtilityReplayEventType, grenadeId: string): string {
  return `${type}:${grenadeId}`
}

function createEvent(
  round: ActiveRound,
  grenadeId: string,
  teamId: string,
  side: UtilityReplaySide,
  type: UtilityReplayEventType
): UtilityReplayEvent {
  return {
    id: `${round.roundIndex}:${type}:${grenadeId}`,
    grenadeId,
    roundIndex: round.roundIndex,
    teamId,
    side,
    type,
    trajectory: [],
    flameFrames: [],
    effectStartedAtMs: null,
    effectEndedAtMs: null,
    explodedAtMs: null,
    endedAtMs: null
  }
}

function appendTrajectoryPoint(
  event: UtilityReplayEvent,
  mapId: BPMapId,
  elapsedMs: number,
  position: readonly number[]
): void {
  const radarPosition = projectWorldPositionToRadar(mapId, position)
  if (!radarPosition) return
  const previous = event.trajectory.at(-1)
  if (previous && previous[1] === radarPosition[0] && previous[2] === radarPosition[1]) {
    return
  }
  event.trajectory.push([elapsedMs, radarPosition[0], radarPosition[1]])
}

function appendInfernoFrame(
  event: UtilityReplayEvent,
  mapId: BPMapId,
  elapsedMs: number,
  flames: Array<{ id: string; position: number[] }>
): void {
  const previous = event.flameFrames.at(-1)
  if (previous && elapsedMs - previous[0] < INFERNO_SAMPLE_INTERVAL_MS) return
  const positions = [...flames]
    .sort((first, second) => first.id.localeCompare(second.id))
    .map((flame) => projectWorldPositionToRadar(mapId, flame.position))
    .filter((position): position is [number, number] => position !== null)
  if (
    previous &&
    previous[1].length === positions.length &&
    previous[1].every(
      (position, index) =>
        position[0] === positions[index][0] && position[1] === positions[index][1]
    )
  ) {
    return
  }
  event.flameFrames.push([elapsedMs, positions])
}

function appendPlayerPathPoints(
  round: ActiveRound,
  data: CSGO,
  resolvedSides: ResolvedTeamSides,
  activeTeamIds: Set<string>,
  elapsedMs: number
): void {
  for (const player of data.players) {
    const side = player.team?.side
    if (side !== 'CT' && side !== 'T') continue
    if (!Array.isArray(player.position) || player.state?.health === 0) continue
    const teamId = side === 'CT' ? resolvedSides.CT : resolvedSides.T
    if (!activeTeamIds.has(teamId)) continue
    const position = projectWorldPositionToRadar(round.mapId, player.position)
    if (!position) continue
    let path = round.playerPaths.get(player.steamid)
    if (!path) {
      path = {
        steamId: player.steamid,
        roundIndex: round.roundIndex,
        teamId,
        side,
        trajectory: []
      }
      round.playerPaths.set(player.steamid, path)
    }
    const previous = path.trajectory.at(-1)
    if (previous && previous[1] === position[0] && previous[2] === position[1]) continue
    if (previous && elapsedMs - previous[0] < PLAYER_PATH_SAMPLE_INTERVAL_MS) continue
    path.trajectory.push([elapsedMs, position[0], position[1]])
  }
}

function ownerTeam(
  data: CSGO,
  owner: string,
  resolvedSides: ResolvedTeamSides,
  activeTeamIds: Set<string>
): { side: UtilityReplaySide; teamId: string; steamid: string } | null {
  const player = data.players.find((item) => item.steamid === owner)
  if (!player) return null
  const side = player.team?.side
  if (side !== 'CT' && side !== 'T') return null
  const teamId = side === 'CT' ? resolvedSides.CT : resolvedSides.T
  return activeTeamIds.has(teamId) ? { side, teamId, steamid: player.steamid } : null
}

function finishMissingEvents(
  round: ActiveRound,
  seenEventKeys: Set<string>,
  elapsedMs: number
): void {
  for (const [key, event] of round.events) {
    if (seenEventKeys.has(key) || event.endedAtMs !== null) continue
    event.endedAtMs = elapsedMs
    if (
      (event.type === 'smoke' || event.type === 'inferno') &&
      event.effectStartedAtMs !== null &&
      event.effectEndedAtMs === null
    ) {
      event.effectEndedAtMs = elapsedMs
    }
  }
}

function sameRoundIdentity(
  round: ArmedRound,
  matchId: string,
  mapId: BPMapId,
  scoreAtStart: number
): boolean {
  return round.matchId === matchId && round.mapId === mapId && round.scoreAtStart === scoreAtStart
}

export class UtilityReplayCapture {
  private liveState = createDefaultMatchUtilityReplayState()
  private activeRound: ActiveRound | null = null
  private armedRound: ArmedRound | null = null
  private diagnostics = createEmptyDiagnostics()

  replaceState(value: unknown): void {
    this.liveState = normalizeMatchUtilityReplayState(value)
    this.activeRound = null
    this.armedRound = null
  }

  processFrame(
    data: CSGO,
    match: UtilityReplayMatchContext | null,
    resolvedSides: ResolvedTeamSides | null,
    receivedAtMs: number
  ): CompletedUtilityReplayRound | null {
    this.diagnostics.processedFrames += 1
    this.diagnostics.lastFrameAtMs = receivedAtMs
    if (!data.map || !isBPMapId(data.map.name)) return null
    const score = mapScore(data)
    if (score === null) return null
    const mapId = data.map.name

    if (this.activeRound && this.activeRound.mapId !== mapId) {
      this.activeRound = null
    }
    if (this.armedRound && this.armedRound.mapId !== mapId) {
      this.armedRound = null
    }

    let completedRound: CompletedUtilityReplayRound | null = null
    if (
      this.activeRound &&
      this.activeRound.mapId === mapId &&
      score > this.activeRound.scoreAtStart
    ) {
      const completedMatchId = this.activeRound.matchId
      const replay = this.finishActiveRound(receivedAtMs)
      if (replay) completedRound = { matchId: completedMatchId, replay }
    }

    if (!match || !resolvedSides || match.teamAId === match.teamBId) {
      return completedRound
    }
    this.ensureStateMatch(match.matchId)
    const activeTeamIds = new Set([match.teamAId, match.teamBId])
    const roundPhase = data.round?.phase
    if (roundPhase === 'freezetime') {
      if (this.activeRound && sameRoundIdentity(this.activeRound, match.matchId, mapId, score)) {
        this.activeRound = null
      }
      this.armedRound = {
        matchId: match.matchId,
        mapId,
        scoreAtStart: score,
        teamCTId: resolvedSides.CT,
        teamTId: resolvedSides.T
      }
    } else if (roundPhase === 'live' && data.map.phase === 'live') {
      if (
        !this.activeRound &&
        this.armedRound &&
        sameRoundIdentity(this.armedRound, match.matchId, mapId, score)
      ) {
        this.activeRound = {
          ...this.armedRound,
          roundIndex: score + 1,
          startedAtMs: receivedAtMs,
          events: new Map(),
          playerPaths: new Map(),
          unassignedGrenadeIds: new Set()
        }
      }
      if (this.activeRound && sameRoundIdentity(this.activeRound, match.matchId, mapId, score)) {
        this.captureRoundFrame(this.activeRound, data, resolvedSides, activeTeamIds, receivedAtMs)
      }
    }
    return completedRound
  }

  finalizeMap(mapId: BPMapId, expectedRoundCount: number): MapUtilityReplay {
    const replay = finalizeMapUtilityReplay(
      this.liveState.maps[mapId] ?? createEmptyMapUtilityReplay(mapId),
      expectedRoundCount
    )
    this.liveState.maps[mapId] = replay
    return replay
  }

  getMap(mapId: BPMapId): MapUtilityReplay | null {
    return this.liveState.maps[mapId] ?? null
  }

  getMatchId(): string | null {
    return this.liveState.matchId
  }

  reset(matchId: string | number | null = null): MatchUtilityReplayStateV1 {
    this.liveState = createDefaultMatchUtilityReplayState(matchId)
    this.activeRound = null
    this.armedRound = null
    this.diagnostics = createEmptyDiagnostics()
    return normalizeMatchUtilityReplayState(this.liveState)
  }

  getDiagnostics(): UtilityReplayCaptureDiagnostics {
    return {
      ...this.diagnostics,
      lastOwnerObservation: this.diagnostics.lastOwnerObservation
        ? {
            ...this.diagnostics.lastOwnerObservation,
            playerSteamIds: [...this.diagnostics.lastOwnerObservation.playerSteamIds]
          }
        : null,
      lastUnmatchedOwnerObservation: this.diagnostics.lastUnmatchedOwnerObservation
        ? {
            ...this.diagnostics.lastUnmatchedOwnerObservation,
            playerSteamIds: [...this.diagnostics.lastUnmatchedOwnerObservation.playerSteamIds]
          }
        : null
    }
  }

  private ensureStateMatch(matchId: string): void {
    if (this.liveState.matchId === matchId) return
    this.liveState = createDefaultMatchUtilityReplayState(matchId)
    this.activeRound = null
    this.armedRound = null
  }

  private recordOwnerObservation(
    round: ActiveRound,
    data: CSGO,
    grenadeId: string,
    grenadeType: UtilityReplayEventType,
    owner: string,
    matchedSteamId: string | null,
    observedAtMs: number
  ): void {
    const observation: UtilityReplayOwnerObservation = {
      observedAtMs,
      mapId: round.mapId,
      roundIndex: round.roundIndex,
      grenadeId,
      grenadeType,
      owner,
      matchedSteamId,
      playerSteamIds: data.players.map((player) => player.steamid)
    }
    this.diagnostics.supportedGrenadeObservations += 1
    this.diagnostics.lastOwnerObservation = observation
    if (matchedSteamId === null) {
      this.diagnostics.unmatchedOwnerObservations += 1
      this.diagnostics.lastUnmatchedOwnerObservation = observation
    } else {
      this.diagnostics.matchedOwnerObservations += 1
    }
  }

  private captureRoundFrame(
    round: ActiveRound,
    data: CSGO,
    resolvedSides: ResolvedTeamSides,
    activeTeamIds: Set<string>,
    receivedAtMs: number
  ): void {
    const elapsedMs = Math.max(
      0,
      Math.min(UTILITY_REPLAY_ROUND_DURATION_MS, Math.round(receivedAtMs - round.startedAtMs))
    )
    if (receivedAtMs - round.startedAtMs > UTILITY_REPLAY_ROUND_DURATION_MS) {
      return
    }

    const seenEventKeys = new Set<string>()
    appendPlayerPathPoints(round, data, resolvedSides, activeTeamIds, elapsedMs)
    for (const grenade of data.grenades) {
      if (!UTILITY_REPLAY_EVENT_TYPES.includes(grenade.type as UtilityReplayEventType)) {
        continue
      }
      const type = grenade.type as UtilityReplayEventType
      const grenadeId = String(grenade.id)
      const key = eventKey(type, grenadeId)
      const rawOwner = grenade.owner
      const owner = ownerTeam(data, rawOwner, resolvedSides, activeTeamIds)
      this.recordOwnerObservation(
        round,
        data,
        grenadeId,
        type,
        rawOwner,
        owner?.steamid ?? null,
        receivedAtMs
      )
      if (!owner) {
        round.unassignedGrenadeIds.add(key)
        continue
      }
      round.unassignedGrenadeIds.delete(key)
      seenEventKeys.add(key)
      let event = round.events.get(key)
      if (!event) {
        event = createEvent(round, grenadeId, owner.teamId, owner.side, type)
        round.events.set(key, event)
      }

      if ('position' in grenade) {
        appendTrajectoryPoint(event, round.mapId, elapsedMs, grenade.position)
      }
      if (grenade.type === 'smoke') {
        if (grenade.effecttime > 0 && event.effectStartedAtMs === null) {
          event.effectStartedAtMs = elapsedMs
        }
        if (grenade.effecttime >= SMOKE_EFFECT_DURATION_SECONDS && event.effectEndedAtMs === null) {
          event.effectEndedAtMs = elapsedMs
          event.endedAtMs = elapsedMs
        }
      } else if (
        grenade.type === 'flashbang' &&
        grenade.lifetime >= FLASH_EXPLOSION_LIFETIME_SECONDS &&
        event.explodedAtMs === null
      ) {
        event.explodedAtMs = elapsedMs
      } else if (grenade.type === 'inferno') {
        if (event.effectStartedAtMs === null) {
          event.effectStartedAtMs = elapsedMs
        }
        appendInfernoFrame(event, round.mapId, elapsedMs, grenade.flames)
      }
    }
    finishMissingEvents(round, seenEventKeys, elapsedMs)
  }

  private finishActiveRound(receivedAtMs: number): MapUtilityReplay | null {
    if (!this.activeRound) return null
    const elapsedMs = Math.max(
      0,
      Math.min(
        UTILITY_REPLAY_ROUND_DURATION_MS,
        Math.round(receivedAtMs - this.activeRound.startedAtMs)
      )
    )
    for (const event of this.activeRound.events.values()) {
      if (event.endedAtMs === null) event.endedAtMs = elapsedMs
      if (
        (event.type === 'smoke' || event.type === 'inferno') &&
        event.effectStartedAtMs !== null &&
        event.effectEndedAtMs === null
      ) {
        event.effectEndedAtMs = elapsedMs
      }
    }

    const replay =
      this.liveState.maps[this.activeRound.mapId] ??
      createEmptyMapUtilityReplay(this.activeRound.mapId)
    const roundRecord: UtilityReplayRound = {
      roundIndex: this.activeRound.roundIndex,
      teamCTId: this.activeRound.teamCTId,
      teamTId: this.activeRound.teamTId,
      unassignedGrenadeCount: this.activeRound.unassignedGrenadeIds.size
    }
    replay.rounds = [
      ...replay.rounds.filter((round) => round.roundIndex !== roundRecord.roundIndex),
      roundRecord
    ].sort((first, second) => first.roundIndex - second.roundIndex)
    replay.events = [
      ...replay.events.filter((event) => event.roundIndex !== roundRecord.roundIndex),
      ...this.activeRound.events.values()
    ].sort(
      (first, second) => first.roundIndex - second.roundIndex || first.id.localeCompare(second.id)
    )
    replay.playerPaths = [
      ...replay.playerPaths.filter((path) => path.roundIndex !== roundRecord.roundIndex),
      ...this.activeRound.playerPaths.values()
    ].sort(
      (first, second) =>
        first.roundIndex - second.roundIndex || first.steamId.localeCompare(second.steamId)
    )
    replay.unassignedGrenadeCount = replay.rounds.reduce(
      (sum, round) => sum + round.unassignedGrenadeCount,
      0
    )
    replay.complete = false
    this.liveState.maps[this.activeRound.mapId] = replay
    this.activeRound = null
    this.armedRound = null
    return replay
  }
}
