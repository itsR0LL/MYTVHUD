import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  MAP_BREAK_DURATION_PRESETS_MS,
  type BroadcastProgramType
} from '../../src/shared/broadcast-flow'
import {
  createUnconfiguredBroadcastPageFlowTemplates,
  type BroadcastPageLifecycleDuration
} from '../../src/shared/broadcast-page-flow-next/page-flow'
import {
  broadcastDurationParts,
  broadcastPageFlowTemplatesAreEqual,
  cloneBroadcastPageFlowTemplates,
  evaluateBroadcastPageTiming,
  formatBroadcastPageDuration,
  setBroadcastPageDuration,
  setBroadcastPageDurationPart,
  setBroadcastPageEnabled
} from '../../src/renderer/src/components/intermission-next/page-flow-editor-helpers'

const lifecycle: Record<BroadcastProgramType, BroadcastPageLifecycleDuration> = {
  map_break: { enterDurationMs: 1_500, exitDurationMs: 800 },
  series_end: { enterDurationMs: 700, exitDurationMs: 500 },
  standby: { enterDurationMs: 1_000, exitDurationMs: 1_000 }
}

test('编辑草稿不会修改传入模板且只更新指定完整页面', () => {
  const source = createUnconfiguredBroadcastPageFlowTemplates()
  const enabled = setBroadcastPageEnabled(source, 'map_break', true)
  const changed = setBroadcastPageDuration(enabled, 'map_break', 600_000)

  assert.equal(source.templates.map_break.enabled, false)
  assert.equal(source.templates.map_break.defaultTotalDurationMs, 0)
  assert.equal(changed.templates.map_break.enabled, true)
  assert.equal(changed.templates.map_break.defaultTotalDurationMs, 600_000)
  assert.equal('utilityReplayEnabled' in changed.templates.map_break, false)
  assert.deepEqual(changed.templates.series_end, source.templates.series_end)
  assert.deepEqual(changed.templates.standby, source.templates.standby)
})

test('地图间快捷时长精确保留 5、10、15、20 分钟', () => {
  assert.deepEqual([...MAP_BREAK_DURATION_PRESETS_MS], [300_000, 600_000, 900_000, 1_200_000])
})

test('自定义分钟和秒分别修改并限制到合同上限', () => {
  let draft = createUnconfiguredBroadcastPageFlowTemplates()
  draft = setBroadcastPageDurationPart(draft, 'series_end', 'minutes', 12)
  draft = setBroadcastPageDurationPart(draft, 'series_end', 'seconds', 34)
  assert.equal(draft.templates.series_end.defaultTotalDurationMs, 754_000)
  assert.deepEqual(broadcastDurationParts(754_000), { minutes: 12, seconds: 34 })

  draft = setBroadcastPageDurationPart(draft, 'series_end', 'minutes', 120)
  draft = setBroadcastPageDurationPart(draft, 'series_end', 'seconds', 80)
  assert.equal(draft.templates.series_end.defaultTotalDurationMs, 5_999_000)
})

test('总时长不足时返回精确缺口且不压缩进入退出动画', () => {
  let templates = createUnconfiguredBroadcastPageFlowTemplates()
  templates = setBroadcastPageEnabled(templates, 'series_end', true)
  templates = setBroadcastPageDuration(templates, 'series_end', 1_000)
  const timing = evaluateBroadcastPageTiming(templates.templates.series_end, lifecycle.series_end)

  assert.deepEqual(timing, {
    status: 'insufficient',
    totalDurationMs: 1_000,
    enterDurationMs: 700,
    exitDurationMs: 500,
    minimumDurationMs: 1_200,
    deficitDurationMs: 200
  })
  assert.equal(formatBroadcastPageDuration(1_200, true), '00:01.200')
})

test('有效总时长只计算剩余稳定展示时间', () => {
  let templates = createUnconfiguredBroadcastPageFlowTemplates()
  templates = setBroadcastPageEnabled(templates, 'map_break', true)
  templates = setBroadcastPageDuration(templates, 'map_break', 600_000)
  const timing = evaluateBroadcastPageTiming(templates.templates.map_break, lifecycle.map_break)

  assert.deepEqual(timing, {
    status: 'ready',
    totalDurationMs: 600_000,
    enterDurationMs: 1_500,
    holdDurationMs: 597_700,
    exitDurationMs: 800
  })
})

test('克隆和相等判断只覆盖三个页面模板字段', () => {
  const source = createUnconfiguredBroadcastPageFlowTemplates()
  const clone = cloneBroadcastPageFlowTemplates(source)
  assert.notEqual(clone, source)
  assert.equal(broadcastPageFlowTemplatesAreEqual(source, clone), true)

  clone.templates.standby.enabled = true
  assert.equal(broadcastPageFlowTemplatesAreEqual(source, clone), false)
})

test('组件源码只发出保存事件且不接入旧内容段、公共组件或 OBS 控制', () => {
  const source = readFileSync(
    join(
      process.cwd(),
      'src/renderer/src/components/intermission-next/BroadcastPageFlowTemplateEditor.vue'
    ),
    'utf8'
  )

  assert.equal((source.match(/\bemit\(/g) ?? []).length, 1)
  assert.match(source, /emit\('save'/)
  assert.match(source, /页面播放流程/)
  assert.doesNotMatch(source, /旧九种内容段/)
  assert.match(source, /prefers-reduced-motion/)
  for (const forbidden of [
    'BroadcastContentType',
    'BroadcastComponentVisibility',
    'teamScore',
    'mapSeries',
    'timerNotice',
    'eventLogo',
    '.segments',
    'window.api',
    'showIntermission'
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
})
