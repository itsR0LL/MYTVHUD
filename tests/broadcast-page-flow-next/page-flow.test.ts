import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createUnconfiguredBroadcastFlowTemplates,
  type BroadcastFlowTemplatesV1
} from '../../src/shared/broadcast-flow'
import {
  allocateBroadcastPageSegments,
  allocateBroadcastPageWindow,
  createUnconfiguredBroadcastPageFlowTemplates,
  migrateBroadcastFlowTemplatesV1ToPageFlowV3,
  normalizeBroadcastPageFlowTemplates
} from '../../src/shared/broadcast-page-flow-next/page-flow'
import {
  INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS,
  addIntermissionNextComponent,
  createDefaultIntermissionNextLayoutState
} from '../../src/shared/intermission-next'
import { UTILITY_REPLAY_TOTAL_DURATION_MS } from '../../src/shared/utility-replay'

test('旧模板迁移只保留三类页面总时长和启用状态', () => {
  const legacy: BroadcastFlowTemplatesV1 = createUnconfiguredBroadcastFlowTemplates()
  legacy.map_break.defaultTotalDurationMs = 600_000
  legacy.series_end.defaultTotalDurationMs = 300_000
  legacy.standby.defaultTotalDurationMs = 900_000
  legacy.series_end.segments.forEach((segment) => {
    segment.enabled = false
  })

  const migrated = migrateBroadcastFlowTemplatesV1ToPageFlowV3(legacy)
  assert.equal(migrated.version, 3)
  assert.equal(migrated.templates.map_break.defaultTotalDurationMs, 600_000)
  assert.equal(migrated.templates.map_break.enabled, true)
  assert.equal(migrated.templates.series_end.defaultTotalDurationMs, 300_000)
  assert.equal(migrated.templates.series_end.enabled, false)
  assert.equal('segments' in migrated.templates.map_break, false)
  assert.equal('components' in migrated.templates.map_break, false)
})

test('错误版本和未知页面安全回退为未配置模板', () => {
  const fallback = createUnconfiguredBroadcastPageFlowTemplates()
  assert.deepEqual(normalizeBroadcastPageFlowTemplates({ version: 1 }), fallback)
  assert.deepEqual(
    normalizeBroadcastPageFlowTemplates({
      version: 3,
      order: ['map_break', 'series_end', 'standby'],
      templates: {
        map_break: {
          type: 'map_break',
          pageId: 'unknown',
          enabled: true,
          defaultTotalDurationMs: 600_000
        }
      }
    }).templates.map_break,
    fallback.templates.map_break
  )
})

test('V2页面总时长可以迁移为V3且不保留旧道具开关', () => {
  const migrated = normalizeBroadcastPageFlowTemplates({
    version: 2,
    order: ['map_break', 'series_end', 'standby'],
    templates: {
      map_break: {
        type: 'map_break',
        pageId: 'map_break',
        enabled: true,
        defaultTotalDurationMs: 600_000,
        utilityReplayEnabled: true
      },
      series_end: {
        type: 'series_end',
        pageId: 'series_end',
        enabled: false,
        defaultTotalDurationMs: 300_000
      },
      standby: {
        type: 'standby',
        pageId: 'standby',
        enabled: false,
        defaultTotalDurationMs: 900_000
      }
    }
  })
  assert.equal(migrated.version, 3)
  assert.equal(migrated.templates.map_break.defaultTotalDurationMs, 600_000)
  assert.equal('utilityReplayEnabled' in migrated.templates.map_break, false)
})

test('页面执行窗口只划分进入、保持和退出边界', () => {
  const template = {
    type: 'map_break',
    pageId: 'map_break',
    enabled: true,
    defaultTotalDurationMs: 600_000
  } as const
  const result = allocateBroadcastPageWindow(template, 600_000, {
    enterDurationMs: 1_500,
    exitDurationMs: 800
  })
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return
  assert.deepEqual(result.window, {
    pageId: 'map_break',
    totalDurationMs: 600_000,
    enterStartOffsetMs: 0,
    enterEndOffsetMs: 1_500,
    holdStartOffsetMs: 1_500,
    holdEndOffsetMs: 599_200,
    exitStartOffsetMs: 599_200,
    exitEndOffsetMs: 600_000
  })
})

test('总时长不足时不压缩页面内部动画', () => {
  const result = allocateBroadcastPageWindow(
    {
      type: 'series_end',
      pageId: 'series_end',
      enabled: true,
      defaultTotalDurationMs: 1_000
    },
    1_000,
    { enterDurationMs: 700, exitDurationMs: 500 }
  )
  assert.deepEqual(result, { status: 'insufficient', minimumDurationMs: 1_200 })
})

test('页面时间轴生成普通内容、转场和固定道具回放片段', () => {
  let layout = createDefaultIntermissionNextLayoutState()
  layout = addIntermissionNextComponent(layout, 'map_break', 'mapReport', 0)
  layout = addIntermissionNextComponent(layout, 'map_break', 'brandTransition', 10_000)
  layout = addIntermissionNextComponent(layout, 'map_break', 'utilityReplay', 60_000)
  const segments = allocateBroadcastPageSegments(
    {
      type: 'map_break',
      pageId: 'map_break',
      enabled: true,
      defaultTotalDurationMs: 300_000
    },
    300_000,
    {
      availableContentTypes: ['map_report', 'map_utility_replay'],
      pageLayout: layout.pages.map_break
    }
  )
  assert.deepEqual(
    segments.map((segment) => [segment.contentType, segment.durationMs]),
    [
      ['map_report', 10_000],
      ['page_transition', INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS],
      ['map_report', 50_000 - INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS],
      ['map_utility_replay', UTILITY_REPLAY_TOTAL_DURATION_MS],
      ['map_report', 120_000]
    ]
  )
  assert.equal(segments.at(-1)?.endOffsetMs, 300_000)
})

test('转场重叠或组件超出页面时拒绝开始播出', () => {
  let layout = createDefaultIntermissionNextLayoutState()
  layout = addIntermissionNextComponent(layout, 'standby', 'brandTransition', 0)
  layout = addIntermissionNextComponent(layout, 'standby', 'brandTransition', 500)
  assert.throws(() =>
    allocateBroadcastPageSegments(
      {
        type: 'standby',
        pageId: 'standby',
        enabled: true,
        defaultTotalDurationMs: 60_000
      },
      60_000,
      { availableContentTypes: ['standby'], pageLayout: layout.pages.standby }
    )
  )
})
