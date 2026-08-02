/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const outputDirectory = path.resolve(__dirname, '../../src/main/intermission-next/file')
const bpAssetDirectory = path.resolve(__dirname, '../../src/main/bp/file')
const rendererPageDirectory = path.resolve(__dirname, '../../src/renderer/src/pages')
const rendererIndexPath = path.resolve(__dirname, '../../src/renderer/index.html')
const rendererI18nPath = path.resolve(__dirname, '../../src/renderer/src/i18n/index.ts')
const broadcastFlowPath = path.resolve(__dirname, '../../src/main/intermission/broadcast-flow.ts')
const packagePath = path.resolve(__dirname, '../../package.json')
const electronBuilderPath = path.resolve(__dirname, '../../electron-builder.yml')

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function read(fileName) {
  return fs.readFileSync(path.join(outputDirectory, fileName), 'utf8')
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function readBPAsset(fileName) {
  return fs.readFileSync(path.join(bpAssetDirectory, fileName), 'utf8')
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function readRendererPage(fileName) {
  return fs.readFileSync(path.join(rendererPageDirectory, fileName), 'utf8')
}

test('管理端 CSP 放行本地 GSI HTTP 与 Socket 连接', () => {
  const html = fs.readFileSync(rendererIndexPath, 'utf8')
  assert.match(
    html,
    /connect-src 'self' http:\/\/localhost:5031 http:\/\/127\.0\.0\.1:5031 ws:\/\/localhost:5031 ws:\/\/127\.0\.0\.1:5031/
  )
})

test('阶段跳转到地图间页面时按冻结数据重新校验并保留道具回放', () => {
  const source = fs.readFileSync(broadcastFlowPath, 'utf8')
  const start = source.indexOf('export async function prepareBroadcastMapReport')
  const end = source.indexOf('export async function updatePreparedProgramScoreOverride', start)
  const prepareMapReport = source.slice(start, end)
  assert.match(prepareMapReport, /getMapUtilityReplay\(sourceProgram\.sourceMatchId, mapId\)/)
  assert.match(prepareMapReport, /createUnscheduledSegments\('map_break', false\)/)
  assert.doesNotMatch(prepareMapReport, /contentType === 'map_report'/)
})

test('正式入口与管理端预览入口严格隔离', () => {
  const formal = read('index.html')
  const preview = read('preview.html')
  assert.match(formal, /data-output-mode="formal"/)
  assert.match(preview, /data-output-mode="preview"/)
  assert.equal(formal.includes('demo-data.js'), false)
  assert.equal(preview.includes('demo-data.js'), false)
  assert.equal(preview.includes('socket.io'), false)
})

test('正式与预览入口从无尾斜杠地址加载统一输出资源', () => {
  for (const html of [read('index.html'), read('preview.html')]) {
    assert.match(html, /href="\/intermission-next\/style\.css"/)
    assert.match(html, /src="\/intermission-next\/runtime\.js"/)
    assert.match(html, /src="\/intermission-next\/app\.js"/)
    assert.doesNotMatch(html, /(?:href|src)="\.\/(?:style\.css|runtime\.js|app\.js)"/)
  }
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

test('页面组件不绘制黑色底板并叠加于全局背景视频之上', () => {
  const css = read('style.css')
  const panelRule = css.slice(css.indexOf('.panel {'), css.indexOf('.map-media-visual,'))
  assert.match(panelRule, /background:\s*transparent/)
  assert.match(panelRule, /box-shadow:\s*none/)
  assert.doesNotMatch(panelRule, /linear-gradient|rgba\(\s*0\s*,\s*0\s*,\s*0/)
  assert.match(css, /\.utility-replay-page[\s\S]*?background:\s*transparent/)
})

test('页面赛事标志由 MYTV 字标和小鸡矢量标志组成', () => {
  const app = read('app.js')
  const css = read('style.css')
  assert.match(app, /mytvhud-chicken-mark\.svg/)
  assert.match(app, /event-mark-wordmark', 'MYTV'/)
  assert.match(app, /event-mark-wordmark-slot/)
  assert.match(app, /data-event-mark-part/)
  assert.match(css, /\.event-mark-wordmark-slot[\s\S]*?transform:\s*translateY\(14\.2%\)/)
})

test('播出组件移除未经要求的英文功能眉题并保留赛事通用标识', () => {
  const app = read('app.js')
  for (const text of [
    'MAP RESULT',
    'NEXT MAP',
    'SERIES WINNER',
    'FINAL RESULT',
    'SERIES STATISTICS',
    'PREVIOUS SERIES',
    'BROADCAST STANDBY',
    'FIRST 30 SECONDS',
    'NEXT MAP IN',
    'ROUND OPENING'
  ]) {
    assert.equal(app.includes(`'${text}'`), false)
  }
  assert.match(app, /createEventBrand\('BAN & PICK'\)/)
})

test('播出组件不再绘制无语义的外沿装饰线', () => {
  const css = read('style.css')
  assert.doesNotMatch(css, /\.panel-accent::before/)
  assert.doesNotMatch(css, /\.series-stats-comparison::after/)
  assert.doesNotMatch(css, /\.map-result-row\.is-won-by-team-[ab]/)
  for (const selector of ['.event-brand {', '.standby-prompt {', '.map-report-meta {']) {
    const start = css.indexOf(selector)
    const end = css.indexOf('\n}', start)
    assert.notEqual(start, -1)
    assert.doesNotMatch(css.slice(start, end), /border-(?:top|left):/)
  }
})

test('菜单教程使用现有品牌色且不为每条说明添加勾号', () => {
  const menu = readRendererPage('menu.vue')
  assert.doesNotMatch(menu, /CircleCheck/)
  assert.doesNotMatch(menu, /#38bdf8|#7dd3fc|#bae6fd/i)
  assert.match(menu, /color-mix\(in srgb, var\(--primary\) 74%, white\)/)
})

test('本图数据板将双方选手表格上下排列', () => {
  const css = read('style.css')
  const statsRule = css.slice(
    css.indexOf('.dual-player-stats {'),
    css.indexOf('.team-table-title {')
  )
  assert.match(statsRule, /grid-template-rows:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(statsRule, /border-top:/)
  assert.doesNotMatch(statsRule, /border-left:/)
})

test('道具回放删除开发验证计数并使用真实彩色道具图标', () => {
  const app = read('app.js')
  const css = read('style.css')

  assert.doesNotMatch(app, /叠加 .* 个正式回合|utility-round-count/)
  assert.match(app, /function createUtilityLegendIcon/)
  assert.match(app, /\['smoke', 'smoke', '烟雾'\]/)
  assert.match(app, /\['flash', 'flashbang', '闪光'\]/)
  assert.match(app, /\['fire', 'firebomb', '燃烧'\]/)
  assert.match(app, /createUtilityLegendIcon\(projectileType\)/)
  assert.match(css, /\.utility-legend-icon/)
  assert.doesNotMatch(css, /\.utility-legend-item i/)
})

test('比赛保存提示指向统一播出控制流程', () => {
  const matchPage = readRendererPage('matchs.vue')
  const i18n = fs.readFileSync(rendererI18nPath, 'utf8')

  assert.match(matchPage, /toast\.success\('比赛与 BP 已保存'/)
  assert.match(i18n, /结果已同步到播出控制/)
  assert.match(i18n, /进入 BP 展示阶段后由导播开始播放动画/)
  assert.doesNotMatch(i18n, /请前往播出控制，在 BP 阶段播放动画/)
})

test('安装包版本与发布者由当前项目元数据实时生成', () => {
  const packageMetadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  const builder = fs.readFileSync(electronBuilderPath, 'utf8')

  assert.match(packageMetadata.version, /^\d+\.\d+\.\d+$/)
  assert.equal(packageMetadata.author, 'Github itsR0L1')
  assert.equal(packageMetadata.homepage, 'https://github.com/itsR0LL/MYTVHUD')
  assert.match(builder, /artifactName: \$\{name\}-\$\{version\}-setup\.\$\{ext\}/)
  assert.match(builder, /uninstallDisplayName: MYTVHUD Manager \$\{version\}/)
  assert.doesNotMatch(builder, /^buildNumber:/m)
})

test('本图数据板只保留双方选手数据并删除真实比分时间线', () => {
  const app = read('app.js')
  const css = read('style.css')
  const reportRule = css.slice(css.indexOf('.report-grid {'), css.indexOf('.player-stats-box {'))

  assert.match(app, /grid\.appendChild\(statsBox\)/)
  assert.doesNotMatch(app, /createTimeline|真实比分时间线|scoreTimeline'/)
  assert.doesNotMatch(css, /\.timeline-box|\.timeline-track|\.timeline-point/)
  assert.match(reportRule, /grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.match(reportRule, /grid-template-rows:\s*minmax\(0, 1fr\)/)
})

test('选手数据最后一项使用爆头率而不是得分', () => {
  const app = read('app.js')
  const tableRenderer = app.slice(
    app.indexOf('function createPlayerTable'),
    app.indexOf('function mapStateText')
  )
  assert.match(tableRenderer, /\['爆头率', 'headshotRate'\]/)
  assert.match(tableRenderer, /`\$\{statValue\(player\[key\]\)\}%`/)
  assert.doesNotMatch(tableRenderer, /\['得分', 'score'\]/)
})

test('双方选手表格使用相同字段顺序且战队名称均左对齐', () => {
  const app = read('app.js')
  const css = read('style.css')
  const tableRenderer = app.slice(
    app.indexOf('function createPlayerTable'),
    app.indexOf('function mapStateText')
  )

  assert.doesNotMatch(tableRenderer, /side === 'b'/)
  assert.doesNotMatch(css, /\.team-table-title\.is-team-b\s*\{[\s\S]*?row-reverse/)
  assert.doesNotMatch(css, /\.series-team-table\.is-team-b \.stat-table/)
})

test('本图完整数据板不加载地图背景并使用高对比文字', () => {
  const app = read('app.js')
  const css = read('style.css')
  const reportRenderer = app.slice(
    app.indexOf('function createMapReport'),
    app.indexOf('function compactCard')
  )
  const reportStyles = css.slice(css.indexOf('.map-report {'), css.indexOf('.map-strip {'))

  assert.doesNotMatch(reportRenderer, /createMapMediaVisual|has-map-media|map-report-media/)
  assert.match(reportStyles, /color:\s*#f8fbff/)
  assert.match(reportStyles, /color:\s*#d7e2ee/)
  assert.match(reportStyles, /color:\s*#f0f6fc/)
})

test('全部可编辑组件内容使用组件容器尺寸响应拉伸', () => {
  const css = read('style.css')
  const editableRules = css.slice(
    css.indexOf('.broadcast-component {'),
    css.indexOf('.utility-replay-page {')
  )
  const rendererFamilies = [
    '.map-report',
    '.map-strip',
    '.compact-card',
    '.event-mark',
    '.event-brand',
    '.warmup-teams-panel',
    '.warmup-status-panel',
    '.winner-panel',
    '.final-series-score',
    '.list-panel',
    '.series-stats',
    '.status-line',
    '.previous-result',
    '.next-teams',
    '.large-countdown',
    '.standby-prompt'
  ]

  assert.match(editableRules, /container-type:\s*size/)
  assert.match(editableRules, /--fluid-space-md:/)
  assert.match(editableRules, /--type-title:\s*clamp\([^;]*calc\([^;]*cqw[^;]*cqh/)
  assert.match(
    editableRules,
    /\.event-mark-wordmark[\s\S]*?font-size:\s*clamp\([^;]*calc\([^;]*cqw[^;]*cqh/
  )
  assert.match(editableRules, /\.event-mark-icon[\s\S]*?height:\s*82%/)
  assert.doesNotMatch(editableRules, /height:\s*min\(82%,\s*110px\)/)
  assert.match(
    editableRules,
    /\.compact-card-value[\s\S]*?font-size:\s*clamp\([^;]*calc\([^;]*cqw[^;]*cqh/
  )
  assert.match(
    editableRules,
    /\.warmup-teams-panel \.team-avatar[\s\S]*?width:\s*clamp\([^;]*calc\([^;]*cqw[^;]*cqh/
  )
  assert.match(
    editableRules,
    /\.final-series-team-score[\s\S]*?font-size:\s*clamp\([^;]*calc\([^;]*cqw[^;]*cqh/
  )
  assert.match(
    editableRules,
    /\.next-teams \.team-avatar[\s\S]*?width:\s*clamp\([^;]*calc\([^;]*cqw[^;]*cqh/
  )
  assert.doesNotMatch(
    editableRules,
    /font-size:\s*max\([^;]*min\([^;]*(?:cqw[^;]*cqh|cqh[^;]*cqw)[^;]*\)[^;]*\)/
  )
  for (const selector of rendererFamilies)
    assert.match(editableRules, new RegExp(selector.replace('.', '\\.')))
})

test('地图序列内容继承组件宽度并保持中心线对称', () => {
  const css = read('style.css')
  const mapStripRule = css.slice(css.indexOf('.map-strip {'), css.indexOf('.map-strip-card {'))
  assert.match(mapStripRule, /width:\s*100%/)
  assert.match(mapStripRule, /display:\s*flex/)
})

test('赛事待机上一场结果使用等宽三列并放大响应式文字', () => {
  const css = read('style.css')
  const resultStyles = css.slice(
    css.indexOf('.previous-result .section-kicker {'),
    css.indexOf('.next-teams {')
  )

  assert.match(resultStyles, /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/)
  assert.match(resultStyles, /\.team-name:first-child[\s\S]*?text-align:\s*right/)
  assert.match(resultStyles, /\.team-name:last-child[\s\S]*?text-align:\s*left/)
  assert.match(
    resultStyles,
    /\.team-name[\s\S]*?font-size:\s*clamp\(20px, calc\(1cqw \+ 10cqh\), 46px\)/
  )
  assert.match(
    resultStyles,
    /\.score[\s\S]*?font-size:\s*clamp\(42px, calc\(2cqw \+ 24cqh\), 96px\)/
  )
})

test('系列赛结束组件使用明确比分归属与镜像选手数据板', () => {
  const app = read('app.js')
  const css = read('style.css')
  const seriesRenderer = app.slice(
    app.indexOf('function createFinalSeriesScore'),
    app.indexOf('function nextMatchLabel')
  )
  const seriesStyles = css.slice(
    css.indexOf('.final-series-score {'),
    css.indexOf('.status-line {')
  )

  assert.match(seriesRenderer, /final-series-team is-team-a/)
  assert.match(seriesRenderer, /final-series-team is-team-b/)
  assert.match(seriesRenderer, /series-stats-heading/)
  assert.match(seriesRenderer, /series-stats-comparison/)
  assert.match(seriesRenderer, /createPlayerTable\([\s\S]*?true,[\s\S]*?'a'/)
  assert.match(seriesRenderer, /createPlayerTable\([\s\S]*?true,[\s\S]*?'b'/)
  assert.doesNotMatch(seriesRenderer, /\['MVP', 'mvps'\]/)
  assert.match(seriesStyles, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
  assert.doesNotMatch(seriesStyles, /\.series-stats-comparison::after/)
  assert.match(seriesStyles, /\.final-series-team\.is-team-a[\s\S]*?justify-content:\s*flex-end/)
  assert.match(seriesStyles, /\.final-series-team\.is-team-b[\s\S]*?justify-content:\s*flex-start/)
})

test('地图序列按BLAST信息层级展示战队端点、动态地图图像和单图比分', () => {
  const app = read('app.js')
  const css = read('style.css')

  assert.match(app, /createMapStripTeam\(data\.teamA, 'a'\)/)
  assert.match(app, /createMapStripTeam\(data\.teamB, 'b'\)/)
  assert.match(app, /findMapMediaFrame\(payload\.mapMedia, map\.mapId, 'sequence'\)/)
  assert.match(app, /'map-strip-score score'/)
  assert.match(css, /\.map-strip-team\.has-team-avatar \.map-strip-team-name/)
  assert.match(css, /\.map-strip-card\.is-won-by-team-a::after/)
  assert.match(css, /\.map-strip-card\.is-won-by-team-b::after/)
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
  assert.match(app, /data-transition-brand-logo/)
  assert.match(app, /brandLayer\.querySelector\('\[data-brand-vector-hook\]'\)/)
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
  assert.match(app, /visual\.classList\.toggle\('is-text-only'/)
  const css = read('style.css')
  assert.match(css, /\.map-media-fallback-text\s*\{[\s\S]*?display:\s*none/)
  assert.match(
    css,
    /\.map-media-visual\.is-text-only \.map-media-fallback-text\s*\{[\s\S]*?display:\s*block/
  )
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
  assert.match(visualRenderer, /createMapMediaImage\(frame\.preload, 'preload', visual\)/)
})

test('地图轮播复用双图片槽位并等待预载完成后交叉淡化', () => {
  const app = read('app.js')
  const runtime = read('runtime.js')
  assert.match(app, /function syncMapMediaVisualFiles/)
  assert.match(app, /image\.dataset\.mapMediaReady === 'true'/)
  assert.match(app, /setMapMediaImageRole\(desiredCurrent, 'current'\)/)
  assert.match(app, /if \(currentReady && preloadReady\)/)
  assert.match(runtime, /function mapMediaSlot/)
  assert.doesNotMatch(runtime, /function mapMediaPair/)
})

test('系列赛地图历史不降低地图图片透明度', () => {
  const css = read('style.css')
  const historyStyles = css.slice(
    css.indexOf('.history-map-media .map-media-fallback-text'),
    css.indexOf('.series-stats {')
  )
  assert.doesNotMatch(css, /\.history-map-media\s*\{/)
  assert.doesNotMatch(historyStyles, /opacity:/)
})

test('页面和背景不叠加固定 CSS 转场时长', () => {
  const css = read('style.css')
  const app = read('app.js')
  assert.doesNotMatch(css, /320ms|260ms|360ms/)
  assert.match(app, /runtime\.pageTransitionVisual/)
  assert.match(app, /runtime\.backgroundTransitionProgressAt/)
})

test('正式输出只使用合成线程友好的位移与透明度动画', () => {
  const css = read('style.css')
  const app = read('app.js')
  assert.doesNotMatch(app, /\.style\.filter/)
  assert.doesNotMatch(app, /setStyle\([^\n]+, 'filter'/)
  assert.doesNotMatch(css, /#page-layer[^}]*filter:/s)
  assert.match(app, /for \(const visual of mapMediaVisuals\)/)
  assert.match(app, /for \(const output of enterAnimationOutputs\)/)
  assert.match(app, /CLOCK_UPDATE_INTERVAL_MS = 100/)
})

test('下一段背景仅预载并在转场开始后参与播放解码', () => {
  const app = read('app.js')
  assert.match(app, /const transitionTargetActive = state\.transition\?\.toAssetId/)
  assert.match(
    app,
    /assignment\.role === 'active' \|\| transitionTargetActive \? state\.playbackStatus : 'paused'/
  )
  assert.match(app, /transitionProgress >= 1 && !video\.paused/)
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
  assert.match(runtime, /transitionFrame\?\.phase !== 'page_enter'/)
  assert.match(runtime, /transitionFrame\?\.phase === 'hold'/)
  assert.doesNotMatch(app, /'scoreTimeline'|timeline-score is-final/)
})

test('组件独立缩放时保持队名、比分、表格和地图边界', () => {
  const css = read('style.css')
  const app = read('app.js')
  assert.match(css, /\.broadcast-component[\s\S]*container-type:\s*size/)
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*minmax\(0,\s*1fr\)/)
  assert.match(css, /\.team-name[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(css, /\.stat-table[\s\S]*table-layout:\s*fixed/)
  assert.match(css, /\.map-media-image[\s\S]*object-fit:\s*cover/)
  assert.match(css, /--fluid-space-md:\s*max\([^;]*cqw[^;]*cqh/)
  assert.doesNotMatch(css, /@container\s*\(max-width:\s*1100px\)/)
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
  assert.match(app, /第 \$\{pageIndex \+ 1\} \/ 4 页/)
  assert.match(app, /UTILITY_REPLAY_PAGE_DURATION_MS = 30_000/)
  assert.match(app, /utility-player-paths/)
  assert.match(app, /function createUtilityProjectile/)
  assert.match(app, /function createSmokeVisual/)
  assert.match(app, /function createFlashVisual/)
  assert.match(app, /function createFlameMarker/)
  assert.match(app, /runtime\.utilityTrajectoryPositionAt/)
  assert.match(app, /rotate\(-90\)/)
  assert.doesNotMatch(app, /position\.angleDeg/)
  assert.doesNotMatch(app, /utility-trajectory|svgElement\('polyline'/)
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
  assert.match(bpApp, /if \(!state\.playbackStarted\) return/)
})
