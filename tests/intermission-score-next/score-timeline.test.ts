import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEmptyMapScoreTimeline,
  finalizeMapScoreTimeline,
  normalizeMapScoreTimeline,
  recordObservedMapScore
} from '../../src/shared/intermission-score-next/score-timeline'

const TEAM_A_ID = 'team-a'
const TEAM_B_ID = 'team-b'

test('连续真实比分点形成可播放时间线', () => {
  let timeline = createEmptyMapScoreTimeline()
  timeline = recordObservedMapScore(timeline, TEAM_A_ID, TEAM_B_ID, 1, 0)
  timeline = recordObservedMapScore(timeline, TEAM_A_ID, TEAM_B_ID, 1, 1)
  timeline = recordObservedMapScore(timeline, TEAM_A_ID, TEAM_B_ID, 2, 1)

  assert.equal(timeline.complete, true)
  assert.deepEqual(
    timeline.points.map((point) => point.winnerTeamId),
    [TEAM_A_ID, TEAM_B_ID, TEAM_A_ID]
  )
  assert.equal(finalizeMapScoreTimeline(timeline, TEAM_A_ID, TEAM_B_ID, 2, 1).complete, true)
})

test('跳过回合时保留观察值但禁止播放虚构过程', () => {
  let timeline = createEmptyMapScoreTimeline()
  timeline = recordObservedMapScore(timeline, TEAM_A_ID, TEAM_B_ID, 1, 0)
  timeline = recordObservedMapScore(timeline, TEAM_A_ID, TEAM_B_ID, 2, 1)

  assert.equal(timeline.complete, false)
  assert.deepEqual(
    timeline.points.map((point) => point.roundIndex),
    [1, 3]
  )
  assert.equal(finalizeMapScoreTimeline(timeline, TEAM_A_ID, TEAM_B_ID, 2, 1).complete, false)
})

test('重复帧不产生重复比分点', () => {
  let timeline = createEmptyMapScoreTimeline()
  timeline = recordObservedMapScore(timeline, TEAM_A_ID, TEAM_B_ID, 1, 0)
  timeline = recordObservedMapScore(timeline, TEAM_A_ID, TEAM_B_ID, 1, 0)

  assert.equal(timeline.points.length, 1)
  assert.equal(timeline.complete, true)
})

test('无效存储数据安全回退为空时间线', () => {
  assert.deepEqual(normalizeMapScoreTimeline({ version: 2 }, TEAM_A_ID, TEAM_B_ID), {
    version: 1,
    complete: false,
    points: []
  })
  assert.deepEqual(normalizeMapScoreTimeline({ version: 1, points: [] }, TEAM_A_ID, TEAM_A_ID), {
    version: 1,
    complete: false,
    points: []
  })
})
