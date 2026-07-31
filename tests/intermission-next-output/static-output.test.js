/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const outputDirectory = path.resolve(__dirname, '../../src/main/intermission-next/file')
const bpAssetDirectory = path.resolve(__dirname, '../../src/main/bp/file')

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function read(fileName) {
  return fs.readFileSync(path.join(outputDirectory, fileName), 'utf8')
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function readBPAsset(fileName) {
  return fs.readFileSync(path.join(bpAssetDirectory, fileName), 'utf8')
}

test('正式入口与管理端预览入口严格隔离', () => {
  const formal = read('index.html')
  const preview = read('preview.html')
  assert.match(formal, /data-output-mode="formal"/)
  assert.match(preview, /data-output-mode="preview"/)
  assert.equal(formal.includes('demo-data.js'), false)
  assert.equal(preview.includes('demo-data.js'), false)
  assert.equal(preview.includes('socket.io'), false)
})

test('输出包含持续存在的双 video 背景层和独立品牌 SVG 挂点', () => {
  const html = read('index.html')
  assert.equal((html.match(/<video/g) || []).length, 2)
  assert.match(html, /data-brand-vector-hook/)
})

test('根页面保持透明并支持 reduced-motion', () => {
  const css = read('style.css')
  assert.match(css, /background:\s*transparent/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
})

test('正式脚本只监听共享合同定义的状态事件', () => {
  const app = read('app.js')
  const runtime = read('runtime.js')
  assert.match(app, /runtime\.SOCKET_EVENT/)
  assert.match(app, /runtime\.PREVIEW_MESSAGE/)
  assert.match(runtime, /intermission-next-state/)
  assert.match(runtime, /intermission-next-preview-state/)
})

test('正式与预览入口严格隔离各自的数据来源', () => {
  const app = read('app.js')
  const formalStart = app.indexOf("if (outputMode === 'formal')")
  const previewStart = app.indexOf("else if (outputMode === 'preview')", formalStart)
  const formalBootstrap = app.slice(formalStart, previewStart)
  const previewBootstrap = app.slice(previewStart)
  assert.match(formalBootstrap, /runtime\.SOCKET_EVENT/)
  assert.match(formalBootstrap, /requestOutputState\('initial'\)/)
  assert.doesNotMatch(formalBootstrap, /addEventListener\('message'/)
  assert.match(previewBootstrap, /event\.source === window\.parent/)
  assert.match(previewBootstrap, /event\.origin === parentOrigin/)
  assert.match(previewBootstrap, /new URLSearchParams\(window\.location\.search\)/)
  assert.doesNotMatch(previewBootstrap, /window\.location\.origin/)
})

test('正式载荷严格遵守版本而预览草稿允许同版本内容刷新', () => {
  const app = read('app.js')
  assert.match(app, /const strictRevisionAccepted = runtime\.shouldAcceptPayload/)
  assert.match(app, /outputMode === 'preview' && sameRevision && !strictRevisionAccepted/)
  assert.match(app, /if \(!strictRevisionAccepted && !previewDraftRefresh\) return/)
  assert.match(app, /if \(sameRevision && strictRevisionAccepted\) return/)
})

test('背景转场从正式矢量资源加载三段字标并按从右到左顺序组合', () => {
  const app = read('app.js')
  const html = read('index.html')
  assert.match(app, /data-event-mark-vector-hook/)
  assert.match(app, /data-event-brand-vector-hook/)
  assert.match(app, /counter-strike-2-wordmark\.svg/)
  assert.match(app, /\{ id: 'number-2', start: 0 \}/)
  assert.match(app, /\{ id: 'strike', start: 0\.12 \}/)
  assert.match(app, /\{ id: 'counter', start: 0\.24 \}/)
  assert.match(app, /function updateTransitionBrandAssembly/)
  assert.doesNotMatch(`${app}\n${html}`, /<path\b/)
})

test('背景交叉淡化和矢量标志组合严格使用同一服务端进度', () => {
  const app = read('app.js')
  const css = read('style.css')
  assert.match(app, /runtime\.backgroundTransitionProgressAt\(payload\.background, nowMs\)/)
  assert.match(app, /updateTransitionBrandAssembly\(progress\)/)
  assert.match(css, /#brand-layer\[data-mode='background-switch'\]/)
  assert.match(css, /\[data-transition-brand-part\]/)
})

test('静态输出按合同执行地图回退且不在待机页推断地图', () => {
  const app = read('app.js')
  assert.match(app, /runtime\.nextMapMediaSource/)
  assert.match(app, /image\.src = fallbackSource/)
  assert.match(app, /visual\.classList\.add\('is-text-only'\)/)
  const standbyStart = app.indexOf('function renderStandby')
  const standbyEnd = app.indexOf('function renderPage', standbyStart)
  const standbyRenderer = app.slice(standbyStart, standbyEnd)
  assert.doesNotMatch(standbyRenderer, /findMapMediaFrame|createMapMediaVisual/)
})

test('每个地图展示位最多创建 current 与 preload 两张图片', () => {
  const app = read('app.js')
  const visualStart = app.indexOf('function createMapMediaVisual')
  const visualEnd = app.indexOf('function createPlayerTable', visualStart)
  const visualRenderer = app.slice(visualStart, visualEnd)
  assert.equal((visualRenderer.match(/createMapMediaImage\(/g) || []).length, 2)
  assert.match(visualRenderer, /if \(frame\.preload\)/)
})

test('页面和背景不叠加固定 CSS 转场时长', () => {
  const css = read('style.css')
  const app = read('app.js')
  assert.doesNotMatch(css, /320ms|260ms|360ms/)
  assert.match(app, /runtime\.pageTransitionVisual/)
  assert.match(app, /runtime\.backgroundTransitionProgressAt/)
})

test('地图媒体逐帧使用绝对时间且每个整页截止时间只获取一次状态', () => {
  const app = read('app.js')
  assert.match(app, /runtime\.mapMediaOpacitiesAt\(frame, nowMs\)/)
  assert.match(app, /runtime\.dueMapMediaFrameEnds/)
  assert.match(app, /requestedMapMediaFrameEnds\.add\(frameEndAtMs\)/)
  assert.match(app, /window\.fetch\(outputStateUrl/)
  assert.doesNotMatch(app, /setInterval/)
  assert.match(app, /地图素材刷新失败，保留预载最终画面/)
})

test('背景槽位按 assetId 复用且页面 DOM 只服从稳定渲染签名', () => {
  const app = read('app.js')
  assert.match(app, /runtime\.planBackgroundVideoSlots/)
  assert.match(app, /if \(assignment\.shouldLoad\) setVideoAsset/)
  assert.match(app, /if \(assignment\.shouldSeek\)/)
  assert.match(app, /video\.dataset\.assetId === state\.transition\.toAssetId/)
  assert.match(app, /runtime\.pageRenderSignature/)
  assert.doesNotMatch(app, /renderedPayloadRevision|renderedPlayRevision/)
})

test('三类赛后页面只通过正式 page_enter 进度更新且选手行双侧稳定交错', () => {
  const app = read('app.js')
  const runtime = read('runtime.js')
  assert.match(app, /runtime\.internalEnterProgress/)
  assert.match(app, /markInterleavedRows\(teamATable, teamBTable, 'playerRows'\)/)
  assert.match(app, /'scoreTimeline'/)
  assert.match(runtime, /transitionFrame\?\.phase !== 'page_enter'/)
  assert.match(runtime, /transitionFrame\?\.phase === 'hold'/)
  assert.match(app, /timeline-score is-final/)
})

test('组件独立缩放时保持队名、比分、表格和地图边界', () => {
  const css = read('style.css')
  const app = read('app.js')
  assert.match(css, /\.broadcast-component[\s\S]*container-type:\s*size/)
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*minmax\(0,\s*1fr\)/)
  assert.match(css, /\.team-name[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(css, /\.stat-table[\s\S]*table-layout:\s*fixed/)
  assert.match(css, /\.map-media-image[\s\S]*object-fit:\s*cover/)
  assert.match(css, /@container\s*\(max-width:\s*1100px\)/)
  assert.match(app, /const columnGroup = element\('colgroup'\)/)
  assert.match(
    app,
    /const metricColumnWidth = \(100 - nameColumnWidth\) \/ \(columns\.length - 1\)/
  )
})

test('新版输出内置固定四页道具回放且不读取旧赛间接口', () => {
  const app = read('app.js')
  const runtime = read('runtime.js')
  const css = read('style.css')
  assert.match(app, /function renderUtilityReplay/)
  assert.match(app, /function updateUtilityReplay/)
  assert.match(app, /PAGE \$\{pageIndex \+ 1\} \/ 4/)
  assert.match(app, /UTILITY_REPLAY_PAGE_DURATION_MS = 30_000/)
  assert.match(runtime, /utilityReplay/)
  assert.match(runtime, /activeSegment/)
  assert.match(css, /\.utility-replay-page/)
  assert.doesNotMatch(app, /\/api\/intermission(?:['"`])/)
  assert.doesNotMatch(app, /intermission-state/)
})

test('BP 作为统一播出页面内的固定渲染层，不再使用独立页面或 iframe', () => {
  const entries = ['index.html', 'preview.html'].map(read)
  const app = read('app.js')
  const bpApp = readBPAsset('app.js')

  for (const html of entries) {
    assert.match(html, /\/bp\/style\.css/)
    assert.match(html, /\/bp\/app\.js/)
  }
  assert.match(app, /window\.MYTVHUDBPRenderer/)
  assert.match(app, /bpRenderer\.mount/)
  assert.doesNotMatch(app, /createElement\(['"]iframe['"]\)|\/bp\?preview/)
  assert.match(bpApp, /window\.MYTVHUDBPRenderer\s*=\s*Object\.freeze/)
  assert.doesNotMatch(bpApp, /\bio\(|\/api\/bp|bp-state/)
})

test('BP 卡片与收尾动画使用放慢后的固定时长', () => {
  const bpApp = readBPAsset('app.js')
  assert.match(bpApp, /const CARD_INTERVAL = 850/)
  assert.match(bpApp, /const CARD_ANIMATION_DURATION = 1200/)
  assert.match(bpApp, /const SERIES_FINALE_HOLD = 1300/)
  assert.match(bpApp, /const SERIES_FINALE_DURATION = 1500/)
  assert.match(bpApp, /const SERIES_EXIT_DURATION = 700/)
})
