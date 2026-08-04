import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  MANAGER_SETTING_KEYS,
  createDefaultManagerSettings,
  managerSettingsEntries,
  normalizeManagerSettings
} from '../../src/shared/manager-settings'

test('设置表单忽略播出页面布局和流程配置', () => {
  const normalized = normalizeManagerSettings({
    seriesName_first: '赛事名称',
    borderRadius: '12px',
    intermissionNextLayoutV2: { nested: true },
    broadcastPageFlowTemplatesV3: { nested: true }
  })

  assert.equal(normalized.seriesName_first, '赛事名称')
  assert.equal(normalized.borderRadius, '12')
  assert.equal('intermissionNextLayoutV2' in normalized, false)
  assert.equal('broadcastPageFlowTemplatesV3' in normalized, false)
})

test('设置保存数据只包含页面可编辑的基础字段', () => {
  const entries = managerSettingsEntries(createDefaultManagerSettings())
  assert.deepEqual(
    entries.map(([key]) => key),
    MANAGER_SETTING_KEYS
  )
  assert.doesNotThrow(() => structuredClone(Object.fromEntries(entries)))
})

test('设置页面不再通过 setAll 覆盖完整设置数据库', () => {
  const source = readFileSync('src/renderer/src/pages/settings.vue', 'utf8')
  assert.doesNotMatch(source, /window\.db\.settings\.setAll/)
  assert.match(source, /window\.db\.settings\.set\(key, value\)/)
})
