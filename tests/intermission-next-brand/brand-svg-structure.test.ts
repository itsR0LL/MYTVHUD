import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const brandRoot = join(process.cwd(), 'src/main/intermission-next/assets/brand')
const files = {
  transparentChicken: readFileSync(join(brandRoot, 'mytvhud-chicken-mark.svg'), 'utf8'),
  applicationChicken: readFileSync(join(brandRoot, 'mytvhud-chicken-app-icon.svg'), 'utf8'),
  counterStrike: readFileSync(join(brandRoot, 'counter-strike-2-wordmark.svg'), 'utf8')
}

function assertPureVector(source: string, name: string): void {
  assert.match(source, /<svg\b/, name)
  assert.doesNotMatch(source, /<image\b/i, `${name}: image`)
  assert.doesNotMatch(source, /<text\b/i, `${name}: text`)
  assert.doesNotMatch(source, /\b(?:href|xlink:href)\s*=/i, `${name}: href`)
  assert.doesNotMatch(source, /\bdata:/i, `${name}: data URI`)
  assert.doesNotMatch(source, /\bbase64\b/i, `${name}: base64`)
}

test('两份小鸡SVG和CS2字标均为无外部依赖的纯矢量资源', () => {
  for (const [name, source] of Object.entries(files)) assertPureVector(source, name)
})

test('透明小鸡标志保持无底板结构', () => {
  assert.match(files.transparentChicken, /id="mytvhud-chicken-mark"/)
  assert.doesNotMatch(files.transparentChicken, /id="application-icon-background"/)
  assert.doesNotMatch(files.transparentChicken, /<rect\b/i)
})

test('小鸡应用版包含256方形白色圆角矢量底板', () => {
  assert.match(files.applicationChicken, /viewBox="0 0 256 256"/)
  const background = files.applicationChicken.match(
    /<rect\b[^>]*id="application-icon-background"[^>]*\/>/
  )?.[0]
  assert.ok(background)
  assert.match(background, /\bwidth="256"/)
  assert.match(background, /\bheight="256"/)
  assert.match(background, /\brx="32"/)
  assert.match(background, /\bfill="#ffffff"/i)
})

test('小鸡应用版保留天线、电视和小鸡的独立矢量分组', () => {
  for (const id of [
    'application-icon-mark',
    'application-icon-antenna',
    'application-icon-television',
    'application-icon-chicken'
  ]) {
    assert.match(files.applicationChicken, new RegExp(`id="${id}"`))
  }
  assert.ok((files.applicationChicken.match(/<path\b/g) ?? []).length >= 6)
})

test('CS2字标继续保留三个独立字形组', () => {
  for (const id of ['counter', 'strike', 'number-2']) {
    assert.match(files.counterStrike, new RegExp(`id="${id}"`))
  }
})
