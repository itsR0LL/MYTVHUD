import {
  BROADCAST_MAX_TOTAL_DURATION_MS,
  BROADCAST_MIN_TOTAL_DURATION_MS,
  BROADCAST_PROGRAM_TYPES,
  createDefaultBroadcastComponentVisibility,
  normalizeBroadcastFlowTemplates,
  type BroadcastContentType,
  type BroadcastExecutionSegment,
  type BroadcastFlowTemplatesV1,
  type BroadcastProgramType
} from '../broadcast-flow'
import type { IntermissionNextPageId, IntermissionNextPageLayout } from '../intermission-next'

export const BROADCAST_PAGE_FLOW_TEMPLATES_KEY = 'broadcastPageFlowTemplatesV3'

export interface BroadcastPageFlowTemplateV3 {
  type: BroadcastProgramType
  pageId: IntermissionNextPageId
  enabled: boolean
  defaultTotalDurationMs: number
}

export interface BroadcastPageFlowTemplatesV3 {
  version: 3
  order: BroadcastProgramType[]
  templates: Record<BroadcastProgramType, BroadcastPageFlowTemplateV3>
}

export interface BroadcastPageLifecycleDuration {
  enterDurationMs: number
  exitDurationMs: number
}

export interface BroadcastPageExecutionWindow {
  pageId: IntermissionNextPageId
  totalDurationMs: number
  enterStartOffsetMs: 0
  enterEndOffsetMs: number
  holdStartOffsetMs: number
  holdEndOffsetMs: number
  exitStartOffsetMs: number
  exitEndOffsetMs: number
}

export type BroadcastPageAllocationResult =
  | { status: 'disabled' }
  | { status: 'invalid' }
  | { status: 'insufficient'; minimumDurationMs: number }
  | { status: 'ready'; window: BroadcastPageExecutionWindow }

export interface BroadcastPageSegmentAllocationOptions {
  availableContentTypes: readonly BroadcastContentType[]
  pageLayout: IntermissionNextPageLayout<IntermissionNextPageId>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProgramType(value: unknown): value is BroadcastProgramType {
  return (
    typeof value === 'string' && BROADCAST_PROGRAM_TYPES.includes(value as BroadcastProgramType)
  )
}

function normalizedTotalDuration(value: unknown): number {
  const number = Number(value)
  return Number.isInteger(number) &&
    number >= BROADCAST_MIN_TOTAL_DURATION_MS &&
    number <= BROADCAST_MAX_TOTAL_DURATION_MS
    ? number
    : 0
}

function nonNegativeDuration(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : null
}

function createUnconfiguredTemplate(type: BroadcastProgramType): BroadcastPageFlowTemplateV3 {
  return {
    type,
    pageId: type,
    enabled: false,
    defaultTotalDurationMs: 0
  }
}

export function createUnconfiguredBroadcastPageFlowTemplates(): BroadcastPageFlowTemplatesV3 {
  return {
    version: 3,
    order: [...BROADCAST_PROGRAM_TYPES],
    templates: {
      map_break: createUnconfiguredTemplate('map_break'),
      series_end: createUnconfiguredTemplate('series_end'),
      standby: createUnconfiguredTemplate('standby')
    }
  }
}

export function migrateBroadcastFlowTemplatesV1ToPageFlowV3(
  value: BroadcastFlowTemplatesV1
): BroadcastPageFlowTemplatesV3 {
  const legacy = normalizeBroadcastFlowTemplates(value)
  const templates = Object.fromEntries(
    BROADCAST_PROGRAM_TYPES.map((type) => {
      const source = legacy[type]
      const defaultTotalDurationMs = normalizedTotalDuration(source.defaultTotalDurationMs)
      return [
        type,
        {
          type,
          pageId: type,
          enabled: defaultTotalDurationMs > 0 && source.segments.some((segment) => segment.enabled),
          defaultTotalDurationMs
        }
      ]
    })
  ) as Record<BroadcastProgramType, BroadcastPageFlowTemplateV3>
  return {
    version: 3,
    order: [...BROADCAST_PROGRAM_TYPES],
    templates
  }
}

function normalizeOrder(value: unknown): BroadcastProgramType[] {
  if (!Array.isArray(value)) return [...BROADCAST_PROGRAM_TYPES]
  const order = value.filter(isProgramType)
  if (
    order.length !== BROADCAST_PROGRAM_TYPES.length ||
    new Set(order).size !== BROADCAST_PROGRAM_TYPES.length
  ) {
    return [...BROADCAST_PROGRAM_TYPES]
  }
  return order
}

export function normalizeBroadcastPageFlowTemplates(value: unknown): BroadcastPageFlowTemplatesV3 {
  const fallback = createUnconfiguredBroadcastPageFlowTemplates()
  if (!isRecord(value) || !isRecord(value.templates)) return fallback
  if (value.version !== 2 && value.version !== 3) return fallback
  const templates = { ...fallback.templates }
  for (const type of BROADCAST_PROGRAM_TYPES) {
    const source = value.templates[type]
    if (!isRecord(source) || source.type !== type || source.pageId !== type) continue
    templates[type] = {
      type,
      pageId: type,
      enabled: source.enabled === true,
      defaultTotalDurationMs: normalizedTotalDuration(source.defaultTotalDurationMs)
    }
  }
  return {
    version: 3,
    order: normalizeOrder(value.order),
    templates
  }
}

export function allocateBroadcastPageWindow(
  template: BroadcastPageFlowTemplateV3,
  totalDurationMsValue: unknown,
  lifecycleValue: unknown
): BroadcastPageAllocationResult {
  if (!template.enabled) return { status: 'disabled' }
  const totalDurationMs = normalizedTotalDuration(totalDurationMsValue)
  if (totalDurationMs === 0 || !isRecord(lifecycleValue)) return { status: 'invalid' }
  const enterDurationMs = nonNegativeDuration(lifecycleValue.enterDurationMs)
  const exitDurationMs = nonNegativeDuration(lifecycleValue.exitDurationMs)
  if (enterDurationMs === null || exitDurationMs === null) return { status: 'invalid' }
  const minimumDurationMs = enterDurationMs + exitDurationMs
  if (totalDurationMs < minimumDurationMs) {
    return { status: 'insufficient', minimumDurationMs }
  }
  return {
    status: 'ready',
    window: {
      pageId: template.pageId,
      totalDurationMs,
      enterStartOffsetMs: 0,
      enterEndOffsetMs: enterDurationMs,
      holdStartOffsetMs: enterDurationMs,
      holdEndOffsetMs: totalDurationMs - exitDurationMs,
      exitStartOffsetMs: totalDurationMs - exitDurationMs,
      exitEndOffsetMs: totalDurationMs
    }
  }
}

function hiddenBroadcastComponents() {
  return {
    teamScore: false,
    mapSeries: false,
    timerNotice: false,
    eventLogo: false
  }
}

function executionSegment(
  programType: BroadcastProgramType,
  contentType: BroadcastContentType,
  index: number,
  startOffsetMs: number,
  durationMs: number
): BroadcastExecutionSegment {
  return {
    id: `${programType}-${index + 1}-${contentType}`,
    contentType,
    startOffsetMs,
    endOffsetMs: startOffsetMs + durationMs,
    durationMs,
    components:
      contentType === 'map_utility_replay'
        ? hiddenBroadcastComponents()
        : createDefaultBroadcastComponentVisibility()
  }
}

function primaryContentType(
  programType: BroadcastProgramType,
  available: ReadonlySet<BroadcastContentType>
): BroadcastContentType | null {
  if (available.has('next_match')) return 'next_match'
  if (programType === 'map_break') return available.has('map_report') ? 'map_report' : null
  if (programType === 'series_end') return available.has('series_result') ? 'series_result' : null
  return available.has('standby') ? 'standby' : null
}

export function allocateBroadcastPageSegments(
  template: BroadcastPageFlowTemplateV3,
  totalDurationMsValue: unknown,
  options: BroadcastPageSegmentAllocationOptions
): BroadcastExecutionSegment[] {
  if (!template.enabled) throw new Error('当前完整页面未启用')
  const totalDurationMs = normalizedTotalDuration(totalDurationMsValue)
  if (totalDurationMs === 0) throw new Error('完整页面播出时长无效')

  const available = new Set(options.availableContentTypes)
  const primary = primaryContentType(template.type, available)
  if (primary === null) {
    throw new Error('当前完整页面没有可播出的内容')
  }

  const pageLayout = options.pageLayout
  if (pageLayout.pageId !== template.pageId) throw new Error('页面设置与播出页面不一致')
  const transitions = pageLayout.transitions
  const utilityWindows = pageLayout.components.utilityReplay
    ? (pageLayout.componentWindows.utilityReplay ?? [])
    : []
  const boundaries = new Set<number>([0, totalDurationMs])
  const occupiedTransitionEnds: number[] = []
  for (const transition of transitions) {
    const endOffsetMs = transition.startOffsetMs + transition.durationMs
    if (endOffsetMs > totalDurationMs) throw new Error('转场组件超出页面总时长')
    if (occupiedTransitionEnds.some((end) => transition.startOffsetMs < end)) {
      throw new Error('转场组件时间片段不能互相重叠')
    }
    occupiedTransitionEnds.push(endOffsetMs)
    boundaries.add(transition.startOffsetMs)
    boundaries.add(endOffsetMs)
  }
  for (const window of utilityWindows) {
    const endOffsetMs = window.endOffsetMs ?? totalDurationMs
    if (endOffsetMs > totalDurationMs) throw new Error('道具回放组件超出页面总时长')
    boundaries.add(window.startOffsetMs)
    boundaries.add(endOffsetMs)
  }

  const orderedBoundaries = [...boundaries].sort((left, right) => left - right)
  const segments: BroadcastExecutionSegment[] = []
  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const startOffsetMs = orderedBoundaries[index]
    const endOffsetMs = orderedBoundaries[index + 1]
    if (endOffsetMs <= startOffsetMs) continue
    const transitionActive = transitions.some(
      (transition) =>
        startOffsetMs >= transition.startOffsetMs &&
        startOffsetMs < transition.startOffsetMs + transition.durationMs
    )
    const utilityReplayActive =
      !transitionActive &&
      available.has('map_utility_replay') &&
      utilityWindows.some(
        (window) =>
          startOffsetMs >= window.startOffsetMs &&
          startOffsetMs < (window.endOffsetMs ?? totalDurationMs)
      )
    const contentType: BroadcastContentType = transitionActive
      ? 'page_transition'
      : utilityReplayActive
        ? 'map_utility_replay'
        : primary
    const previous = segments.at(-1)
    if (previous && previous.contentType === contentType) {
      previous.endOffsetMs = endOffsetMs
      previous.durationMs = previous.endOffsetMs - previous.startOffsetMs
      continue
    }
    segments.push(
      executionSegment(
        template.type,
        contentType,
        segments.length,
        startOffsetMs,
        endOffsetMs - startOffsetMs
      )
    )
  }
  return segments
}
