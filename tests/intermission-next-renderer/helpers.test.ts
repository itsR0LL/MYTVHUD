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
import { createEditorPreviewPayload } from '../../src/renderer/src/components/intermission-next/editor-preview-data'
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

test('BP 页面编辑预览不采用尚未完成的实际 BP 序列', () => {
  const layout = createDefaultIntermissionNextLayoutState()
  const result = createEditorPreviewPayload(
    {
      payloadRevision: 1,
      playRevision: 1,
      pageData: {
        page: 'bp',
        matchId: 'preview-incomplete-bp',
        matchType: 'BO3',
        teamA: { id: 'team-a', name: '战队 A', avatar: null },
        teamB: { id: 'team-b', name: '战队 B', avatar: null },
        sequence: [],
        playbackStarted: false,
        playbackStartedAtMs: null,
        animationEnabled: true,
        playRevision: 1,
        preview: false,
        issues: []
      },
      utilityReplay: null
    } as never,
    layout,
    'bp',
    12_000,
    0
  )
  assert.equal(result.pageData?.page, 'bp')
  if (result.pageData?.page !== 'bp') throw new Error('BP 编辑预览页面类型无效')
  assert.equal(result.pageData.sequence.length, 7)
  assert.equal(result.pageData.sequence.filter((item) => item.action !== 'ban').length, 3)
})

test('地图间编辑预览为地图序列和下一张地图补齐本地动态图片', () => {
  const result = createEditorPreviewPayload(
    {
      payloadRevision: 1,
      playRevision: 1,
      pageData: null,
      mapMedia: [],
      utilityReplay: null
    } as never,
    createDefaultIntermissionNextLayoutState(),
    'map_break',
    600_000,
    9_000
  )
  const sequenceFrames = result.mapMedia.filter((frame) => frame.purpose === 'sequence')
  const heroFrames = result.mapMedia.filter((frame) => frame.purpose === 'hero')
  assert.equal(sequenceFrames.length, 3)
  assert.equal(heroFrames.length, 1)
  assert.equal(heroFrames[0]?.mapId, 'de_anubis')
  assert.equal(
    sequenceFrames.every((frame) => frame.preload !== null),
    true
  )
})
