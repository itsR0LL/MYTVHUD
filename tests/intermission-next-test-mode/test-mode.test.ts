import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createIntermissionTestMapMedia,
  createIntermissionTestPageData,
  intermissionTestContentStartOffsetMs
} from '../../src/main/intermission-next/test-mode'
import {
  addIntermissionNextComponent,
  createDefaultIntermissionNextLayoutState
} from '../../src/shared/intermission-next'
import { UTILITY_REPLAY_TOTAL_DURATION_MS } from '../../src/shared/utility-replay'

test('无比赛测试为地图间和系列赛结束提供完整页面数据', () => {
  const mapBreak = createIntermissionTestPageData('map_break', 1, 1_000)
  assert.ok(mapBreak && mapBreak.page === 'map_break')
  assert.equal(mapBreak.teamAPlayers.length, 5)
  assert.equal(mapBreak.teamBPlayers.length, 5)
  assert.equal(mapBreak.maps.length, 5)
  assert.equal(mapBreak.scoreTimeline.length, 23)
  assert.equal(mapBreak.nextMap?.mapId, 'de_anubis')

  const seriesEnd = createIntermissionTestPageData('series_end', 2, 2_000)
  assert.ok(seriesEnd && seriesEnd.page === 'series_end')
  assert.equal(seriesEnd.teamAPlayers.length, 5)
  assert.equal(seriesEnd.teamBPlayers.length, 5)
  assert.equal(seriesEnd.maps.filter((map) => map.status === 'finished').length, 4)
  assert.deepEqual(seriesEnd.finalSeriesScore, { teamA: 3, teamB: 1 })
  assert.equal(seriesEnd.winnerTeamId, seriesEnd.teamA.id)
})

test('系列赛结束测试数据为第五张 Nuke 提供地图图片', () => {
  const media = createIntermissionTestMapMedia('series_end', 1_000, 2_000)
  assert.equal(media.length, 5)
  assert.equal(media[4]?.mapId, 'de_nuke')
  assert.match(media[4]?.current.url ?? '', /\/de_nuke\/component\/de_nuke_1\.jpg$/)
  assert.match(media[4]?.preload?.url ?? '', /\/de_nuke\/component\/de_nuke_2\.jpg$/)
})

test('无比赛测试自动越过从零开始且没有测试数据的道具回放', () => {
  let layout = createDefaultIntermissionNextLayoutState()
  layout = addIntermissionNextComponent(layout, 'map_break', 'utilityReplay', 0)
  layout = addIntermissionNextComponent(layout, 'series_end', 'utilityReplay', 0)

  assert.equal(
    intermissionTestContentStartOffsetMs(layout, 'map_break'),
    UTILITY_REPLAY_TOTAL_DURATION_MS
  )
  assert.equal(
    intermissionTestContentStartOffsetMs(layout, 'series_end'),
    UTILITY_REPLAY_TOTAL_DURATION_MS
  )
  assert.equal(intermissionTestContentStartOffsetMs(layout, 'warmup'), 0)
})
