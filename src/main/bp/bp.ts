import type { IpcMain } from 'electron'
import { databaseService, type BaseEntity } from '../database/database'
import {
  createDefaultBPState,
  BP_MATCH_TYPES,
  isBPSequenceComplete,
  normalizeBPSequence,
  normalizeBPState,
  type BPContentInput,
  type BPMatch,
  type BPPayload,
  type BPState,
  type BPTeam
} from '../../shared/bp'

const BP_STATE_KEY = 'bpState'

let publishPayload: ((payload: BPPayload) => void) | null = null
let liveBPState = createDefaultBPState()
let beforeShowOutput: (() => Promise<void>) | null = null
let afterContentPrepared:
  | ((match: BPMatch, sequence: ReturnType<typeof normalizeBPSequence>) => Promise<void>)
  | null = null

function normalizeTeam(value: unknown): BPTeam | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const team = value as Record<string, unknown>
  if (typeof team.id !== 'string' && typeof team.id !== 'number') return null
  if (typeof team.name !== 'string' || typeof team.name_ingame !== 'string') return null

  return {
    id: team.id,
    name: team.name,
    name_ingame: team.name_ingame,
    ...(typeof team.avatar === 'string' ? { avatar: team.avatar } : {})
  }
}

async function getCurrentMatch(): Promise<BPMatch | null> {
  const match = await getCurrentMatchRecord()
  if (!match || !BP_MATCH_TYPES.includes(match.type)) return null

  const teamA = normalizeTeam(match.team_a)
  const teamB = normalizeTeam(match.team_b)
  if (!teamA || !teamB) return null

  const [storedTeamA, storedTeamB] = await Promise.all([
    databaseService.teams.getById(teamA.id),
    databaseService.teams.getById(teamB.id)
  ])

  return {
    id: match.id,
    type: match.type,
    team_a: normalizeTeam(storedTeamA) ?? teamA,
    team_b: normalizeTeam(storedTeamB) ?? teamB
  }
}

async function getCurrentMatchRecord(): Promise<BaseEntity | null> {
  const currentMatchId = await databaseService.settings.get('currentMatchId')
  if (typeof currentMatchId !== 'string' && typeof currentMatchId !== 'number') return null

  const match = await databaseService.matchs.get(String(currentMatchId))
  if (typeof match !== 'object' || match === null || Array.isArray(match)) return null
  return match
}

export function getBPState(): BPState {
  return normalizeBPState(liveBPState)
}

export async function getBPPayload(): Promise<BPPayload> {
  const [record, match] = await Promise.all([getCurrentMatchRecord(), getCurrentMatch()])
  const sequence = normalizeBPSequence(record?.bpSequence)
  liveBPState = { ...liveBPState, sequence }
  return { state: getBPState(), match }
}

export async function saveBPState(value: unknown): Promise<BPPayload> {
  const nextState = normalizeBPState(value)
  const shouldStartPlayback =
    nextState.visible &&
    nextState.playbackStarted &&
    (!liveBPState.playbackStarted || nextState.revision !== liveBPState.revision)
  if (shouldStartPlayback) {
    const [record, match] = await Promise.all([getCurrentMatchRecord(), getCurrentMatch()])
    if (!match) throw new Error('当前比赛数据不完整，无法开始展示 BP')
    const sequence = normalizeBPSequence(record?.bpSequence)
    if (!isBPSequenceComplete(sequence, match.type)) {
      throw new Error('完整七步 BP 尚未保存，无法开始展示')
    }
    await beforeShowOutput?.()
  }
  liveBPState = {
    ...liveBPState,
    visible: nextState.visible,
    playbackStarted: nextState.playbackStarted,
    playbackStartedAtMs: shouldStartPlayback
      ? Date.now()
      : nextState.playbackStarted
        ? nextState.playbackStartedAtMs
        : null,
    animationEnabled: nextState.animationEnabled,
    revision: shouldStartPlayback ? liveBPState.revision + 1 : liveBPState.revision
  }
  const payload = await getBPPayload()
  publishPayload?.(payload)
  return payload
}

export async function hideBPOutput(): Promise<BPPayload> {
  if (!liveBPState.visible) return getBPPayload()
  liveBPState = {
    ...liveBPState,
    visible: false
  }
  const payload = await getBPPayload()
  publishPayload?.(payload)
  return payload
}

export async function setBPContent(value: BPContentInput): Promise<BPPayload> {
  const sequence = normalizeBPSequence(value?.sequence)
  const [record, match] = await Promise.all([getCurrentMatchRecord(), getCurrentMatch()])
  if (!record || !match) throw new Error('当前比赛数据不完整，无法保存 BP')
  if (!isBPSequenceComplete(sequence, match.type)) {
    throw new Error('BP 内容不完整或动作顺序与当前赛制不一致')
  }
  await databaseService.matchs.modify(String(record.id), { bpSequence: sequence })

  liveBPState = {
    ...liveBPState,
    sequence,
    visible: false,
    playbackStarted: false,
    playbackStartedAtMs: null
  }
  const payload = { state: getBPState(), match }
  await afterContentPrepared?.(match, sequence)
  publishPayload?.(payload)
  return payload
}

export async function resetBPBroadcastState(): Promise<BPPayload> {
  const match = await getCurrentMatch()
  liveBPState = {
    ...createDefaultBPState(),
    animationEnabled: liveBPState.animationEnabled,
    revision: liveBPState.revision + 1
  }
  const payload = { state: getBPState(), match }
  publishPayload?.(payload)
  return payload
}

export async function removeDeprecatedBPState(): Promise<void> {
  await databaseService.additional.remove(BP_STATE_KEY)
}

export function setBPPublisher(publisher: (payload: BPPayload) => void): void {
  publishPayload = publisher
}

export function setBPStartOutputGuard(guard: () => Promise<void>): void {
  beforeShowOutput = guard
}

export function setBPContentPreparedHandler(
  handler: (match: BPMatch, sequence: ReturnType<typeof normalizeBPSequence>) => Promise<void>
): void {
  afterContentPrepared = handler
}

export function registerBPIPC(ipc: IpcMain): void {
  ipc.handle('bp:set-content', (_event, content: BPContentInput) => setBPContent(content))
}
