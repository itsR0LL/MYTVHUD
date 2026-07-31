import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GLOBAL_BACKGROUND_SWITCH_DURATION_MS,
  beginGlobalBackgroundSwitch,
  completeGlobalBackgroundSwitch,
  createDefaultGlobalBackgroundState,
  globalBackgroundPositionAt,
  initializeGlobalBackgroundSequence,
  nextGlobalBackgroundAssetId,
  normalizeGlobalBackgroundState,
  pauseGlobalBackground,
  playGlobalBackground,
  preloadGlobalBackground,
  selectInitialGlobalBackground,
  setGlobalBackgroundVisibility
} from '../../src/shared/intermission-background-next/background-state'
import {
  normalizeGlobalBackgroundAsset,
  normalizeGlobalBackgroundAssets
} from '../../src/shared/intermission-background-next/assets'

const ASSET_IDS = ['background-1', 'background-2', 'background-3']

test('隐藏输出不会重置背景播放位置', () => {
  let state = selectInitialGlobalBackground(
    createDefaultGlobalBackgroundState(),
    ASSET_IDS[0],
    ASSET_IDS
  )
  state = playGlobalBackground(state, 1_000)
  state = setGlobalBackgroundVisibility(state, true)
  state = setGlobalBackgroundVisibility(state, false)

  assert.equal(state.playbackStatus, 'playing')
  assert.equal(globalBackgroundPositionAt(state, 4_000), 3_000)
})

test('三段背景首次运行自动播放第一段并按固定顺序预载下一段', () => {
  let state = initializeGlobalBackgroundSequence(
    createDefaultGlobalBackgroundState(),
    ASSET_IDS,
    1_000
  )

  assert.equal(GLOBAL_BACKGROUND_SWITCH_DURATION_MS, 1_000)
  assert.equal(state.activeAssetId, ASSET_IDS[0])
  assert.equal(state.preloadAssetId, ASSET_IDS[1])
  assert.equal(state.playbackStatus, 'playing')
  assert.equal(state.visible, true)
  assert.equal(nextGlobalBackgroundAssetId(state, ASSET_IDS), ASSET_IDS[1])

  state = beginGlobalBackgroundSwitch(
    state,
    ASSET_IDS[1],
    5_000,
    GLOBAL_BACKGROUND_SWITCH_DURATION_MS,
    ASSET_IDS
  )
  state = completeGlobalBackgroundSwitch(state, 6_000)
  state = initializeGlobalBackgroundSequence(state, ASSET_IDS, 6_000)
  assert.equal(state.activeAssetId, ASSET_IDS[1])
  assert.equal(state.preloadAssetId, ASSET_IDS[2])

  state = beginGlobalBackgroundSwitch(
    state,
    ASSET_IDS[2],
    7_000,
    GLOBAL_BACKGROUND_SWITCH_DURATION_MS,
    ASSET_IDS
  )
  state = completeGlobalBackgroundSwitch(state, 8_000)
  state = initializeGlobalBackgroundSequence(state, ASSET_IDS, 8_000)
  assert.equal(state.activeAssetId, ASSET_IDS[2])
  assert.equal(state.preloadAssetId, ASSET_IDS[0])
})

test('暂停与继续保持主进程权威播放位置', () => {
  let state = selectInitialGlobalBackground(
    createDefaultGlobalBackgroundState(),
    ASSET_IDS[0],
    ASSET_IDS
  )
  state = playGlobalBackground(state, 1_000)
  state = pauseGlobalBackground(state, 4_500)

  assert.equal(state.positionMs, 3_500)
  assert.equal(state.startedAtMs, null)

  state = playGlobalBackground(state, 8_000)
  assert.equal(globalBackgroundPositionAt(state, 10_000), 5_500)
})

test('预载不会触发切换修订', () => {
  let state = selectInitialGlobalBackground(
    createDefaultGlobalBackgroundState(),
    ASSET_IDS[0],
    ASSET_IDS
  )
  const switchRevision = state.switchRevision
  state = preloadGlobalBackground(state, ASSET_IDS[1], ASSET_IDS)

  assert.equal(state.preloadAssetId, ASSET_IDS[1])
  assert.equal(state.switchRevision, switchRevision)
  assert.equal(state.transition, null)
})

test('明确切换命令建立交叉淡化并在到期后替换当前背景', () => {
  let state = selectInitialGlobalBackground(
    createDefaultGlobalBackgroundState(),
    ASSET_IDS[0],
    ASSET_IDS
  )
  state = playGlobalBackground(state, 1_000)
  const switchRevision = state.switchRevision
  state = beginGlobalBackgroundSwitch(state, ASSET_IDS[1], 5_000, 600, ASSET_IDS)

  assert.equal(state.switchRevision, switchRevision + 1)
  assert.deepEqual(state.transition, {
    fromAssetId: ASSET_IDS[0],
    toAssetId: ASSET_IDS[1],
    startedAtMs: 5_000,
    durationMs: 600
  })
  assert.equal(completeGlobalBackgroundSwitch(state, 5_599), state)

  state = completeGlobalBackgroundSwitch(state, 5_600)
  assert.equal(state.activeAssetId, ASSET_IDS[1])
  assert.equal(state.preloadAssetId, null)
  assert.equal(state.transition, null)
  assert.equal(state.positionMs, 600)
  assert.equal(state.startedAtMs, 5_600)
})

test('交叉淡化期间拒绝预载或第二次切换覆盖当前过程', () => {
  let state = selectInitialGlobalBackground(
    createDefaultGlobalBackgroundState(),
    ASSET_IDS[0],
    ASSET_IDS
  )
  state = beginGlobalBackgroundSwitch(state, ASSET_IDS[1], 5_000, 600, ASSET_IDS)
  const switchingState = state

  assert.equal(preloadGlobalBackground(state, ASSET_IDS[2], ASSET_IDS), switchingState)
  assert.equal(
    beginGlobalBackgroundSwitch(state, ASSET_IDS[2], 5_200, 600, ASSET_IDS),
    switchingState
  )
})

test('失效素材标识会安全回退为空背景状态', () => {
  assert.deepEqual(
    normalizeGlobalBackgroundState(
      {
        version: 1,
        revision: 4,
        switchRevision: 2,
        visible: true,
        playbackStatus: 'playing',
        activeAssetId: 'missing',
        preloadAssetId: null,
        positionMs: 8_000,
        startedAtMs: 10_000,
        transition: null
      },
      ASSET_IDS
    ),
    {
      ...createDefaultGlobalBackgroundState(),
      revision: 4,
      switchRevision: 2
    }
  )
})

test('背景素材合同要求三段唯一且具备完整媒体信息', () => {
  const asset = {
    version: 1,
    id: 'background-1',
    displayName: '背景一',
    streamUrl: '/intermission-next/background/background-1',
    durationMs: 30_000,
    width: 1920,
    height: 1080,
    frameRate: 60,
    videoCodec: 'h264',
    audioCodec: null,
    audioEnabled: true,
    seamlessLoop: false
  }
  assert.deepEqual(normalizeGlobalBackgroundAsset(asset), {
    ...asset,
    audioEnabled: false
  })
  assert.ok(
    normalizeGlobalBackgroundAssets([
      asset,
      { ...asset, id: 'background-2' },
      { ...asset, id: 'background-3' }
    ])
  )
  assert.equal(normalizeGlobalBackgroundAssets([asset, asset, asset]), null)
})
