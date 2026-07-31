import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const rendererRoot = join(process.cwd(), 'src/renderer/src')
const globalStyles = readFileSync(join(rendererRoot, 'assets/main.scss'), 'utf8')

test('应用页面滚动区域隐藏滚动条但保留滚动容器', () => {
  assert.match(globalStyles, /\.app-scrollbar-hidden\s*\{/)
  assert.match(globalStyles, /scrollbar-width:\s*none/)
  assert.match(globalStyles, /\.app-scrollbar-hidden::-webkit-scrollbar/)

  for (const page of ['matchs.vue', 'intermission.vue']) {
    const source = readFileSync(join(rendererRoot, 'pages', page), 'utf8')
    assert.match(source, /class="[^"]*app-scrollbar-hidden[^"]*"/)
    assert.match(source, /overflow-y:\s*auto/)
  }
})
