import assert from 'node:assert/strict'
import test from 'node:test'
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
  const segment = (contentType: string, enabled: boolean) => ({
    contentType,
    enabled,
    minimumDurationMs: 0,
    preferredDurationMs: 0,
    maximumDurationMs: 0,
    weight: 1
  })
  const legacy = {
    map_break: {
      defaultTotalDurationMs: 600_000,
      segments: [segment('map_report', true)]
    },
    series_end: {
      defaultTotalDurationMs: 300_000,
      segments: [
        segment('series_result', false),
        segment('series_map_history', false),
        segment('series_player_stats', false),
        segment('map_utility_replay', false),
        segment('standby', false)
      ]
    },
    standby: {
      defaultTotalDurationMs: 900_000,
      segments: [segment('standby', true)]
    }
  }

  const migrated = migrateBroadcastFlowTemplatesV1ToPageFlowV3(legacy)
  assert.equal(migrated.version, 3)
  assert.equal(migrated.templates.map_break.defaultTotalDurationMs, 600_000)
  assert.equal(migrated.templates.map_break.enabled, true)
  assert.equal(migrated.templates.series_end.defaultTotalDurationMs, 300_000)
  assert.equal(migrated.templates.series_end.enabled, false)
  assert.equal('segments' in migrated.templates.map_break, false)
  assert.equal('components' in migrated.templates.map_break, false)
})

test('旧模板缺失时仍可迁移赛间倒计时总时长', () => {
  const migrated = migrateBroadcastFlowTemplatesV1ToPageFlowV3(undefined, 600_000)
  assert.equal(migrated.templates.map_break.defaultTotalDurationMs, 600_000)
  assert.equal(migrated.templates.map_break.enabled, true)
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

test('页面时间轴可在道具回放结束后播放固定转场再进入赛后数据', () => {
  let layout = createDefaultIntermissionNextLayoutState()
  layout = addIntermissionNextComponent(layout, 'map_break', 'mapReport', 0)
  layout = addIntermissionNextComponent(layout, 'map_break', 'utilityReplay', 0)
  layout = addIntermissionNextComponent(
    layout,
    'map_break',
    'brandTransition',
    UTILITY_REPLAY_TOTAL_DURATION_MS
  )
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
      ['map_utility_replay', UTILITY_REPLAY_TOTAL_DURATION_MS],
      ['page_transition', INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS],
      [
        'map_report',
        300_000 -
          UTILITY_REPLAY_TOTAL_DURATION_MS -
          INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
      ]
    ]
  )
  assert.equal(segments.at(-1)?.endOffsetMs, 300_000)
})

test('转场重叠或组件超出页面时拒绝开始播出', () => {
  let layout = createDefaultIntermissionNextLayoutState()
  layout = addIntermissionNextComponent(layout, 'standby', 'brandTransition', 500)
  layout = addIntermissionNextComponent(layout, 'standby', 'brandTransition', 1_000)
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

test('旧布局中的零时刻页内转场会被播出流程明确拒绝', () => {
  const layout = createDefaultIntermissionNextLayoutState()
  const pageLayout: (typeof layout.pages)['standby'] = {
    ...layout.pages.standby,
    transitions: [
      {
        id: 'legacy-transition',
        startOffsetMs: 0,
        durationMs: INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
      }
    ]
  }
  assert.throws(
    () =>
      allocateBroadcastPageSegments(
        {
          type: 'standby',
          pageId: 'standby',
          enabled: true,
          defaultTotalDurationMs: 60_000
        },
        60_000,
        { availableContentTypes: ['standby'], pageLayout }
      ),
    /页内定时转场不能设置在页面开始时/
  )
})
