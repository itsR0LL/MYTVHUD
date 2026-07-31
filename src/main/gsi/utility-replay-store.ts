import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BP_MAPS, type BPMapId } from '../../shared/bp'
import {
  createDefaultMatchUtilityReplayState,
  normalizeMapUtilityReplay,
  type MapUtilityReplay,
  type MatchUtilityReplayStateV1
} from '../../shared/utility-replay'
import { dbDir } from '../database/database'

const UTILITY_REPLAY_STORAGE_ROOT = path.resolve(dbDir, 'utility-replays')

function matchStorageId(matchId: string | number): string {
  return createHash('sha256').update(String(matchId)).digest('hex')
}

function matchStorageDirectory(matchId: string | number): string {
  return path.resolve(UTILITY_REPLAY_STORAGE_ROOT, matchStorageId(matchId))
}

function assertDirectChild(parent: string, target: string): void {
  if (path.dirname(target) !== parent) {
    throw new Error('道具回放存储路径越界')
  }
}

function mapStoragePath(matchId: string | number, mapId: BPMapId): string {
  const directory = matchStorageDirectory(matchId)
  const target = path.resolve(directory, `${mapId}.json`)
  assertDirectChild(directory, target)
  return target
}

async function readStoredMap(
  matchId: string | number,
  mapId: BPMapId
): Promise<MapUtilityReplay | null> {
  const filePath = mapStoragePath(matchId, mapId)
  try {
    const stored = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    const replay = normalizeMapUtilityReplay(stored)
    return replay?.mapId === mapId ? replay : null
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
    if (code === 'ENOENT') return null
    throw error
  }
}

export async function loadMatchUtilityReplayState(
  matchId: string | number
): Promise<MatchUtilityReplayStateV1> {
  const entries = await Promise.all(
    BP_MAPS.map(async ({ id }) => [id, await readStoredMap(matchId, id)] as const)
  )
  return {
    ...createDefaultMatchUtilityReplayState(matchId),
    maps: Object.fromEntries(
      entries.filter((entry): entry is readonly [BPMapId, MapUtilityReplay] => entry[1] !== null)
    )
  }
}

export async function getStoredMapUtilityReplay(
  matchId: string | number,
  mapId: BPMapId
): Promise<MapUtilityReplay | null> {
  return readStoredMap(matchId, mapId)
}

export async function storeMapUtilityReplay(
  matchId: string | number,
  replay: MapUtilityReplay
): Promise<void> {
  const normalized = normalizeMapUtilityReplay(replay)
  if (!normalized || normalized.mapId !== replay.mapId) {
    throw new Error('拒绝保存无效的地图道具回放')
  }
  const directory = matchStorageDirectory(matchId)
  const target = mapStoragePath(matchId, normalized.mapId)
  const temporary = path.resolve(directory, `${normalized.mapId}.${randomUUID()}.tmp`)
  assertDirectChild(directory, temporary)
  await mkdir(directory, { recursive: true })
  await writeFile(temporary, JSON.stringify(normalized), 'utf8')
  try {
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function clearMatchUtilityReplayStorage(matchId: string | number): Promise<void> {
  const target = matchStorageDirectory(matchId)
  assertDirectChild(UTILITY_REPLAY_STORAGE_ROOT, target)
  await rm(target, { recursive: true, force: true })
}

export async function clearAllUtilityReplayStorage(): Promise<void> {
  const target = path.resolve(UTILITY_REPLAY_STORAGE_ROOT)
  if (target === path.parse(target).root || path.dirname(target) !== path.resolve(dbDir)) {
    throw new Error('拒绝清除越界的道具回放存储目录')
  }
  await rm(target, { recursive: true, force: true })
}
