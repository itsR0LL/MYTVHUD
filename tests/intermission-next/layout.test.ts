import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INTERMISSION_NEXT_RESIZE_HANDLES,
  INTERMISSION_NEXT_PAGE_IDS,
  INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS,
  addIntermissionNextComponent,
  createDefaultIntermissionNextLayoutState,
  getIntermissionNextComponentDefinition,
  getIntermissionNextComponentDefinitions,
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
  setIntermissionNextTransitionStart,
  snapIntermissionNextComponentPosition,
  type IntermissionNextComponentLayout,
  type IntermissionNextLayoutState,
  type IntermissionNextPageId
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

function componentLayoutAt(
  state: IntermissionNextLayoutState,
  pageId: IntermissionNextPageId,
  componentId: string
): IntermissionNextComponentLayout | undefined {
  const page = state.pages[pageId] as unknown as {
    components: Record<string, IntermissionNextComponentLayout | undefined>
  }
  return page.components[componentId]
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

test('BP 页面除核心展示外可独立添加和删除其他组件', () => {
  const initial = createDefaultIntermissionNextLayoutState()
  const withBrand = addIntermissionNextComponent(initial, 'bp', 'eventBrand', 0)
  const withTeams = addIntermissionNextComponent(withBrand, 'bp', 'matchTeams', 0)

  assert.ok(withTeams.pages.bp.components.bpCore)
  assert.ok(withTeams.pages.bp.components.eventBrand)
  assert.ok(withTeams.pages.bp.components.matchTeams)
  assert.deepEqual(withTeams.pages.warmup.components, {})

  const removed = removeIntermissionNextComponent(withTeams, 'bp', 'eventBrand')
  assert.equal(removed.pages.bp.components.eventBrand, undefined)
  assert.ok(removed.pages.bp.components.bpCore)
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

test('地图序列默认使用横向数据板尺寸并允许扩大高度', () => {
  const definition = getIntermissionNextComponentDefinition('map_break', 'mapSequence')
  assert.ok(definition)
  assert.deepEqual(definition.defaultLayout, {
    x: 180,
    y: 40,
    width: 1560,
    height: 160,
    aspectRatioLocked: false
  })
  assert.equal(definition.sizeConstraints.minimumHeight, 110)
  assert.equal(definition.sizeConstraints.maximumHeight, 300)
})

test('系列赛密集数据组件保留可读的最小画布尺寸', () => {
  const finalScore = getIntermissionNextComponentDefinition('series_end', 'finalScore')
  const playerStats = getIntermissionNextComponentDefinition('series_end', 'seriesPlayerStats')

  assert.ok(finalScore)
  assert.ok(playerStats)
  assert.equal(finalScore.sizeConstraints.minimumWidth, 520)
  assert.deepEqual(playerStats.defaultLayout, {
    x: 120,
    y: 650,
    width: 1680,
    height: 320,
    aspectRatioLocked: false
  })
  assert.equal(playerStats.sizeConstraints.minimumHeight, 280)
  assert.equal(playerStats.sizeConstraints.maximumHeight, 560)
})

test('旧地图序列默认尺寸迁移到新版且保留自定义布局', () => {
  const state = addIntermissionNextComponent(
    createDefaultIntermissionNextLayoutState(),
    'map_break',
    'mapSequence',
    0
  )
  state.pages.map_break.components.mapSequence = {
    x: 180,
    y: 80,
    width: 1180,
    height: 110,
    aspectRatioLocked: false
  }
  const migrated = normalizeIntermissionNextLayoutState(state)
  assert.deepEqual(
    migrated.pages.map_break.components.mapSequence,
    getIntermissionNextComponentDefinition('map_break', 'mapSequence')?.defaultLayout
  )

  state.pages.map_break.components.mapSequence.x = 220
  const preserved = normalizeIntermissionNextLayoutState(state)
  assert.equal(preserved.pages.map_break.components.mapSequence?.x, 220)
  assert.equal(preserved.pages.map_break.components.mapSequence?.width, 1180)
})

test('全部画布可编辑组件具有有效最小尺寸并默认允许万向拉伸', () => {
  for (const pageId of INTERMISSION_NEXT_PAGE_IDS) {
    for (const definition of getIntermissionNextComponentDefinitions(pageId)) {
      if (definition.canvasEditable === false || definition.required) continue
      assert.equal(definition.defaultLayout.aspectRatioLocked, false, `${pageId}.${definition.id}`)
      assert.ok(definition.sizeConstraints.minimumWidth > 0, `${pageId}.${definition.id}`)
      assert.ok(definition.sizeConstraints.minimumHeight > 0, `${pageId}.${definition.id}`)
      assert.ok(
        definition.defaultLayout.width >= definition.sizeConstraints.minimumWidth,
        `${pageId}.${definition.id}`
      )
      assert.ok(
        definition.defaultLayout.height >= definition.sizeConstraints.minimumHeight,
        `${pageId}.${definition.id}`
      )
      assert.ok(
        definition.defaultLayout.width <= definition.sizeConstraints.maximumWidth,
        `${pageId}.${definition.id}`
      )
      assert.ok(
        definition.defaultLayout.height <= definition.sizeConstraints.maximumHeight,
        `${pageId}.${definition.id}`
      )
    }
  }
})

test('旧赛事标志和最终比分默认锁定迁移为万向拉伸且保留自定义锁定', () => {
  let state = createDefaultIntermissionNextLayoutState()
  state = addIntermissionNextComponent(state, 'warmup', 'eventMark', 0)
  state = addIntermissionNextComponent(state, 'series_end', 'finalScore', 0)
  const oldEventMark = state.pages.warmup.components.eventMark
  const oldFinalScore = state.pages.series_end.components.finalScore
  assert.ok(oldEventMark)
  assert.ok(oldFinalScore)
  oldEventMark.aspectRatioLocked = true
  oldFinalScore.aspectRatioLocked = true

  const migrated = normalizeIntermissionNextLayoutState(state)
  assert.equal(migrated.pages.warmup.components.eventMark?.aspectRatioLocked, false)
  assert.equal(migrated.pages.series_end.components.finalScore?.aspectRatioLocked, false)

  oldEventMark.x += 10
  const preserved = normalizeIntermissionNextLayoutState(state)
  assert.equal(preserved.pages.warmup.components.eventMark?.aspectRatioLocked, true)
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

test('页内定时转场不能插入或移动到页面零时刻', () => {
  const initial = createDefaultIntermissionNextLayoutState()
  const unchanged = addIntermissionNextComponent(initial, 'map_break', 'brandTransition', 0)
  assert.deepEqual(unchanged.pages.map_break.transitions, [])

  const added = addIntermissionNextComponent(initial, 'map_break', 'brandTransition', 60_000)
  const moved = setIntermissionNextTransitionStart(
    added,
    'map_break',
    added.pages.map_break.transitions[0].id,
    0
  )
  assert.equal(moved.pages.map_break.transitions[0].startOffsetMs, 60_000)
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

test('全部可编辑组件分别响应横向与纵向拉伸并遵守最小尺寸', () => {
  for (const pageId of INTERMISSION_NEXT_PAGE_IDS) {
    for (const definition of getIntermissionNextComponentDefinitions(pageId)) {
      if (definition.canvasEditable === false || definition.required) continue
      const added = addIntermissionNextComponent(
        createDefaultIntermissionNextLayoutState(),
        pageId,
        definition.id,
        0
      )
      const minimumState = setIntermissionNextComponentFrame(added, pageId, definition.id, {
        x: 0,
        y: 0,
        width: 1,
        height: 1
      })
      const minimum = componentLayoutAt(minimumState, pageId, definition.id)
      assert.ok(minimum, `${pageId}.${definition.id}`)
      assert.equal(minimum.width, definition.sizeConstraints.minimumWidth)
      assert.equal(minimum.height, definition.sizeConstraints.minimumHeight)

      const horizontalState = resizeIntermissionNextComponent(
        added,
        pageId,
        definition.id,
        'east',
        40,
        0
      )
      const verticalState = resizeIntermissionNextComponent(
        added,
        pageId,
        definition.id,
        'south',
        0,
        40
      )
      const horizontal = componentLayoutAt(horizontalState, pageId, definition.id)
      const vertical = componentLayoutAt(verticalState, pageId, definition.id)
      assert.ok(horizontal, `${pageId}.${definition.id}`)
      assert.ok(vertical, `${pageId}.${definition.id}`)
      assert.equal(horizontal.height, definition.defaultLayout.height)
      assert.ok(horizontal.width > definition.defaultLayout.width)
      assert.equal(vertical.width, definition.defaultLayout.width)
      assert.ok(vertical.height > definition.defaultLayout.height)
    }
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
