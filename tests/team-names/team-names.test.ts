import assert from 'node:assert/strict'
import test from 'node:test'
import type { CSGO } from '../../src/main/csgo-extended'
import { injectResolvedTeamInfo } from '../../src/main/gsi/match-runtime'
import { getTeamAbbreviation, getTeamFullName, type BPPayload } from '../../src/shared/bp'
import {
  createBPPageData,
  createWarmupPageData
} from '../../src/shared/intermission-page-data-next/view-model'

const TEAM_A = {
  id: 'team-a',
  name: 'Vanguard Reckoning Gaming',
  name_ingame: 'VRG'
}
const TEAM_B = {
  id: 'team-b',
  name: 'Five Rush Man',
  name_ingame: '5RM'
}

test('战队缩写与完整名称遵循各自的明确回退顺序', () => {
  assert.equal(getTeamAbbreviation(TEAM_A), 'VRG')
  assert.equal(getTeamAbbreviation({ name: TEAM_A.name, name_ingame: '  ' }), TEAM_A.name)
  assert.equal(getTeamFullName(TEAM_A), TEAM_A.name)
  assert.equal(getTeamFullName({ name: '  ', name_ingame: TEAM_A.name_ingame }), 'VRG')
})

test('HUD 注入使用战队缩写并保留战队标识', () => {
  const data = {
    map: {
      team_ct: { score: 7 },
      team_t: { score: 5 }
    },
    players: [
      { steamid: 'player-a', team: { side: 'CT' } },
      { steamid: 'player-b', team: { side: 'T' } }
    ]
  } as unknown as CSGO
  const result = injectResolvedTeamInfo(
    data,
    {
      players: [],
      teams: [TEAM_A, TEAM_B],
      activeMatch: { id: 'match-1', team_a: TEAM_A, team_b: TEAM_B }
    },
    { CT: TEAM_A.id, T: TEAM_B.id }
  )

  assert.equal(result.map.team_ct.infos?.name, 'VRG')
  assert.equal(result.map.team_t.infos?.name, '5RM')
  assert.equal(result.map.team_ct.infos?.id, TEAM_A.id)
  assert.equal(result.map.team_t.infos?.id, TEAM_B.id)
})

test('BP 页面使用战队缩写，暖场页面保留完整名称', () => {
  const payload: BPPayload = {
    state: {
      version: 1,
      sequence: [
        { map: 'de_ancient', action: 'ban', actor: 'team_a', startingSide: '' },
        { map: 'de_anubis', action: 'ban', actor: 'team_b', startingSide: '' },
        { map: 'de_dust2', action: 'pick', actor: 'team_a', startingSide: 'CT' },
        { map: 'de_inferno', action: 'pick', actor: 'team_b', startingSide: 'T' },
        { map: 'de_mirage', action: 'ban', actor: 'team_a', startingSide: '' },
        { map: 'de_nuke', action: 'ban', actor: 'team_b', startingSide: '' },
        { map: 'de_overpass', action: 'decider', actor: '', startingSide: '' }
      ],
      visible: false,
      playbackStarted: false,
      playbackStartedAtMs: null,
      animationEnabled: true,
      revision: 1
    },
    match: {
      id: 'match-1',
      type: 'BO3',
      team_a: TEAM_A,
      team_b: TEAM_B
    }
  }

  const bpPage = createBPPageData(payload)
  const warmupPage = createWarmupPageData(payload)
  assert.ok(bpPage)
  assert.ok(warmupPage)
  assert.equal(bpPage.teamA.name, 'VRG')
  assert.equal(bpPage.teamB.name, '5RM')
  assert.equal(warmupPage.teamA?.name, TEAM_A.name)
  assert.equal(warmupPage.teamB?.name, TEAM_B.name)
})
