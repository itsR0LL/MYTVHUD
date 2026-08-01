import {
  INTERMISSION_NEXT_CANVAS_HEIGHT,
  INTERMISSION_NEXT_CANVAS_WIDTH,
  INTERMISSION_NEXT_LAYOUT_VERSION,
  INTERMISSION_NEXT_PAGE_IDS,
  INTERMISSION_NEXT_SAFE_AREA,
  INTERMISSION_NEXT_SNAP_THRESHOLD,
  INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS,
  getIntermissionNextComponentDefinition,
  getIntermissionNextComponentDefinitions,
  isIntermissionNextResizeHandle,
  type IntermissionNextBounds,
  type IntermissionNextComponentDefinition,
  type IntermissionNextComponentLayout,
  type IntermissionNextComponentWindow,
  type IntermissionNextTransitionComponent,
  type IntermissionNextLayoutState,
  type IntermissionNextPageComponentId,
  type IntermissionNextPageComponentLayouts,
  type IntermissionNextPageId,
  type IntermissionNextPageLayout,
  type IntermissionNextResizeHandle
} from './contracts'
import { UTILITY_REPLAY_TOTAL_DURATION_MS } from '../utility-replay'

type NumericFramePatch = Partial<IntermissionNextBounds>

interface ResizeDirection {
  horizontal: -1 | 0 | 1
  vertical: -1 | 0 | 1
}

const RESIZE_DIRECTIONS: Record<IntermissionNextResizeHandle, ResizeDirection> = {
  north: { horizontal: 0, vertical: -1 },
  north_east: { horizontal: 1, vertical: -1 },
  east: { horizontal: 1, vertical: 0 },
  south_east: { horizontal: 1, vertical: 1 },
  south: { horizontal: 0, vertical: 1 },
  south_west: { horizontal: -1, vertical: 1 },
  west: { horizontal: -1, vertical: 0 },
  north_west: { horizontal: -1, vertical: -1 }
}

const LEGACY_MAP_SEQUENCE_DEFAULT_LAYOUT: IntermissionNextComponentLayout = {
  x: 180,
  y: 80,
  width: 1180,
  height: 110,
  aspectRatioLocked: false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function roundGeometry(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function finiteDelta(value: unknown): number {
  return isFiniteNumber(value) ? value : 0
}

function copyComponentLayout(
  layout: IntermissionNextComponentLayout
): IntermissionNextComponentLayout {
  return { ...layout }
}

function createDefaultComponentLayout(
  definition: IntermissionNextComponentDefinition
): IntermissionNextComponentLayout {
  return copyComponentLayout(definition.defaultLayout)
}

function migrateLegacyComponentLayout(
  pageId: IntermissionNextPageId,
  definition: IntermissionNextComponentDefinition,
  value: unknown
): unknown {
  if (!isRecord(value)) return value
  if (pageId === 'map_break' && definition.id === 'mapSequence') {
    const legacy = LEGACY_MAP_SEQUENCE_DEFAULT_LAYOUT
    const matchesLegacyDefault =
      value.x === legacy.x &&
      value.y === legacy.y &&
      value.width === legacy.width &&
      value.height === legacy.height &&
      value.aspectRatioLocked === legacy.aspectRatioLocked
    if (matchesLegacyDefault) return definition.defaultLayout
  }
  const wasLegacyLockedByDefault =
    definition.id === 'eventMark' || (pageId === 'series_end' && definition.id === 'finalScore')
  const matchesCurrentDefaultGeometry =
    value.x === definition.defaultLayout.x &&
    value.y === definition.defaultLayout.y &&
    value.width === definition.defaultLayout.width &&
    value.height === definition.defaultLayout.height
  if (
    wasLegacyLockedByDefault &&
    matchesCurrentDefaultGeometry &&
    value.aspectRatioLocked === true
  ) {
    return { ...value, aspectRatioLocked: false }
  }
  return value
}

function lockedSize(
  definition: IntermissionNextComponentDefinition,
  widthInput: number,
  heightInput: number,
  widthIsExplicit: boolean
): Pick<IntermissionNextBounds, 'width' | 'height'> {
  const defaultWidth = definition.defaultLayout.width
  const defaultHeight = definition.defaultLayout.height
  const constraints = definition.sizeConstraints
  const requestedScale = widthIsExplicit ? widthInput / defaultWidth : heightInput / defaultHeight
  const minimumScale = Math.max(
    constraints.minimumWidth / defaultWidth,
    constraints.minimumHeight / defaultHeight
  )
  const maximumScale = Math.min(
    constraints.maximumWidth / defaultWidth,
    constraints.maximumHeight / defaultHeight,
    INTERMISSION_NEXT_CANVAS_WIDTH / defaultWidth,
    INTERMISSION_NEXT_CANVAS_HEIGHT / defaultHeight
  )
  const scale = clamp(requestedScale, minimumScale, maximumScale)
  return {
    width: roundGeometry(defaultWidth * scale),
    height: roundGeometry(defaultHeight * scale)
  }
}

export function normalizeIntermissionNextComponentLayout(
  definition: IntermissionNextComponentDefinition,
  value: unknown
): IntermissionNextComponentLayout {
  const fallback = definition.defaultLayout
  const source = isRecord(value) ? value : {}
  const aspectRatioLocked =
    typeof source.aspectRatioLocked === 'boolean'
      ? source.aspectRatioLocked
      : fallback.aspectRatioLocked
  const sourceWidth = isFiniteNumber(source.width) && source.width > 0 ? source.width : null
  const sourceHeight = isFiniteNumber(source.height) && source.height > 0 ? source.height : null
  const widthIsExplicit = sourceWidth !== null
  const heightIsExplicit = sourceHeight !== null
  let width: number = sourceWidth ?? fallback.width
  let height: number = sourceHeight ?? fallback.height

  if (aspectRatioLocked) {
    const normalizedSize = lockedSize(
      definition,
      width,
      height,
      widthIsExplicit || !heightIsExplicit
    )
    width = normalizedSize.width
    height = normalizedSize.height
  } else {
    width = roundGeometry(
      clamp(
        width,
        definition.sizeConstraints.minimumWidth,
        Math.min(definition.sizeConstraints.maximumWidth, INTERMISSION_NEXT_CANVAS_WIDTH)
      )
    )
    height = roundGeometry(
      clamp(
        height,
        definition.sizeConstraints.minimumHeight,
        Math.min(definition.sizeConstraints.maximumHeight, INTERMISSION_NEXT_CANVAS_HEIGHT)
      )
    )
  }

  const maximumX = Math.max(0, INTERMISSION_NEXT_CANVAS_WIDTH - width)
  const maximumY = Math.max(0, INTERMISSION_NEXT_CANVAS_HEIGHT - height)
  const x = isFiniteNumber(source.x) ? source.x : fallback.x
  const y = isFiniteNumber(source.y) ? source.y : fallback.y

  return {
    x: roundGeometry(clamp(x, 0, maximumX)),
    y: roundGeometry(clamp(y, 0, maximumY)),
    width,
    height,
    aspectRatioLocked
  }
}

function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

function normalizeComponentWindows(value: unknown): IntermissionNextComponentWindow[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const windows: IntermissionNextComponentWindow[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '' || ids.has(entry.id)) {
      continue
    }
    const startOffsetMs = nonNegativeInteger(entry.startOffsetMs)
    const endOffsetMs = entry.endOffsetMs === null ? null : nonNegativeInteger(entry.endOffsetMs)
    if (startOffsetMs === null || (endOffsetMs !== null && endOffsetMs <= startOffsetMs)) {
      continue
    }
    ids.add(entry.id)
    windows.push({ id: entry.id, startOffsetMs, endOffsetMs })
  }
  return windows.sort((left, right) => left.startOffsetMs - right.startOffsetMs)
}

function normalizeTransitionComponents(value: unknown): IntermissionNextTransitionComponent[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const transitions: IntermissionNextTransitionComponent[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '' || ids.has(entry.id)) {
      continue
    }
    const startOffsetMs = nonNegativeInteger(entry.startOffsetMs)
    if (
      startOffsetMs === null ||
      entry.durationMs !== INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
    ) {
      continue
    }
    ids.add(entry.id)
    transitions.push({
      id: entry.id,
      startOffsetMs,
      durationMs: INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
    })
  }
  return transitions.sort((left, right) => left.startOffsetMs - right.startOffsetMs)
}

export function createDefaultIntermissionNextPageLayout<PageId extends IntermissionNextPageId>(
  pageId: PageId
): IntermissionNextPageLayout<PageId> {
  const components: Record<string, IntermissionNextComponentLayout> = {}
  const componentWindows: Record<string, IntermissionNextComponentWindow[]> = {}
  for (const definition of getIntermissionNextComponentDefinitions(pageId)) {
    if (!definition.required) continue
    components[definition.id] = createDefaultComponentLayout(definition)
    componentWindows[definition.id] = [
      { id: `${definition.id}-window-1`, startOffsetMs: 0, endOffsetMs: null }
    ]
  }
  return {
    pageId,
    components: components as IntermissionNextPageComponentLayouts<PageId>,
    componentWindows: componentWindows as IntermissionNextPageLayout<PageId>['componentWindows'],
    transitions: []
  }
}

export function createDefaultIntermissionNextLayoutState(): IntermissionNextLayoutState {
  return {
    version: INTERMISSION_NEXT_LAYOUT_VERSION,
    pages: {
      warmup: createDefaultIntermissionNextPageLayout('warmup'),
      bp: createDefaultIntermissionNextPageLayout('bp'),
      map_break: createDefaultIntermissionNextPageLayout('map_break'),
      series_end: createDefaultIntermissionNextPageLayout('series_end'),
      standby: createDefaultIntermissionNextPageLayout('standby')
    }
  }
}

export function normalizeIntermissionNextPageLayout<PageId extends IntermissionNextPageId>(
  pageId: PageId,
  value: unknown
): IntermissionNextPageLayout<PageId> {
  const fallback = createDefaultIntermissionNextPageLayout(pageId)
  if (
    !isRecord(value) ||
    value.pageId !== pageId ||
    !isRecord(value.components) ||
    !isRecord(value.componentWindows)
  ) {
    return fallback
  }
  const sourceComponents = value.components
  const sourceWindows = value.componentWindows
  const components: Record<string, IntermissionNextComponentLayout> = {
    ...(fallback.components as Record<string, IntermissionNextComponentLayout>)
  }
  const componentWindows: Record<string, IntermissionNextComponentWindow[]> = {
    ...(fallback.componentWindows as Record<string, IntermissionNextComponentWindow[]>)
  }
  for (const definition of getIntermissionNextComponentDefinitions(pageId)) {
    if (definition.required) continue
    if (definition.kind === 'transition' || !isRecord(sourceComponents[definition.id])) continue
    components[definition.id] = normalizeIntermissionNextComponentLayout(
      definition,
      migrateLegacyComponentLayout(pageId, definition, sourceComponents[definition.id])
    )
    componentWindows[definition.id] = normalizeComponentWindows(sourceWindows[definition.id])
  }
  return {
    pageId,
    components: components as IntermissionNextPageComponentLayouts<PageId>,
    componentWindows: componentWindows as IntermissionNextPageLayout<PageId>['componentWindows'],
    transitions: normalizeTransitionComponents(value.transitions)
  }
}

export function normalizeIntermissionNextLayoutState(value: unknown): IntermissionNextLayoutState {
  if (
    !isRecord(value) ||
    (value.version !== 2 &&
      value.version !== 3 &&
      value.version !== INTERMISSION_NEXT_LAYOUT_VERSION) ||
    !isRecord(value.pages)
  ) {
    return createDefaultIntermissionNextLayoutState()
  }
  return {
    version: INTERMISSION_NEXT_LAYOUT_VERSION,
    pages: {
      warmup: normalizeIntermissionNextPageLayout('warmup', value.pages.warmup),
      bp: normalizeIntermissionNextPageLayout('bp', value.pages.bp),
      map_break: normalizeIntermissionNextPageLayout('map_break', value.pages.map_break),
      series_end: normalizeIntermissionNextPageLayout('series_end', value.pages.series_end),
      standby: normalizeIntermissionNextPageLayout('standby', value.pages.standby)
    }
  }
}

function updatePageComponent<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId,
  componentId: string,
  update: (
    layout: IntermissionNextComponentLayout,
    definition: IntermissionNextComponentDefinition<IntermissionNextPageComponentId<PageId>>
  ) => IntermissionNextComponentLayout
): IntermissionNextLayoutState {
  const state = normalizeIntermissionNextLayoutState(value)
  const definition = getIntermissionNextComponentDefinition(pageId, componentId)
  if (!definition || definition.kind === 'transition' || definition.required) return state
  const page = state.pages[pageId] as unknown as IntermissionNextPageLayout<PageId>
  const current = page.components[definition.id]
  if (!current) return state
  const nextPage = {
    ...page,
    components: {
      ...page.components,
      [definition.id]: update(current, definition)
    }
  } as IntermissionNextPageLayout<PageId>
  return {
    ...state,
    pages: {
      ...state.pages,
      [pageId]: nextPage
    }
  }
}

export function addIntermissionNextComponent<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId,
  componentId: string,
  startOffsetMs: number
): IntermissionNextLayoutState {
  const state = normalizeIntermissionNextLayoutState(value)
  const definition = getIntermissionNextComponentDefinition(pageId, componentId)
  if (!definition) return state
  const page = state.pages[pageId] as unknown as IntermissionNextPageLayout<PageId>
  if (definition.kind === 'transition') {
    const normalizedStartOffsetMs = nonNegativeInteger(startOffsetMs)
    if (normalizedStartOffsetMs === null || normalizedStartOffsetMs === 0) return state
    let index = 1
    while (page.transitions.some((entry) => entry.id === `transition-${index}`)) index += 1
    const transition = {
      id: `transition-${index}`,
      startOffsetMs: normalizedStartOffsetMs,
      durationMs: INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
    } as const
    return {
      ...state,
      pages: {
        ...state.pages,
        [pageId]: {
          ...page,
          transitions: [...page.transitions, transition].sort(
            (left, right) => left.startOffsetMs - right.startOffsetMs
          )
        }
      }
    }
  }
  if (definition.required) return state
  if (page.components[definition.id]) return state
  const start = nonNegativeInteger(startOffsetMs) ?? 0
  const endOffsetMs =
    definition.kind === 'utility_replay' ? start + UTILITY_REPLAY_TOTAL_DURATION_MS : null
  return {
    ...state,
    pages: {
      ...state.pages,
      [pageId]: {
        ...page,
        components: {
          ...page.components,
          [definition.id]: createDefaultComponentLayout(definition)
        },
        componentWindows: {
          ...page.componentWindows,
          [definition.id]: [{ id: `${definition.id}-window-1`, startOffsetMs: start, endOffsetMs }]
        }
      }
    }
  }
}

export function removeIntermissionNextComponent<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId,
  componentId: string
): IntermissionNextLayoutState {
  const state = normalizeIntermissionNextLayoutState(value)
  const definition = getIntermissionNextComponentDefinition(pageId, componentId)
  if (!definition || definition.kind === 'transition' || definition.required) return state
  const page = state.pages[pageId] as unknown as IntermissionNextPageLayout<PageId>
  const components = { ...page.components } as Record<string, IntermissionNextComponentLayout>
  const componentWindows = { ...page.componentWindows } as Record<
    string,
    IntermissionNextComponentWindow[]
  >
  delete components[definition.id]
  delete componentWindows[definition.id]
  return {
    ...state,
    pages: {
      ...state.pages,
      [pageId]: { ...page, components, componentWindows }
    }
  }
}

export function removeIntermissionNextTransition(
  value: unknown,
  pageId: IntermissionNextPageId,
  transitionId: string
): IntermissionNextLayoutState {
  const state = normalizeIntermissionNextLayoutState(value)
  const page = state.pages[pageId]
  return {
    ...state,
    pages: {
      ...state.pages,
      [pageId]: {
        ...page,
        transitions: page.transitions.filter((transition) => transition.id !== transitionId)
      }
    }
  }
}

export function setIntermissionNextComponentWindows<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId,
  componentId: string,
  windows: unknown
): IntermissionNextLayoutState {
  const state = normalizeIntermissionNextLayoutState(value)
  const definition = getIntermissionNextComponentDefinition(pageId, componentId)
  if (!definition || definition.kind === 'transition' || definition.required) return state
  const page = state.pages[pageId] as unknown as IntermissionNextPageLayout<PageId>
  if (!page.components[definition.id]) return state
  return {
    ...state,
    pages: {
      ...state.pages,
      [pageId]: {
        ...page,
        componentWindows: {
          ...page.componentWindows,
          [definition.id]: normalizeComponentWindows(windows)
        }
      }
    }
  }
}

export function setIntermissionNextTransitionStart(
  value: unknown,
  pageId: IntermissionNextPageId,
  transitionId: string,
  startOffsetMs: number
): IntermissionNextLayoutState {
  const state = normalizeIntermissionNextLayoutState(value)
  const page = state.pages[pageId]
  const start = nonNegativeInteger(startOffsetMs)
  if (start === null || start === 0) return state
  return {
    ...state,
    pages: {
      ...state.pages,
      [pageId]: {
        ...page,
        transitions: page.transitions
          .map((transition) =>
            transition.id === transitionId ? { ...transition, startOffsetMs: start } : transition
          )
          .sort((left, right) => left.startOffsetMs - right.startOffsetMs)
      }
    }
  }
}

export function setIntermissionNextComponentAspectRatioLocked<
  PageId extends IntermissionNextPageId
>(
  value: unknown,
  pageId: PageId,
  componentId: string,
  aspectRatioLocked: boolean
): IntermissionNextLayoutState {
  return updatePageComponent(value, pageId, componentId, (layout, definition) =>
    normalizeIntermissionNextComponentLayout(definition, {
      ...layout,
      aspectRatioLocked:
        typeof aspectRatioLocked === 'boolean' ? aspectRatioLocked : layout.aspectRatioLocked
    })
  )
}

export function setIntermissionNextComponentPosition<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId,
  componentId: string,
  x: number,
  y: number
): IntermissionNextLayoutState {
  return updatePageComponent(value, pageId, componentId, (layout, definition) =>
    normalizeIntermissionNextComponentLayout(definition, {
      ...layout,
      x: isFiniteNumber(x) ? x : layout.x,
      y: isFiniteNumber(y) ? y : layout.y
    })
  )
}

export function setIntermissionNextComponentFrame<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId,
  componentId: string,
  patch: NumericFramePatch
): IntermissionNextLayoutState {
  return updatePageComponent(value, pageId, componentId, (layout, definition) => {
    const frame = {
      ...layout,
      ...(isFiniteNumber(patch.x) ? { x: patch.x } : {}),
      ...(isFiniteNumber(patch.y) ? { y: patch.y } : {}),
      ...(isFiniteNumber(patch.width) ? { width: patch.width } : {}),
      ...(isFiniteNumber(patch.height) ? { height: patch.height } : {})
    }
    if (layout.aspectRatioLocked) {
      const ratio = definition.defaultLayout.width / definition.defaultLayout.height
      if (isFiniteNumber(patch.width) && !isFiniteNumber(patch.height)) {
        frame.height = patch.width / ratio
      } else if (isFiniteNumber(patch.height) && !isFiniteNumber(patch.width)) {
        frame.width = patch.height * ratio
      }
    }
    return normalizeIntermissionNextComponentLayout(definition, frame)
  })
}

function resizeAxis(
  start: number,
  length: number,
  delta: number,
  direction: -1 | 0 | 1,
  minimumLength: number,
  maximumLength: number,
  canvasLength: number
): { start: number; length: number } {
  if (direction === 0) return { start, length }
  if (direction < 0) {
    const fixedEnd = start + length
    const availableMaximum = Math.min(maximumLength, fixedEnd)
    const availableMinimum = Math.min(minimumLength, availableMaximum)
    const nextLength = clamp(length - delta, availableMinimum, availableMaximum)
    return { start: fixedEnd - nextLength, length: nextLength }
  }
  const availableMaximum = Math.min(maximumLength, canvasLength - start)
  const availableMinimum = Math.min(minimumLength, availableMaximum)
  return {
    start,
    length: clamp(length + delta, availableMinimum, availableMaximum)
  }
}

function resizeUnlocked(
  layout: IntermissionNextComponentLayout,
  definition: IntermissionNextComponentDefinition,
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number
): IntermissionNextComponentLayout {
  const horizontal = resizeAxis(
    layout.x,
    layout.width,
    deltaX,
    direction.horizontal,
    definition.sizeConstraints.minimumWidth,
    definition.sizeConstraints.maximumWidth,
    INTERMISSION_NEXT_CANVAS_WIDTH
  )
  const vertical = resizeAxis(
    layout.y,
    layout.height,
    deltaY,
    direction.vertical,
    definition.sizeConstraints.minimumHeight,
    definition.sizeConstraints.maximumHeight,
    INTERMISSION_NEXT_CANVAS_HEIGHT
  )
  return {
    ...layout,
    x: roundGeometry(horizontal.start),
    y: roundGeometry(vertical.start),
    width: roundGeometry(horizontal.length),
    height: roundGeometry(vertical.length)
  }
}

function maximumLockedCanvasScale(
  layout: IntermissionNextComponentLayout,
  direction: ResizeDirection
): number {
  const centerX = layout.x + layout.width / 2
  const centerY = layout.y + layout.height / 2
  const maximumWidth =
    direction.horizontal < 0
      ? layout.x + layout.width
      : direction.horizontal > 0
        ? INTERMISSION_NEXT_CANVAS_WIDTH - layout.x
        : 2 * Math.min(centerX, INTERMISSION_NEXT_CANVAS_WIDTH - centerX)
  const maximumHeight =
    direction.vertical < 0
      ? layout.y + layout.height
      : direction.vertical > 0
        ? INTERMISSION_NEXT_CANVAS_HEIGHT - layout.y
        : 2 * Math.min(centerY, INTERMISSION_NEXT_CANVAS_HEIGHT - centerY)
  return Math.min(maximumWidth / layout.width, maximumHeight / layout.height)
}

function resizeLocked(
  layout: IntermissionNextComponentLayout,
  definition: IntermissionNextComponentDefinition,
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number
): IntermissionNextComponentLayout {
  const desiredWidth = layout.width + direction.horizontal * deltaX
  const desiredHeight = layout.height + direction.vertical * deltaY
  let requestedScale = 1
  if (direction.horizontal !== 0 && direction.vertical !== 0) {
    requestedScale =
      (layout.width * desiredWidth + layout.height * desiredHeight) /
      (layout.width * layout.width + layout.height * layout.height)
  } else if (direction.horizontal !== 0) {
    requestedScale = desiredWidth / layout.width
  } else if (direction.vertical !== 0) {
    requestedScale = desiredHeight / layout.height
  }

  const constraints = definition.sizeConstraints
  const minimumScale = Math.max(
    constraints.minimumWidth / layout.width,
    constraints.minimumHeight / layout.height
  )
  const maximumScale = Math.min(
    constraints.maximumWidth / layout.width,
    constraints.maximumHeight / layout.height,
    maximumLockedCanvasScale(layout, direction)
  )
  const scale = clamp(requestedScale, Math.min(minimumScale, maximumScale), maximumScale)
  const width = layout.width * scale
  const height = layout.height * scale
  const centerX = layout.x + layout.width / 2
  const centerY = layout.y + layout.height / 2
  const x =
    direction.horizontal < 0
      ? layout.x + layout.width - width
      : direction.horizontal > 0
        ? layout.x
        : centerX - width / 2
  const y =
    direction.vertical < 0
      ? layout.y + layout.height - height
      : direction.vertical > 0
        ? layout.y
        : centerY - height / 2

  return {
    ...layout,
    x: roundGeometry(x),
    y: roundGeometry(y),
    width: roundGeometry(width),
    height: roundGeometry(height)
  }
}

export function resizeIntermissionNextComponent<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId,
  componentId: string,
  handle: IntermissionNextResizeHandle,
  deltaX: number,
  deltaY: number
): IntermissionNextLayoutState {
  if (!isIntermissionNextResizeHandle(handle)) return normalizeIntermissionNextLayoutState(value)
  return updatePageComponent(value, pageId, componentId, (layout, definition) => {
    const direction = RESIZE_DIRECTIONS[handle]
    return layout.aspectRatioLocked
      ? resizeLocked(layout, definition, direction, finiteDelta(deltaX), finiteDelta(deltaY))
      : resizeUnlocked(layout, definition, direction, finiteDelta(deltaX), finiteDelta(deltaY))
  })
}

function snapOrigins(origin: number, length: number): number[] {
  return [origin, origin + length / 2, origin + length]
}

function nearestSnappedOrigin(
  origin: number,
  length: number,
  targets: readonly number[],
  threshold: number
): number {
  let bestOrigin = origin
  let bestDistance = threshold + 1
  for (const movingPoint of snapOrigins(origin, length)) {
    for (const target of targets) {
      const distance = Math.abs(target - movingPoint)
      if (distance > threshold || distance >= bestDistance) continue
      bestDistance = distance
      bestOrigin = origin + target - movingPoint
    }
  }
  return bestOrigin
}

export function snapIntermissionNextComponentPosition<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId,
  componentId: string,
  x: number,
  y: number,
  threshold = INTERMISSION_NEXT_SNAP_THRESHOLD
): IntermissionNextLayoutState {
  const state = normalizeIntermissionNextLayoutState(value)
  const definition = getIntermissionNextComponentDefinition(pageId, componentId)
  if (!definition) return state
  const page = state.pages[pageId] as unknown as IntermissionNextPageLayout<PageId>
  const layout = page.components[definition.id]
  if (!layout) return state
  const xTargets = [
    0,
    INTERMISSION_NEXT_CANVAS_WIDTH / 2,
    INTERMISSION_NEXT_CANVAS_WIDTH,
    INTERMISSION_NEXT_SAFE_AREA.x,
    INTERMISSION_NEXT_SAFE_AREA.x + INTERMISSION_NEXT_SAFE_AREA.width / 2,
    INTERMISSION_NEXT_SAFE_AREA.x + INTERMISSION_NEXT_SAFE_AREA.width
  ]
  const yTargets = [
    0,
    INTERMISSION_NEXT_CANVAS_HEIGHT / 2,
    INTERMISSION_NEXT_CANVAS_HEIGHT,
    INTERMISSION_NEXT_SAFE_AREA.y,
    INTERMISSION_NEXT_SAFE_AREA.y + INTERMISSION_NEXT_SAFE_AREA.height / 2,
    INTERMISSION_NEXT_SAFE_AREA.y + INTERMISSION_NEXT_SAFE_AREA.height
  ]
  for (const otherDefinition of getIntermissionNextComponentDefinitions(pageId)) {
    if (otherDefinition.id === definition.id) continue
    const otherLayout = page.components[otherDefinition.id]
    if (!otherLayout) continue
    xTargets.push(...snapOrigins(otherLayout.x, otherLayout.width))
    yTargets.push(...snapOrigins(otherLayout.y, otherLayout.height))
  }
  const safeThreshold =
    isFiniteNumber(threshold) && threshold >= 0 ? threshold : INTERMISSION_NEXT_SNAP_THRESHOLD
  return setIntermissionNextComponentPosition(
    state,
    pageId,
    componentId,
    nearestSnappedOrigin(isFiniteNumber(x) ? x : layout.x, layout.width, xTargets, safeThreshold),
    nearestSnappedOrigin(isFiniteNumber(y) ? y : layout.y, layout.height, yTargets, safeThreshold)
  )
}

export function resetIntermissionNextComponent<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId,
  componentId: string
): IntermissionNextLayoutState {
  return updatePageComponent(value, pageId, componentId, (_layout, definition) =>
    createDefaultComponentLayout(definition)
  )
}

export function resetIntermissionNextPage<PageId extends IntermissionNextPageId>(
  value: unknown,
  pageId: PageId
): IntermissionNextLayoutState {
  const state = normalizeIntermissionNextLayoutState(value)
  return {
    ...state,
    pages: {
      ...state.pages,
      [pageId]: createDefaultIntermissionNextPageLayout(pageId)
    }
  }
}

export function intermissionNextBoundsAreInsideCanvas(bounds: IntermissionNextBounds): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.x >= 0 &&
    bounds.y >= 0 &&
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.x + bounds.width <= INTERMISSION_NEXT_CANVAS_WIDTH &&
    bounds.y + bounds.height <= INTERMISSION_NEXT_CANVAS_HEIGHT
  )
}

export function getIntermissionNextPageIds(): readonly IntermissionNextPageId[] {
  return INTERMISSION_NEXT_PAGE_IDS
}
