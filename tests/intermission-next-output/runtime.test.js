/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const runtime = require(path.resolve(__dirname, '../../src/main/intermission-next/file/runtime.js'))

const timings = {
  brandCoverMs: 400,
  backgroundRevealMs: 300,
  pageEnterMs: 500,
  pageExitMs: 250,
  brandExitMs: 350
}

const transition = {
  version: 1,
  pageId: 'map_break',
  playRevision: 7,
  startedAtMs: 1000,
  exitStartedAtMs: null
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function mapFrame(overrides = {}) {
  return {
    mapId: 'de_ancient',
    purpose: 'hero',
    mediaRevision: 2,
    current: {
      url: '/intermission-next/assets/maps/de_ancient/display/de_ancient_1_png.png',
      fallbackUrl: '/intermission-next/assets/maps/de_ancient/fallback.png',
      width: 1920,
      height: 1080
    },
    preload: {
      url: '/intermission-next/assets/maps/de_ancient/display/de_ancient_2_png.png',
      fallbackUrl: '/intermission-next/assets/maps/de_ancient/fallback.png',
      width: 1920,
      height: 1080
    },
    crossfadeProgress: 0,
    frameStartedAtMs: 5000,
    frameEndAtMs: 7000,
    crossfadeStartedAtMs: 6000,
    crossfadeDurationMs: 1000,
    ...overrides
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function outputPayload(overrides = {}) {
  return {
    version: 1,
    payloadRevision: 4,
    playRevision: 2,
    serverNowMs: 5500,
    visible: true,
    pageData: {
      page: 'map_break',
      sourceMapId: 'de_ancient',
      nextMap: null
    },
    layout: {
      pages: {
        map_break: { components: { mapReport: { x: 0, y: 0 } } },
        series_end: { components: {} },
        standby: { components: {} }
      }
    },
    background: {
      revision: 1,
      switchRevision: 1,
      activeAssetId: 'background-a',
      preloadAssetId: null
    },
    backgroundAssets: [],
    transition,
    transitionTimings: timings,
    mapMedia: [mapFrame()],
    clock: {
      status: 'playing',
      totalDurationMs: 10000,
      deadlineAtMs: 15000,
      pausedRemainingMs: null
    },
    issues: [],
    ...overrides
  }
}

test('使用精确的 Socket 与预览消息标识', () => {
  assert.equal(runtime.SOCKET_EVENT, 'intermission-next-state')
  assert.equal(runtime.PREVIEW_MESSAGE, 'intermission-next-preview-state')
})

test('按共享转场时长恢复入场阶段', () => {
  assert.deepEqual(runtime.transitionFrameAt(transition, timings, 1100), {
    phase: 'brand_cover',
    progress: 0.25,
    pageId: 'map_break'
  })
  assert.deepEqual(runtime.transitionFrameAt(transition, timings, 1500), {
    phase: 'background_reveal',
    progress: 1 / 3,
    pageId: 'map_break'
  })
  assert.deepEqual(runtime.transitionFrameAt(transition, timings, 1900), {
    phase: 'page_enter',
    progress: 0.4,
    pageId: 'map_break'
  })
  assert.deepEqual(runtime.transitionFrameAt(transition, timings, 2200), {
    phase: 'hold',
    progress: 1,
    pageId: 'map_break'
  })
})

test('按传入的退出时间恢复退出阶段', () => {
  const exiting = { ...transition, exitStartedAtMs: 5000 }
  assert.deepEqual(runtime.transitionFrameAt(exiting, timings, 5100), {
    phase: 'page_exit',
    progress: 0.4,
    pageId: 'map_break'
  })
  assert.deepEqual(runtime.transitionFrameAt(exiting, timings, 5350), {
    phase: 'brand_exit',
    progress: 100 / 350,
    pageId: 'map_break'
  })
  assert.deepEqual(runtime.transitionFrameAt(exiting, timings, 5600), {
    phase: 'hidden',
    progress: 1,
    pageId: null
  })
})

test('非法转场输入不自行补造时长', () => {
  assert.deepEqual(runtime.transitionFrameAt(transition, { ...timings, pageEnterMs: -1 }, 2200), {
    phase: 'hidden',
    progress: 1,
    pageId: null
  })
})

test('倒计时覆盖 ready、playing、paused、finished 状态', () => {
  assert.equal(
    runtime.playbackClockRemainingMs(
      {
        status: 'ready',
        totalDurationMs: 600000,
        deadlineAtMs: null,
        pausedRemainingMs: null
      },
      1000
    ),
    600000
  )
  assert.equal(
    runtime.playbackClockRemainingMs(
      {
        status: 'playing',
        totalDurationMs: 600000,
        deadlineAtMs: 5000,
        pausedRemainingMs: null
      },
      1200
    ),
    3800
  )
  assert.equal(
    runtime.playbackClockRemainingMs(
      {
        status: 'paused',
        totalDurationMs: 600000,
        deadlineAtMs: null,
        pausedRemainingMs: 4800
      },
      1200
    ),
    4800
  )
  assert.equal(
    runtime.playbackClockRemainingMs(
      {
        status: 'finished',
        totalDurationMs: 600000,
        deadlineAtMs: null,
        pausedRemainingMs: null
      },
      1200
    ),
    0
  )
  assert.equal(runtime.formatDuration(61001), '01:02')
})

test('BP 附加组件在动画前只显示全阶段内容，动画后按 BP 时间轴显示', () => {
  const fullStageWindow = [{ startOffsetMs: 0, endOffsetMs: null }]
  const animationWindow = [{ startOffsetMs: 2_000, endOffsetMs: 5_000 }]
  const finiteOpeningWindow = [{ startOffsetMs: 0, endOffsetMs: 5_000 }]

  assert.equal(runtime.bpComponentWindowActive(fullStageWindow, 0, false), true)
  assert.equal(runtime.bpComponentWindowActive(animationWindow, 0, false), false)
  assert.equal(runtime.bpComponentWindowActive(finiteOpeningWindow, 0, false), false)
  assert.equal(runtime.bpComponentWindowActive(animationWindow, 2_500, true), true)
  assert.equal(runtime.bpComponentWindowActive(animationWindow, 5_000, true), false)
  assert.equal(runtime.bpComponentWindowActive(fullStageWindow, 12_000, true), true)
})

test('背景播放位置与双视频切换进度由传入状态计算', () => {
  const background = {
    version: 1,
    playbackStatus: 'playing',
    positionMs: 1500,
    startedAtMs: 1000,
    transition: {
      fromAssetId: 'background-a',
      toAssetId: 'background-b',
      startedAtMs: 2000,
      durationMs: 800
    }
  }
  assert.equal(runtime.backgroundPositionAt(background, 1750), 2250)
  assert.equal(runtime.backgroundTransitionProgressAt(background, 2200), 0.25)
})

test('地图媒体只按精确 mapId 与 purpose 选择', () => {
  const hero = {
    mapId: 'de_ancient',
    purpose: 'hero',
    mediaRevision: 2,
    current: {
      url: '/intermission-next/assets/maps/de_ancient/display/de_ancient_1_png.png',
      fallbackUrl: '/intermission-next/assets/maps/de_ancient/fallback.png',
      width: 1920,
      height: 1080
    },
    preload: {
      url: '/intermission-next/assets/maps/de_ancient/display/de_ancient_2_png.png',
      fallbackUrl: '/intermission-next/assets/maps/de_ancient/fallback.png',
      width: 1920,
      height: 1080
    },
    crossfadeProgress: 0.4,
    frameStartedAtMs: 1000,
    frameEndAtMs: 2000,
    crossfadeStartedAtMs: 1600,
    crossfadeDurationMs: 400
  }
  const sequence = { ...hero, purpose: 'sequence' }
  assert.equal(runtime.findMapMediaFrame([hero, sequence], 'de_ancient', 'hero'), hero)
  assert.equal(runtime.findMapMediaFrame([hero, sequence], 'de_ancient', 'sequence'), sequence)
  assert.equal(runtime.findMapMediaFrame([hero], 'de_anubis', 'hero'), null)
})

test('地图媒体交叉淡化由绝对时间持续计算并在帧截止时稳定到预载画面', () => {
  const frame = mapFrame()
  assert.deepEqual(runtime.mapMediaOpacitiesAt(frame, 6500), {
    current: 0.5,
    preload: 0.5
  })
  assert.deepEqual(runtime.mapMediaOpacitiesAt(frame, 7000), {
    current: 0,
    preload: 1
  })
})

test('整页对同一个地图媒体绝对截止时间只请求一次', () => {
  const requested = new Set()
  const frames = [
    mapFrame({ mapId: 'de_ancient', frameEndAtMs: 7000 }),
    mapFrame({ mapId: 'de_anubis', frameEndAtMs: 7000 }),
    mapFrame({ mapId: 'de_dust2', frameEndAtMs: 8000 })
  ]
  assert.deepEqual(runtime.dueMapMediaFrameEnds(frames, requested, 7000), [7000])
  requested.add(7000)
  assert.deepEqual(runtime.dueMapMediaFrameEnds(frames, requested, 7000), [])
  assert.deepEqual(runtime.dueMapMediaFrameEnds(frames, requested, 8000), [8000])
})

test('背景 B 完成淡入后保留在原槽位且不重新加载或重置进度', () => {
  const plan = runtime.planBackgroundVideoSlots(['background-a', 'background-b'], {
    activeAssetId: 'background-b',
    preloadAssetId: null
  })
  assert.deepEqual(plan, [
    {
      assetId: null,
      role: 'idle',
      shouldLoad: true,
      shouldSeek: false
    },
    {
      assetId: 'background-b',
      role: 'active',
      shouldLoad: false,
      shouldSeek: false
    }
  ])
})

test('页面渲染签名忽略时钟背景转场和媒体时间但响应相关媒体文件变化', () => {
  const original = outputPayload()
  const runtimeOnly = outputPayload({
    payloadRevision: 5,
    serverNowMs: 9000,
    background: {
      revision: 8,
      switchRevision: 3,
      activeAssetId: 'background-b',
      preloadAssetId: null
    },
    transition: { ...transition, startedAtMs: 8000 },
    clock: {
      status: 'paused',
      totalDurationMs: 10000,
      deadlineAtMs: null,
      pausedRemainingMs: 3200
    },
    mapMedia: [
      mapFrame({
        crossfadeProgress: 1,
        frameStartedAtMs: 8000,
        frameEndAtMs: 10000,
        crossfadeStartedAtMs: 9000
      })
    ]
  })
  assert.equal(runtime.pageRenderSignature(original), runtime.pageRenderSignature(runtimeOnly))

  const changedMedia = outputPayload({
    mapMedia: [
      mapFrame({
        current: {
          ...mapFrame().current,
          url: '/intermission-next/assets/maps/de_ancient/display/de_ancient_3_png.png'
        }
      })
    ]
  })
  assert.notEqual(runtime.pageRenderSignature(original), runtime.pageRenderSignature(changedMedia))
})

test('API 与 Socket 竞态只允许更高版本覆盖且相同版本仅幂等接受相同内容', () => {
  const current = outputPayload({ payloadRevision: 7 })
  assert.equal(runtime.shouldAcceptPayload(current, outputPayload({ payloadRevision: 6 })), false)
  assert.equal(runtime.shouldAcceptPayload(current, outputPayload({ payloadRevision: 8 })), true)
  assert.equal(runtime.shouldAcceptPayload(current, { ...current }), true)
  assert.equal(
    runtime.shouldAcceptPayload(current, {
      ...current,
      visible: false
    }),
    false
  )
})

test('页内阶段只服从正式 page_enter 进度并在保持与减少动态时稳定显示', () => {
  const early = runtime.internalEnterProgress(
    'map_break',
    'teams',
    0,
    1,
    { phase: 'page_enter', progress: 0.1 },
    false
  )
  const late = runtime.internalEnterProgress(
    'map_break',
    'teams',
    0,
    1,
    { phase: 'page_enter', progress: 0.4 },
    false
  )
  assert.equal(early, 0)
  assert.ok(late > 0)
  assert.equal(
    runtime.internalEnterProgress(
      'series_end',
      'history',
      0,
      1,
      { phase: 'hold', progress: 1 },
      false
    ),
    1
  )
  assert.equal(
    runtime.internalEnterProgress(
      'standby',
      'timing',
      0,
      1,
      { phase: 'page_enter', progress: 0 },
      true
    ),
    1
  )
  assert.equal(
    runtime.internalEnterProgress(
      'map_break',
      'playerRows',
      0,
      1,
      { phase: 'page_exit', progress: 0.5 },
      false
    ),
    1
  )
})

test('地图媒体仅保留 current 与 preload 的交叉淡化进度', () => {
  assert.deepEqual(
    runtime.mapMediaOpacities({
      current: {},
      preload: {},
      crossfadeProgress: 0.35
    }),
    { current: 0.65, preload: 0.35 }
  )
  assert.deepEqual(
    runtime.mapMediaOpacities({
      current: {},
      preload: null,
      crossfadeProgress: 0.8
    }),
    { current: 1, preload: 0 }
  )
})

test('地图主素材失败后只尝试合同中的 fallbackUrl', () => {
  const file = {
    url: '/intermission-next/assets/maps/de_ancient/display/de_ancient_1_png.png',
    fallbackUrl: '/intermission-next/assets/maps/de_ancient/fallback.png',
    width: 1920,
    height: 1080
  }
  assert.equal(runtime.nextMapMediaSource(file, file.url), file.fallbackUrl)
  assert.equal(runtime.nextMapMediaSource(file, file.fallbackUrl), null)
  assert.equal(runtime.nextMapMediaSource(file, '/other/path.png'), null)
})

test('普通状态刷新不替换入场转场起点', () => {
  const current = {
    version: 1,
    pageId: 'map_break',
    playRevision: 7,
    startedAtMs: 1000,
    exitStartedAtMs: null
  }
  const refreshed = {
    ...current,
    startedAtMs: 9000
  }
  assert.equal(runtime.transitionStateForPayload(7, current, 7, refreshed), current)
  assert.equal(runtime.transitionStateForPayload(7, current, 8, refreshed), refreshed)
  assert.deepEqual(
    runtime.transitionStateForPayload(7, current, 7, {
      ...refreshed,
      exitStartedAtMs: 9500
    }),
    {
      ...current,
      exitStartedAtMs: 9500
    }
  )
})

test('页面视觉直接服从 frame progress 且 reduced-motion 落到稳定状态', () => {
  assert.deepEqual(
    runtime.pageTransitionVisual({ phase: 'page_enter', progress: 0.25 }, false, false),
    {
      opacity: 0.25,
      translateY: 13.5,
      blur: 3.75
    }
  )
  assert.deepEqual(
    runtime.pageTransitionVisual({ phase: 'page_exit', progress: 0.5 }, false, false),
    {
      opacity: 0.5,
      translateY: -7,
      blur: 2
    }
  )
  assert.deepEqual(
    runtime.pageTransitionVisual({ phase: 'brand_cover', progress: 0.1 }, true, false),
    {
      opacity: 1,
      translateY: 0,
      blur: 0
    }
  )
})

test('只接受五类精确页面载荷结构', () => {
  const base = {
    version: 1,
    payloadRevision: 1,
    playRevision: 1,
    serverNowMs: 1000,
    director: {},
    visible: true,
    pageData: { page: 'standby' },
    layout: {},
    background: {},
    backgroundAssets: [],
    transition: {},
    transitionTimings: {},
    mapMedia: [],
    activeSegment: null,
    utilityReplay: null,
    clock: {},
    issues: []
  }
  for (const page of ['warmup', 'bp', 'map_break', 'series_end', 'standby']) {
    assert.equal(runtime.isOutputPayload({ ...base, pageData: { page } }), true)
  }
  assert.equal(runtime.isOutputPayload({ ...base, pageData: { page: 'other' } }), false)
  assert.equal(runtime.isOutputPayload({ ...base, backgroundAssets: null }), false)
  assert.equal(runtime.isOutputPayload({ ...base, mapMedia: null }), false)
})
