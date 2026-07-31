import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addIntermissionNextComponent,
  createDefaultIntermissionNextLayoutState,
  setIntermissionNextComponentPosition,
  snapIntermissionNextComponentPosition
} from '../../src/shared/intermission-next'
import {
  cloneIntermissionNextLayoutState,
  findIntermissionNextAlignmentGuides,
  intermissionNextCanvasPoint,
  intermissionNextLayoutsAreEqual,
  intermissionNextSelectionStyle
} from '../../src/renderer/src/components/intermission-next/editor-helpers'
import { createIntermissionNextPreviewMessage } from '../../src/renderer/src/components/intermission-next/preview-message'
import { INTERMISSION_NEXT_PREVIEW_MESSAGE } from '../../src/shared/intermission-output-next/output'

test('编辑器布局克隆不共享组件或时间片段引用', () => {
  const source = addIntermissionNextComponent(
    createDefaultIntermissionNextLayoutState(),
    'map_break',
    'mapReport',
    0
  )
  const clone = cloneIntermissionNextLayoutState(source)
  assert.ok(clone.pages.map_break.components.mapReport)
  clone.pages.map_break.components.mapReport.x = 0
  assert.notEqual(
    clone.pages.map_break.components.mapReport.x,
    source.pages.map_break.components.mapReport?.x
  )
})

test('布局相等比较覆盖组件、时间片段和转场', () => {
  const first = createDefaultIntermissionNextLayoutState()
  const second = addIntermissionNextComponent(first, 'standby', 'eventBrand', 0)
  assert.equal(intermissionNextLayoutsAreEqual(first, second), false)
  const third = addIntermissionNextComponent(first, 'standby', 'brandTransition', 1_000)
  assert.equal(intermissionNextLayoutsAreEqual(first, third), false)
})

test('1920x1080 布局正确换算为百分比选中框', () => {
  assert.deepEqual(
    intermissionNextSelectionStyle({
      x: 960,
      y: 540,
      width: 480,
      height: 270,
      aspectRatioLocked: false
    }),
    { left: '50%', top: '50%', width: '25%', height: '25%' }
  )
})

test('指针坐标按实际画布尺寸映射到 1920x1080', () => {
  assert.deepEqual(
    intermissionNextCanvasPoint(500, 300, { left: 20, top: 30, width: 960, height: 540 }),
    { x: 960, y: 540 }
  )
  assert.equal(intermissionNextCanvasPoint(0, 0, { left: 0, top: 0, width: 0, height: 540 }), null)
})

test('吸附后返回安全区的精确视觉辅助线', () => {
  let state = addIntermissionNextComponent(
    createDefaultIntermissionNextLayoutState(),
    'standby',
    'eventBrand',
    0
  )
  state = setIntermissionNextComponentPosition(state, 'standby', 'eventBrand', 63, 62)
  state = snapIntermissionNextComponentPosition(state, 'standby', 'eventBrand', 63, 62, 8)
  assert.deepEqual(
    findIntermissionNextAlignmentGuides(state, 'standby', 'eventBrand', { x: true, y: true }),
    { x: 60, y: 60 }
  )
})

test('管理端预览消息把响应式代理转换为可结构化克隆的独立数据', () => {
  const sourcePayload = new Proxy({ version: 1, nested: { visible: false } }, {})
  const message = createIntermissionNextPreviewMessage(sourcePayload as never)
  assert.equal(message.type, INTERMISSION_NEXT_PREVIEW_MESSAGE)
  assert.notEqual(message.payload, sourcePayload)
  assert.deepEqual(message.payload, { version: 1, nested: { visible: false } })
  assert.doesNotThrow(() => structuredClone(message))
})
