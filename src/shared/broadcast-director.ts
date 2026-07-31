import type { BroadcastProgramType } from './broadcast-flow'
import type { BPMapId } from './bp'

export const BROADCAST_DIRECTOR_RUNTIME_KEY = 'broadcastDirectorRuntimeV1'
export const BROADCAST_DIRECTOR_STAGES = [
  'hidden',
  'warmup',
  'bp',
  'map_break',
  'series_end',
  'standby'
] as const
export const BROADCAST_DIRECTOR_HIDDEN_REASONS = ['idle', 'gameplay', 'manual'] as const
export const BROADCAST_DIRECTOR_VISIBLE_STAGES = [
  'warmup',
  'bp',
  'map_break',
  'series_end',
  'standby'
] as const

export type BroadcastDirectorStage = (typeof BROADCAST_DIRECTOR_STAGES)[number]
export type BroadcastDirectorVisibleStage = (typeof BROADCAST_DIRECTOR_VISIBLE_STAGES)[number]
export type BroadcastDirectorHiddenReason = (typeof BROADCAST_DIRECTOR_HIDDEN_REASONS)[number]

export interface BroadcastDirectorRuntimeV1 {
  version: 1
  stage: BroadcastDirectorStage
  hiddenReason: BroadcastDirectorHiddenReason
  resumeStage: BroadcastDirectorVisibleStage | null
  consumedProgramId: string | null
  stageStartedAtMs: number
  revision: number
}

export interface BroadcastDirectorDecisionContext {
  bpReady: boolean
  preparedProgramId: string | null
  preparedProgramType: BroadcastProgramType | null
}

export interface BroadcastDirectorAdvanceDecision {
  allowed: boolean
  targetStage: BroadcastDirectorStage | null
  actionLabel: string
  reason: string
}

export interface BroadcastDirectorJumpTarget {
  id: string
  stage: BroadcastDirectorStage
  sourceMapId: BPMapId | ''
  label: string
  available: boolean
  reason: string
}

export interface BroadcastDirectorJumpRequest {
  targetId: string
}

export interface BroadcastDirectorSnapshot {
  runtime: BroadcastDirectorRuntimeV1
  next: BroadcastDirectorAdvanceDecision
  bpReady: boolean
  bpPlaybackStarted: boolean
  preparedProgramId: string | null
  preparedProgramType: BroadcastProgramType | null
  jumpTargets: BroadcastDirectorJumpTarget[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : 0
}

export function isBroadcastDirectorStage(value: unknown): value is BroadcastDirectorStage {
  return (
    typeof value === 'string' && BROADCAST_DIRECTOR_STAGES.includes(value as BroadcastDirectorStage)
  )
}

export function isBroadcastDirectorVisibleStage(
  value: unknown
): value is BroadcastDirectorVisibleStage {
  return (
    typeof value === 'string' &&
    BROADCAST_DIRECTOR_VISIBLE_STAGES.includes(value as BroadcastDirectorVisibleStage)
  )
}

export function createDefaultBroadcastDirectorRuntime(
  nowMs = Date.now()
): BroadcastDirectorRuntimeV1 {
  return {
    version: 1,
    stage: 'hidden',
    hiddenReason: 'idle',
    resumeStage: null,
    consumedProgramId: null,
    stageStartedAtMs: nonNegativeInteger(nowMs),
    revision: 0
  }
}

export function normalizeBroadcastDirectorRuntime(
  value: unknown,
  nowMs = Date.now()
): BroadcastDirectorRuntimeV1 {
  const fallback = createDefaultBroadcastDirectorRuntime(nowMs)
  if (!isRecord(value) || value.version !== 1 || !isBroadcastDirectorStage(value.stage)) {
    return fallback
  }
  const hiddenReason = BROADCAST_DIRECTOR_HIDDEN_REASONS.includes(
    value.hiddenReason as BroadcastDirectorHiddenReason
  )
    ? (value.hiddenReason as BroadcastDirectorHiddenReason)
    : value.stage === 'hidden'
      ? 'idle'
      : fallback.hiddenReason
  return {
    version: 1,
    stage: value.stage,
    hiddenReason,
    resumeStage: isBroadcastDirectorVisibleStage(value.resumeStage) ? value.resumeStage : null,
    consumedProgramId:
      typeof value.consumedProgramId === 'string' && value.consumedProgramId
        ? value.consumedProgramId
        : null,
    stageStartedAtMs: nonNegativeInteger(value.stageStartedAtMs),
    revision: nonNegativeInteger(value.revision)
  }
}

function allowed(
  targetStage: BroadcastDirectorStage,
  actionLabel: string
): BroadcastDirectorAdvanceDecision {
  return { allowed: true, targetStage, actionLabel, reason: '' }
}

function blocked(actionLabel: string, reason: string): BroadcastDirectorAdvanceDecision {
  return { allowed: false, targetStage: null, actionLabel, reason }
}

export function resolveBroadcastDirectorAdvance(
  runtimeValue: unknown,
  context: BroadcastDirectorDecisionContext
): BroadcastDirectorAdvanceDecision {
  const runtime = normalizeBroadcastDirectorRuntime(runtimeValue)
  if (runtime.stage === 'warmup') {
    return context.bpReady
      ? allowed('bp', '转场至 BP')
      : blocked('转场至 BP', '当前比赛尚未保存完整 BP')
  }
  if (runtime.stage === 'bp') return allowed('hidden', '进入比赛阶段')
  if (runtime.stage === 'map_break') return allowed('hidden', '返回比赛阶段')
  if (runtime.stage === 'series_end') {
    return blocked('等待赛事待机', '系列赛结束页面将在配置时间结束后自动进入赛事待机')
  }
  if (runtime.stage === 'standby') return allowed('warmup', '进入下一场暖场')

  if (runtime.hiddenReason === 'manual' && runtime.resumeStage !== null) {
    return allowed(runtime.resumeStage, `恢复${broadcastDirectorStageLabel(runtime.resumeStage)}`)
  }
  if (runtime.hiddenReason === 'idle') return allowed('warmup', '开始暖场')
  if (!context.preparedProgramId || !context.preparedProgramType) {
    return blocked('转场至下一段', '当前地图结果尚未冻结，系统还没有准备可播出的下一页面')
  }
  if (context.preparedProgramId === runtime.consumedProgramId) {
    return blocked('转场至下一段', '当前地图的播出页面已经使用，正在等待下一张地图结束')
  }
  if (context.preparedProgramType === 'standby') {
    return blocked('转场至下一段', '赛事待机只能在系列赛结束页面完成后进入')
  }
  return allowed(context.preparedProgramType, '转场至下一段')
}

export function broadcastDirectorStageLabel(stage: BroadcastDirectorStage): string {
  if (stage === 'hidden') return '比赛画面'
  if (stage === 'warmup') return '暖场'
  if (stage === 'bp') return 'BP 展示'
  if (stage === 'map_break') return '地图间播出'
  if (stage === 'series_end') return '系列赛结束'
  return '赛事待机'
}
