import type { BroadcastDirectorStage } from './broadcast-director'

export const INTERMISSION_TEST_STAGES = [
  'hidden',
  'warmup',
  'bp',
  'map_break',
  'series_end',
  'standby'
] as const satisfies readonly BroadcastDirectorStage[]

export interface IntermissionTestModeStateV1 {
  version: 1
  enabled: boolean
  stage: BroadcastDirectorStage
  stageStartedAtMs: number
  revision: number
  visibleStageCount: number
}

export function createDefaultIntermissionTestModeState(
  nowMs = Date.now()
): IntermissionTestModeStateV1 {
  return {
    version: 1,
    enabled: false,
    stage: 'hidden',
    stageStartedAtMs: nowMs,
    revision: 0,
    visibleStageCount: 0
  }
}

export function nextIntermissionTestStage(
  stage: BroadcastDirectorStage
): BroadcastDirectorStage {
  if (stage === 'hidden') return 'warmup'
  if (stage === 'warmup') return 'bp'
  if (stage === 'bp') return 'map_break'
  if (stage === 'map_break') return 'series_end'
  if (stage === 'series_end') return 'standby'
  return 'warmup'
}
