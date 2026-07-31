import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const componentPath = join(
  process.cwd(),
  'src/renderer/src/components/intermission-next/IntermissionNextWorkspace.vue'
)
const source = readFileSync(componentPath, 'utf8')
const pageSource = readFileSync(
  join(process.cwd(), 'src/renderer/src/pages/intermission.vue'),
  'utf8'
)
const previewSource = readFileSync(
  join(
    process.cwd(),
    'src/renderer/src/components/intermission-next/IntermissionNextPreviewFrame.vue'
  ),
  'utf8'
)
const flowEditorSource = readFileSync(
  join(
    process.cwd(),
    'src/renderer/src/components/intermission-next/BroadcastPageFlowTemplateEditor.vue'
  ),
  'utf8'
)

test('工作区只组合页面流程、页面设置、共享预览和导演控制插槽', () => {
  for (const component of ['BroadcastPageFlowTemplateEditor', 'IntermissionNextLayoutEditor']) {
    assert.match(source, new RegExp(`import ${component} from`))
    assert.equal((source.match(new RegExp(`<${component}\\b`, 'g')) ?? []).length, 1)
  }
  assert.match(source, /<slot name="monitor"/)
  assert.match(source, /<slot name="director-controls"/)
  assert.doesNotMatch(source, /GlobalBackgroundControls/)
})

test('页面播放流程面板只承载页面模板编辑器', () => {
  const flowStart = source.indexOf('id="workspace-flow-panel"')
  const layoutStart = source.indexOf('id="workspace-layout-panel"')
  assert.ok(flowStart >= 0)
  assert.ok(layoutStart > flowStart)
  const flowPanel = source.slice(flowStart, layoutStart)

  assert.match(flowPanel, /BroadcastPageFlowTemplateEditor/)
  assert.doesNotMatch(flowPanel, /IntermissionNextLayoutEditor/)
  assert.doesNotMatch(flowPanel, /GlobalBackgroundControls/)
  assert.doesNotMatch(flowPanel, /IntermissionNextPreviewFrame/)
})

test('页面设置面板只承载实际预览布局编辑器', () => {
  const layoutStart = source.indexOf('id="workspace-layout-panel"')
  assert.ok(layoutStart >= 0)
  const layoutPanel = source.slice(layoutStart, source.indexOf('</template>'))

  assert.doesNotMatch(layoutPanel, /GlobalBackgroundControls/)
  assert.match(layoutPanel, /IntermissionNextLayoutEditor/)
  assert.doesNotMatch(layoutPanel, /BroadcastPageFlowTemplateEditor/)
  assert.match(source, /页面播放流程/)
  assert.match(source, /页面设置/)
})

test('预览数据边界保留在代码合同中', () => {
  assert.match(source, /previewPayload: IntermissionNextOutputPayloadV1/)
  assert.match(source, /:preview-payload="previewPayload"/)
  assert.equal(source.includes('formalPayload'), false)
  assert.equal(source.includes('outputPayload'), false)
})

test('管理端不显示开发阶段的架构与数据协议标记', () => {
  const visibleInterfaceSources = [pageSource, source, previewSource, flowEditorSource]
  const forbiddenLabels = [
    '三页面架构',
    '页面流程 V2',
    '预览与正式输出隔离',
    '预览消息与正式 OBS 输出隔离',
    '三个完整页面',
    '布局、背景与预览',
    '管理端预览边界',
    '不接收、不构建，也不修改正式输出payload',
    'previewPayload</span>',
    '完整页面模式',
    '模板边界',
    '新版赛间页面',
    '完整页面正在播放'
  ]

  for (const interfaceSource of visibleInterfaceSources) {
    for (const label of forbiddenLabels) assert.equal(interfaceSource.includes(label), false, label)
  }
})

test('工作区只转发标签和两类设置保存事件', () => {
  const expectedEvents = ["'update:activeSection'", 'saveTemplate', 'saveLayout']
  for (const eventName of expectedEvents) assert.match(source, new RegExp(eventName))

  assert.match(source, /@save="emit\('saveTemplate', \$event\)"/)
  assert.match(source, /@save="emit\('saveLayout', \$event\)"/)
  assert.doesNotMatch(
    source,
    /backgroundSwitch|backgroundPlay|backgroundPause|backgroundVisibility/
  )
})

test('工作区不持有业务状态且没有正式播出或网络调用', () => {
  for (const forbidden of [
    'window.api',
    'fetch(',
    'socket',
    'showIntermission',
    'startBroadcast',
    'replay',
    'onAir',
    'ref(',
    'reactive('
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden)
  }
})

test('工作区提供键盘标签切换、可见焦点和reduced-motion降级', () => {
  assert.match(source, /role="tablist"/)
  assert.match(source, /role="tab"/)
  assert.match(source, /@keydown\.left\.prevent/)
  assert.match(source, /@keydown\.right\.prevent/)
  assert.match(source, /:focus-visible/)
  assert.match(source, /prefers-reduced-motion/)
})
