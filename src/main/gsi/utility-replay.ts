import type { CSGO } from '../csgo-extended'
import { databaseService, type BaseEntity } from '../database/database'
import type { BPMapId } from '../../shared/bp'
import {
  MATCH_UTILITY_REPLAY_STATE_KEY,
  createDefaultMatchUtilityReplayState,
  createEmptyMapUtilityReplay,
  finalizeMapUtilityReplay,
  normalizeMatchUtilityReplayState,
  type MapUtilityReplay,
  type MatchUtilityReplayStateV1
} from '../../shared/utility-replay'
import type { ResolvedTeamSides } from './match-runtime'
import {
  UtilityReplayCapture,
  type UtilityReplayCaptureDiagnostics,
  type UtilityReplayMatchContext
} from './utility-replay-capture'
import {
  clearAllUtilityReplayStorage,
  clearMatchUtilityReplayStorage,
  getStoredMapUtilityReplay,
  loadMatchUtilityReplayState,
  storeMapUtilityReplay
} from './utility-replay-store'

const capture = new UtilityReplayCapture()
let initialized = false
let initializePromise: Promise<void> | null = null
let mutationQueue: Promise<void> = Promise.resolve()

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation)
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function entityId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function matchContext(activeMatch: BaseEntity | null): UtilityReplayMatchContext | null {
  const matchId = entityId(activeMatch?.id)
  const teamAId = entityId(activeMatch?.team_a?.id)
  const teamBId = entityId(activeMatch?.team_b?.id)
  return matchId && teamAId && teamBId && teamAId !== teamBId ? { matchId, teamAId, teamBId } : null
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return
  if (!initializePromise) {
    initializePromise = (async () => {
      const legacyStored = await databaseService.additional.get(MATCH_UTILITY_REPLAY_STATE_KEY)
      const legacyState = normalizeMatchUtilityReplayState(legacyStored)
      if (legacyState.matchId !== null) {
        await Promise.all(
          Object.values(legacyState.maps).map((replay) =>
            replay
              ? storeMapUtilityReplay(legacyState.matchId as string | number, replay)
              : Promise.resolve()
          )
        )
      }
      await databaseService.additional.remove(MATCH_UTILITY_REPLAY_STATE_KEY)
      const currentMatchId = entityId(await databaseService.settings.get('currentMatchId'))
      capture.replaceState(
        currentMatchId
          ? await loadMatchUtilityReplayState(currentMatchId)
          : createDefaultMatchUtilityReplayState()
      )
      initialized = true
    })().finally(() => {
      initializePromise = null
    })
  }
  await initializePromise
}

export async function initializeUtilityReplayCaptureState(): Promise<void> {
  await ensureInitialized()
}

export async function processUtilityReplayFrame(
  data: CSGO,
  activeMatch: BaseEntity | null,
  resolvedSides: ResolvedTeamSides | null,
  receivedAtMs: number
): Promise<void> {
  await enqueueMutation(async () => {
    await ensureInitialized()
    const completedRound = capture.processFrame(
      data,
      matchContext(activeMatch),
      resolvedSides,
      receivedAtMs
    )
    if (completedRound) {
      await storeMapUtilityReplay(completedRound.matchId, completedRound.replay)
    }
  })
}

export async function getFinalizedMapUtilityReplay(
  matchId: string | number,
  mapId: BPMapId,
  expectedRoundCount: number
): Promise<MapUtilityReplay> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    const normalizedMatchId = String(matchId)
    const replay =
      capture.getMatchId() === normalizedMatchId
        ? capture.finalizeMap(mapId, expectedRoundCount)
        : finalizeMapUtilityReplay(
            (await getStoredMapUtilityReplay(normalizedMatchId, mapId)) ??
              createEmptyMapUtilityReplay(mapId),
            expectedRoundCount
          )
    await storeMapUtilityReplay(normalizedMatchId, replay)
    return replay
  })
}

export async function getMapUtilityReplay(
  matchId: string | number,
  mapId: BPMapId
): Promise<MapUtilityReplay | null> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    const normalizedMatchId = String(matchId)
    return capture.getMatchId() === normalizedMatchId
      ? capture.getMap(mapId)
      : getStoredMapUtilityReplay(normalizedMatchId, mapId)
  })
}

export function getUtilityReplayCaptureDiagnostics(): UtilityReplayCaptureDiagnostics {
  return capture.getDiagnostics()
}

export async function resetUtilityReplayCaptureState(
  matchId: string | number | null = null
): Promise<MatchUtilityReplayStateV1> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    if (matchId === null) {
      await clearAllUtilityReplayStorage()
    } else {
      await clearMatchUtilityReplayStorage(matchId)
    }
    return capture.reset(matchId)
  })
}
