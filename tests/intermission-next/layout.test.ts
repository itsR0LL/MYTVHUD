import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INTERMISSION_NEXT_RESIZE_HANDLES,
  INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS,
  addIntermissionNextComponent,
  createDefaultIntermissionNextLayoutState,
  getIntermissionNextComponentDefinition,
  intermissionNextBoundsAreInsideCanvas,
  normalizeIntermissionNextLayoutState,
  removeIntermissionNextComponent,
  resetIntermissionNextComponent,
  resetIntermissionNextPage,
  resizeIntermissionNextComponent,
  setIntermissionNextComponentAspectRatioLocked,
  setIntermissionNextComponentFrame,
  setIntermissionNextComponentPosition,
  setIntermissionNextComponentWindows,
  snapIntermissionNextComponentPosition
} from '../../src/shared/intermission-next'
import { UTILITY_REPLAY_TOTAL_DURATION_MS } from '../../src/shared/utility-replay'

function mapBreakWithReport() {
  return addIntermissionNextComponent(
    createDefaultIntermissionNextLayoutState(),
    'map_break',
    'mapReport',
    0
  )
}

test('默认布局只固定保留 BP 核心展示，其他页面保持为空', () => {
  const state = createDefaultIntermissionNextLayoutState()
  for (const pageId of ['warmup', 'map_break', 'series_end', 'standby'] as const) {
    assert.deepEqual(state.pages[pageId].components, {})
    assert.deepEqual(state.pages[pageId].componentWindows, {})
    assert.deepEqual(state.pages[pageId].transitions, [])
  }

  const definition = getIntermissionNextComponentDefinition('bp', 'bpCore')
  assert.ok(definition)
  assert.deepEqual(state.pages.bp.components.bpCore, definition.defaultLayout)
  assert.deepEqual(state.pages.bp.componentWindows.bpCore, [
    { id: 'bpCore-window-1', startOffsetMs: 0, endOffsetMs: null }
  ])
  assert.deepEqual(state.pages.bp.transitions, [])
})

test('BP 核心展示不能移动、缩放、改时间或删除', () => {
  const initial = createDefaultIntermissionNextLayoutState()
  let state = setIntermissionNextComponentFrame(initial, 'bp', 'bpCore', {
    x: 100,
    y: 100,
    width: 800,
    height: 450
  })
  state = setIntermissionNextComponentWindows(state, 'bp', 'bpCore', [
    { id: 'changed', startOffsetMs: 2_000, endOffsetMs: 4_000 }
  ])
  state = removeIntermissionNextComponent(state, 'bp', 'bpCore')
  assert.deepEqual(state.pages.bp, initial.pages.bp)
})

test('普通组件添加后建立默认布局和独立显示时间', () => {
  const state = mapBreakWithReport()
  const definition = getIntermissionNextComponentDefinition('map_break', 'mapReport')
  assert.ok(definition)
  assert.deepEqual(state.pages.map_break.components.mapReport, definition.defaultLayout)
  assert.deepEqual(state.pages.map_break.componentWindows.mapReport, [
    { id: 'mapReport-window-1', startOffsetMs: 0, endOffsetMs: null }
  ])
  assert.deepEqual(state.pages.series_end.components, {})
})

test('转场组件可重复插入且使用固定的放慢时长', () => {
  let state = createDefaultIntermissionNextLayoutState()
  state = addIntermissionNextComponent(state, 'map_break', 'brandTransition', 20_000)
  state = addIntermissionNextComponent(state, 'map_break', 'brandTransition', 5_000)
  assert.deepEqual(state.pages.map_break.transitions, [
    {
      id: 'transition-2',
      startOffsetMs: 5_000,
      durationMs: INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
    },
    {
      id: 'transition-1',
      startOffsetMs: 20_000,
      durationMs: INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
    }
  ])
})

test('道具回放组件固定建立两分钟时间片段', () => {
  const state = addIntermissionNextComponent(
    createDefaultIntermissionNextLayoutState(),
    'series_end',
    'utilityReplay',
    30_000
  )
  assert.deepEqual(state.pages.series_end.componentWindows.utilityReplay, [
    {
      id: 'utilityReplay-window-1',
      startOffsetMs: 30_000,
      endOffsetMs: 30_000 + UTILITY_REPLAY_TOTAL_DURATION_MS
    }
  ])
})

test('位置与尺寸输入始终受画布和组件尺寸约束', () => {
  let state = mapBreakWithReport()
  state = setIntermissionNextComponentFrame(state, 'map_break', 'mapReport', {
    x: -100,
    y: -100,
    width: 10_000,
    height: 10_000
  })
  const layout = state.pages.map_break.components.mapReport
  assert.ok(layout)
  assert.equal(intermissionNextBoundsAreInsideCanvas(layout), true)
})

test('八方向缩放保持组件位于画布内', () => {
  let initial = mapBreakWithReport()
  initial = setIntermissionNextComponentFrame(initial, 'map_break', 'mapReport', {
    x: 400,
    y: 300,
    width: 1000,
    height: 500
  })
  for (const handle of INTERMISSION_NEXT_RESIZE_HANDLES) {
    const resized = resizeIntermissionNextComponent(
      initial,
      'map_break',
      'mapReport',
      handle,
      80,
      60
    ).pages.map_break.components.mapReport
    assert.ok(resized)
    assert.equal(intermissionNextBoundsAreInsideCanvas(resized), true)
  }
})

test('锁定宽高比后缩放保持组件默认比例', () => {
  let initial = mapBreakWithReport()
  initial = setIntermissionNextComponentAspectRatioLocked(initial, 'map_break', 'mapReport', true)
  const definition = getIntermissionNextComponentDefinition('map_break', 'mapReport')
  assert.ok(definition)
  const expectedRatio = definition.defaultLayout.width / definition.defaultLayout.height
  const resized = resizeIntermissionNextComponent(
    initial,
    'map_break',
    'mapReport',
    'south_east',
    100,
    70
  ).pages.map_break.components.mapReport
  assert.ok(resized)
  assert.ok(Math.abs(resized.width / resized.height - expectedRatio) < 0.00001)
})

test('删除、恢复单组件和清空页面互不影响其他页面', () => {
  let state = mapBreakWithReport()
  state = addIntermissionNextComponent(state, 'standby', 'eventBrand', 0)
  state = setIntermissionNextComponentPosition(state, 'map_break', 'mapReport', 0, 0)
  state = resetIntermissionNextComponent(state, 'map_break', 'mapReport')
  assert.ok(state.pages.map_break.components.mapReport)
  assert.ok(state.pages.standby.components.eventBrand)
  state = removeIntermissionNextComponent(state, 'map_break', 'mapReport')
  assert.equal(state.pages.map_break.components.mapReport, undefined)
  assert.ok(state.pages.standby.components.eventBrand)
  state = resetIntermissionNextPage(state, 'standby')
  assert.deepEqual(state.pages.standby.components, {})
})

test('旧版本、错误版本和未知组件统一回退为空页面', () => {
  const defaults = createDefaultIntermissionNextLayoutState()
  assert.deepEqual(normalizeIntermissionNextLayoutState({ version: 1, pages: {} }), defaults)
  const normalized = normalizeIntermissionNextLayoutState({
    version: 2,
    pages: {
      map_break: {
        pageId: 'map_break',
        components: { arbitraryComponent: { x: 1, y: 1, width: 1, height: 1 } },
        componentWindows: {},
        transitions: []
      },
      series_end: { pageId: 'series_end', components: {}, componentWindows: {}, transitions: [] },
      standby: { pageId: 'standby', components: {}, componentWindows: {}, transitions: [] }
    }
  })
  assert.deepEqual(normalized, defaults)
})

test('吸附只读取当前页面已经添加的组件', () => {
  let state = addIntermissionNextComponent(
    createDefaultIntermissionNextLayoutState(),
    'map_break',
    'nextMap',
    0
  )
  state = snapIntermissionNextComponentPosition(state, 'map_break', 'nextMap', 64, 62, 8)
  assert.equal(state.pages.map_break.components.nextMap?.x, 60)
  assert.equal(state.pages.map_break.components.nextMap?.y, 60)
})
