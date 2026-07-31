export interface MapScoreTimelinePoint {
  roundIndex: number
  teamAScore: number
  teamBScore: number
  winnerTeamId: string | null
}

export interface MapScoreTimelineV1 {
  version: 1
  complete: boolean
  points: MapScoreTimelinePoint[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

function normalizeTeamId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function normalizePoint(
  value: unknown,
  teamAId: string,
  teamBId: string
): MapScoreTimelinePoint | null {
  if (!isRecord(value)) return null
  const roundIndex = nonNegativeInteger(value.roundIndex)
  const teamAScore = nonNegativeInteger(value.teamAScore)
  const teamBScore = nonNegativeInteger(value.teamBScore)
  if (
    roundIndex === null ||
    roundIndex <= 0 ||
    teamAScore === null ||
    teamBScore === null ||
    teamAScore + teamBScore !== roundIndex
  ) {
    return null
  }
  const winnerTeamId = normalizeTeamId(value.winnerTeamId)
  if (winnerTeamId !== null && winnerTeamId !== teamAId && winnerTeamId !== teamBId) return null
  return { roundIndex, teamAScore, teamBScore, winnerTeamId }
}

function pointWinner(
  previous: MapScoreTimelinePoint | null,
  current: Pick<MapScoreTimelinePoint, 'teamAScore' | 'teamBScore'>,
  teamAId: string,
  teamBId: string
): string | null {
  const previousAScore = previous?.teamAScore ?? 0
  const previousBScore = previous?.teamBScore ?? 0
  if (current.teamAScore === previousAScore + 1 && current.teamBScore === previousBScore) {
    return teamAId
  }
  if (current.teamBScore === previousBScore + 1 && current.teamAScore === previousAScore) {
    return teamBId
  }
  return null
}

function isCompleteTimeline(
  points: readonly MapScoreTimelinePoint[],
  teamAId: string,
  teamBId: string
): boolean {
  if (points.length === 0) return false
  let previous: MapScoreTimelinePoint | null = null
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point.roundIndex !== index + 1) return false
    const winner = pointWinner(previous, point, teamAId, teamBId)
    if (winner === null || point.winnerTeamId !== winner) return false
    previous = point
  }
  return true
}

export function createEmptyMapScoreTimeline(): MapScoreTimelineV1 {
  return {
    version: 1,
    complete: false,
    points: []
  }
}

export function normalizeMapScoreTimeline(
  value: unknown,
  teamAIdValue: string | number,
  teamBIdValue: string | number
): MapScoreTimelineV1 {
  const teamAId = normalizeTeamId(teamAIdValue)
  const teamBId = normalizeTeamId(teamBIdValue)
  if (!teamAId || !teamBId || teamAId === teamBId || !isRecord(value) || value.version !== 1) {
    return createEmptyMapScoreTimeline()
  }

  const source = Array.isArray(value.points) ? value.points : []
  const byRound = new Map<number, MapScoreTimelinePoint>()
  for (const item of source) {
    const point = normalizePoint(item, teamAId, teamBId)
    if (point) byRound.set(point.roundIndex, point)
  }
  const points = [...byRound.values()].sort((first, second) => first.roundIndex - second.roundIndex)
  return {
    version: 1,
    complete: isCompleteTimeline(points, teamAId, teamBId),
    points
  }
}

export function recordObservedMapScore(
  value: MapScoreTimelineV1,
  teamAIdValue: string | number,
  teamBIdValue: string | number,
  teamAScoreValue: unknown,
  teamBScoreValue: unknown
): MapScoreTimelineV1 {
  const teamAId = normalizeTeamId(teamAIdValue)
  const teamBId = normalizeTeamId(teamBIdValue)
  const teamAScore = nonNegativeInteger(teamAScoreValue)
  const teamBScore = nonNegativeInteger(teamBScoreValue)
  if (!teamAId || !teamBId || teamAId === teamBId || teamAScore === null || teamBScore === null) {
    return normalizeMapScoreTimeline(value, teamAIdValue, teamBIdValue)
  }

  const current = normalizeMapScoreTimeline(value, teamAId, teamBId)
  const roundIndex = teamAScore + teamBScore
  if (roundIndex === 0) return current
  const existing = current.points.find((point) => point.roundIndex === roundIndex)
  if (existing?.teamAScore === teamAScore && existing.teamBScore === teamBScore) return current

  const previous =
    current.points
      .filter((point) => point.roundIndex < roundIndex)
      .sort((first, second) => second.roundIndex - first.roundIndex)[0] ?? null
  const point: MapScoreTimelinePoint = {
    roundIndex,
    teamAScore,
    teamBScore,
    winnerTeamId: pointWinner(previous, { teamAScore, teamBScore }, teamAId, teamBId)
  }
  return normalizeMapScoreTimeline(
    {
      version: 1,
      complete: false,
      points: [...current.points.filter((item) => item.roundIndex !== roundIndex), point]
    },
    teamAId,
    teamBId
  )
}

export function finalizeMapScoreTimeline(
  value: MapScoreTimelineV1,
  teamAIdValue: string | number,
  teamBIdValue: string | number,
  finalTeamAScoreValue: unknown,
  finalTeamBScoreValue: unknown
): MapScoreTimelineV1 {
  const normalized = normalizeMapScoreTimeline(value, teamAIdValue, teamBIdValue)
  const finalTeamAScore = nonNegativeInteger(finalTeamAScoreValue)
  const finalTeamBScore = nonNegativeInteger(finalTeamBScoreValue)
  const last = normalized.points.at(-1)
  const finalMatches =
    finalTeamAScore !== null &&
    finalTeamBScore !== null &&
    last?.teamAScore === finalTeamAScore &&
    last.teamBScore === finalTeamBScore
  return {
    ...normalized,
    complete: normalized.complete && finalMatches
  }
}
