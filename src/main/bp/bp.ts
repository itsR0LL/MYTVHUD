import type { IpcMain } from 'electron'
import { databaseService } from '../database/database'
import {
  createDefaultBPState,
  BP_MATCH_TYPES,
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
  const currentMatchId = await databaseService.settings.get('currentMatchId')
  if (typeof currentMatchId !== 'string' && typeof currentMatchId !== 'number') return null

  const match = await databaseService.matchs.get(String(currentMatchId))
  if (typeof match !== 'object' || match === null || Array.isArray(match)) return null
  if (!BP_MATCH_TYPES.includes(match.type)) return null

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

export function getBPState(): BPState {
  return normalizeBPState(liveBPState)
}

export async function getBPPayload(): Promise<BPPayload> {
  const [state, match] = await Promise.all([Promise.resolve(getBPState()), getCurrentMatch()])
  return { state, match }
}

export async function saveBPState(value: unknown): Promise<BPPayload> {
  const nextState = normalizeBPState(value)
  liveBPState = {
    ...nextState,
    sequence: liveBPState.sequence
  }
  const payload = { state: getBPState(), match: await getCurrentMatch() }
  publishPayload?.(payload)
  return payload
}

export async function setBPContent(value: BPContentInput): Promise<BPPayload> {
  liveBPState = {
    ...liveBPState,
    sequence: normalizeBPSequence(value?.sequence),
    visible: false
  }
  const payload = { state: getBPState(), match: await getCurrentMatch() }
  publishPayload?.(payload)
  return payload
}

export async function removeDeprecatedBPState(): Promise<void> {
  await databaseService.additional.remove(BP_STATE_KEY)
}

export function setBPPublisher(publisher: (payload: BPPayload) => void): void {
  publishPayload = publisher
}

export function registerBPIPC(ipc: IpcMain): void {
  ipc.handle('bp:get-state', () => getBPPayload())
  ipc.handle('bp:set-state', (_event, state: unknown) => saveBPState(state))
  ipc.handle('bp:set-content', (_event, content: BPContentInput) => setBPContent(content))
}
