import assert from 'node:assert/strict'
import test from 'node:test'
import {
  beginIntermissionNextExit,
  createHiddenIntermissionNextTransitionState,
  intermissionNextTransitionFrameAt,
  normalizeIntermissionNextTransitionState,
  startIntermissionNextTransition,
  type IntermissionNextTransitionTimings
} from '../../src/shared/intermission-transition-next/transition-state'

const TIMINGS: IntermissionNextTransitionTimings = {
  brandCoverMs: 500,
  backgroundRevealMs: 400,
  pageEnterMs: 600,
  pageExitMs: 450,
  brandExitMs: 350
}

test('只有新的播放修订或页面切换才重新开始转场', () => {
  let state = startIntermissionNextTransition(
    createHiddenIntermissionNextTransitionState(),
    'map_break',
    1,
    1_000
  )
  const unchanged = startIntermissionNextTransition(state, 'map_break', 1, 2_000)
  assert.equal(unchanged, state)

  state = startIntermissionNextTransition(state, 'map_break', 2, 2_000)
  assert.equal(state.startedAtMs, 2_000)
  assert.equal(state.playRevision, 2)
})

test('入场阶段严格按照主进程时间推导', () => {
  const state = startIntermissionNextTransition(
    createHiddenIntermissionNextTransitionState(),
    'map_break',
    1,
    1_000
  )

  assert.equal(intermissionNextTransitionFrameAt(state, TIMINGS, 1_200).phase, 'brand_cover')
  assert.equal(intermissionNextTransitionFrameAt(state, TIMINGS, 1_650).phase, 'background_reveal')
  assert.equal(intermissionNextTransitionFrameAt(state, TIMINGS, 2_100).phase, 'page_enter')
  assert.equal(intermissionNextTransitionFrameAt(state, TIMINGS, 2_500).phase, 'hold')
})

test('浏览器重连按时间恢复阶段而不是重播入场', () => {
  const stored = {
    version: 1,
    pageId: 'series_end',
    playRevision: 4,
    startedAtMs: 10_000,
    exitStartedAtMs: null
  }
  const frame = intermissionNextTransitionFrameAt(stored, TIMINGS, 20_000)

  assert.equal(frame.phase, 'hold')
  assert.equal(frame.pageId, 'series_end')
})

test('退出使用独立时间轴并最终回到透明隐藏', () => {
  let state = startIntermissionNextTransition(
    createHiddenIntermissionNextTransitionState(),
    'standby',
    1,
    1_000
  )
  state = beginIntermissionNextExit(state, 5_000)

  assert.equal(intermissionNextTransitionFrameAt(state, TIMINGS, 5_200).phase, 'page_exit')
  assert.equal(intermissionNextTransitionFrameAt(state, TIMINGS, 5_600).phase, 'brand_exit')
  assert.equal(intermissionNextTransitionFrameAt(state, TIMINGS, 5_800).phase, 'hidden')
})

test('无效存储状态安全回退为隐藏且保留修订号', () => {
  assert.deepEqual(
    normalizeIntermissionNextTransitionState({
      version: 1,
      pageId: 'unknown',
      playRevision: 9,
      startedAtMs: 100,
      exitStartedAtMs: null
    }),
    {
      ...createHiddenIntermissionNextTransitionState(),
      playRevision: 9
    }
  )
})
