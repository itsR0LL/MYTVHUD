import {
  BROADCAST_MAX_TOTAL_DURATION_MS,
  BROADCAST_MIN_TOTAL_DURATION_MS,
  BROADCAST_PROGRAM_TYPES,
  type BroadcastProgramType
} from '../../../../shared/broadcast-flow'
import {
  allocateBroadcastPageWindow,
  normalizeBroadcastPageFlowTemplates,
  type BroadcastPageFlowTemplateV3,
  type BroadcastPageFlowTemplatesV3,
  type BroadcastPageLifecycleDuration
} from '../../../../shared/broadcast-page-flow-next/page-flow'

export type BroadcastPageDurationPart = 'minutes' | 'seconds'

export type BroadcastPageTiming =
  | { status: 'disabled' }
  | {
      status: 'invalid'
      totalDurationMs: number
      minimumAllowedDurationMs: number
      maximumAllowedDurationMs: number
    }
  | {
      status: 'insufficient'
      totalDurationMs: number
      enterDurationMs: number
      exitDurationMs: number
      minimumDurationMs: number
      deficitDurationMs: number
    }
  | {
      status: 'ready'
      totalDurationMs: number
      enterDurationMs: number
      holdDurationMs: number
      exitDurationMs: number
    }

export function cloneBroadcastPageFlowTemplates(value: unknown): BroadcastPageFlowTemplatesV3 {
  return normalizeBroadcastPageFlowTemplates(value)
}

export function broadcastPageFlowTemplatesAreEqual(first: unknown, second: unknown): boolean {
  const firstTemplates = normalizeBroadcastPageFlowTemplates(first)
  const secondTemplates = normalizeBroadcastPageFlowTemplates(second)
  return (
    firstTemplates.order.every((type, index) => type === secondTemplates.order[index]) &&
    BROADCAST_PROGRAM_TYPES.every((type) => {
      const firstTemplate = firstTemplates.templates[type]
      const secondTemplate = secondTemplates.templates[type]
      return (
        firstTemplate.type === secondTemplate.type &&
        firstTemplate.pageId === secondTemplate.pageId &&
        firstTemplate.enabled === secondTemplate.enabled &&
        firstTemplate.defaultTotalDurationMs === secondTemplate.defaultTotalDurationMs
      )
    })
  )
}

export function broadcastPageLabel(type: BroadcastProgramType): string {
  if (type === 'map_break') return '地图间播出'
  if (type === 'series_end') return '系列赛结束'
  return '赛事待机'
}

export function broadcastPageDescription(type: BroadcastProgramType): string {
  if (type === 'map_break') return '地图结束且系列赛继续时，播放完整地图间页面。'
  if (type === 'series_end') return '系列赛结束后，播放完整系列赛结果页面。'
  return '下一场比赛尚未就绪时，播放完整赛事待机页面。'
}

export function broadcastDurationParts(durationMs: number): {
  minutes: number
  seconds: number
} {
  const wholeSeconds = Math.max(0, Math.floor(Number(durationMs) / 1000) || 0)
  return {
    minutes: Math.min(99, Math.floor(wholeSeconds / 60)),
    seconds: Math.min(59, wholeSeconds % 60)
  }
}

function normalizedDurationPart(part: BroadcastPageDurationPart, value: string | number): number {
  const maximum = part === 'minutes' ? 99 : 59
  return Math.min(maximum, Math.max(0, Math.floor(Number(value) || 0)))
}

export function setBroadcastPageDurationPart(
  value: unknown,
  type: BroadcastProgramType,
  part: BroadcastPageDurationPart,
  input: string | number
): BroadcastPageFlowTemplatesV3 {
  const next = normalizeBroadcastPageFlowTemplates(value)
  const current = broadcastDurationParts(next.templates[type].defaultTotalDurationMs)
  current[part] = normalizedDurationPart(part, input)
  next.templates[type].defaultTotalDurationMs = (current.minutes * 60 + current.seconds) * 1000
  return next
}

export function setBroadcastPageDuration(
  value: unknown,
  type: BroadcastProgramType,
  durationMs: number
): BroadcastPageFlowTemplatesV3 {
  const next = normalizeBroadcastPageFlowTemplates(value)
  const normalizedDurationMs = Math.min(
    BROADCAST_MAX_TOTAL_DURATION_MS,
    Math.max(0, Math.floor(Number(durationMs) || 0))
  )
  next.templates[type].defaultTotalDurationMs = normalizedDurationMs
  return next
}

export function setBroadcastPageEnabled(
  value: unknown,
  type: BroadcastProgramType,
  enabled: boolean
): BroadcastPageFlowTemplatesV3 {
  const next = normalizeBroadcastPageFlowTemplates(value)
  next.templates[type].enabled = enabled
  return next
}

export function evaluateBroadcastPageTiming(
  template: BroadcastPageFlowTemplateV3,
  lifecycle: BroadcastPageLifecycleDuration
): BroadcastPageTiming {
  const result = allocateBroadcastPageWindow(template, template.defaultTotalDurationMs, lifecycle)
  if (result.status === 'disabled') return { status: 'disabled' }
  if (result.status === 'invalid') {
    return {
      status: 'invalid',
      totalDurationMs: template.defaultTotalDurationMs,
      minimumAllowedDurationMs: BROADCAST_MIN_TOTAL_DURATION_MS,
      maximumAllowedDurationMs: BROADCAST_MAX_TOTAL_DURATION_MS
    }
  }
  if (result.status === 'insufficient') {
    return {
      status: 'insufficient',
      totalDurationMs: template.defaultTotalDurationMs,
      enterDurationMs: lifecycle.enterDurationMs,
      exitDurationMs: lifecycle.exitDurationMs,
      minimumDurationMs: result.minimumDurationMs,
      deficitDurationMs: result.minimumDurationMs - template.defaultTotalDurationMs
    }
  }
  return {
    status: 'ready',
    totalDurationMs: result.window.totalDurationMs,
    enterDurationMs: result.window.enterEndOffsetMs,
    holdDurationMs: result.window.holdEndOffsetMs - result.window.holdStartOffsetMs,
    exitDurationMs: result.window.exitEndOffsetMs - result.window.exitStartOffsetMs
  }
}

export function formatBroadcastPageDuration(durationMs: number, precise = false): string {
  const safeDurationMs = Math.max(0, Math.floor(Number(durationMs) || 0))
  const wholeSeconds = Math.floor(safeDurationMs / 1000)
  const minutes = Math.floor(wholeSeconds / 60)
  const seconds = wholeSeconds % 60
  const milliseconds = safeDurationMs % 1000
  const base = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return precise && milliseconds > 0 ? `${base}.${String(milliseconds).padStart(3, '0')}` : base
}
