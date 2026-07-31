import {
  INTERMISSION_NEXT_CANVAS_HEIGHT,
  INTERMISSION_NEXT_CANVAS_WIDTH,
  INTERMISSION_NEXT_SAFE_AREA,
  getIntermissionNextComponentDefinitions,
  normalizeIntermissionNextLayoutState,
  type IntermissionNextComponentLayout,
  type IntermissionNextLayoutState,
  type IntermissionNextPageId
} from '../../../../shared/intermission-next'

export interface IntermissionNextCanvasRect {
  left: number
  top: number
  width: number
  height: number
}

export interface IntermissionNextCanvasPoint {
  x: number
  y: number
}

export interface IntermissionNextAlignmentGuides {
  x: number | null
  y: number | null
}

export interface IntermissionNextGuideAxes {
  x: boolean
  y: boolean
}

const GEOMETRY_EPSILON = 0.01

export function cloneIntermissionNextLayoutState(value: unknown): IntermissionNextLayoutState {
  return normalizeIntermissionNextLayoutState(value)
}

export function intermissionNextLayoutsAreEqual(first: unknown, second: unknown): boolean {
  return (
    JSON.stringify(normalizeIntermissionNextLayoutState(first)) ===
    JSON.stringify(normalizeIntermissionNextLayoutState(second))
  )
}

export function intermissionNextSelectionStyle(
  layout: IntermissionNextComponentLayout
): Record<'left' | 'top' | 'width' | 'height', string> {
  return {
    left: `${(layout.x / INTERMISSION_NEXT_CANVAS_WIDTH) * 100}%`,
    top: `${(layout.y / INTERMISSION_NEXT_CANVAS_HEIGHT) * 100}%`,
    width: `${(layout.width / INTERMISSION_NEXT_CANVAS_WIDTH) * 100}%`,
    height: `${(layout.height / INTERMISSION_NEXT_CANVAS_HEIGHT) * 100}%`
  }
}

export function intermissionNextCanvasPoint(
  clientX: number,
  clientY: number,
  rect: IntermissionNextCanvasRect
): IntermissionNextCanvasPoint | null {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null
  }
  return {
    x: ((clientX - rect.left) * INTERMISSION_NEXT_CANVAS_WIDTH) / rect.width,
    y: ((clientY - rect.top) * INTERMISSION_NEXT_CANVAS_HEIGHT) / rect.height
  }
}

function alignmentPoints(layout: IntermissionNextComponentLayout, axis: 'x' | 'y'): number[] {
  const origin = layout[axis]
  const length = axis === 'x' ? layout.width : layout.height
  return [origin, origin + length / 2, origin + length]
}

function axisTargets(
  state: IntermissionNextLayoutState,
  pageId: IntermissionNextPageId,
  componentId: string,
  axis: 'x' | 'y'
): number[] {
  const canvasLength =
    axis === 'x' ? INTERMISSION_NEXT_CANVAS_WIDTH : INTERMISSION_NEXT_CANVAS_HEIGHT
  const safeOrigin = INTERMISSION_NEXT_SAFE_AREA[axis]
  const safeLength =
    axis === 'x' ? INTERMISSION_NEXT_SAFE_AREA.width : INTERMISSION_NEXT_SAFE_AREA.height
  const targets = [0, canvasLength / 2, canvasLength, safeOrigin, safeOrigin + safeLength / 2]
  targets.push(safeOrigin + safeLength)
  const components = state.pages[pageId].components as Record<
    string,
    IntermissionNextComponentLayout
  >
  for (const definition of getIntermissionNextComponentDefinitions(pageId)) {
    if (definition.id === componentId) continue
    const layout = components[definition.id]
    if (layout) targets.push(...alignmentPoints(layout, axis))
  }
  return targets
}

function matchingGuide(points: readonly number[], targets: readonly number[]): number | null {
  for (const point of points) {
    const target = targets.find((value) => Math.abs(value - point) <= GEOMETRY_EPSILON)
    if (target !== undefined) return target
  }
  return null
}

export function findIntermissionNextAlignmentGuides(
  value: unknown,
  pageId: IntermissionNextPageId,
  componentId: string,
  axes: IntermissionNextGuideAxes
): IntermissionNextAlignmentGuides {
  const state = normalizeIntermissionNextLayoutState(value)
  const components = state.pages[pageId].components as Record<
    string,
    IntermissionNextComponentLayout
  >
  const layout = components[componentId]
  if (!layout) return { x: null, y: null }
  return {
    x: axes.x
      ? matchingGuide(alignmentPoints(layout, 'x'), axisTargets(state, pageId, componentId, 'x'))
      : null,
    y: axes.y
      ? matchingGuide(alignmentPoints(layout, 'y'), axisTargets(state, pageId, componentId, 'y'))
      : null
  }
}
