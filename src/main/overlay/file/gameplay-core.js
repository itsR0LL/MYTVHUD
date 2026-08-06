;((root, factory) => {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.MYTVHUDGameplayCore = api
})(typeof globalThis === 'object' ? globalThis : null, () => {
  'use strict'

  const LIVE_PHASES = new Set(['live', 'bomb', 'defuse'])

  function numberValue(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }

  function playerName(player) {
    return player?.infos?.name || player?.name || player?.defaultName || '选手'
  }

  function teamName(team, fallback) {
    return team?.infos?.name || team?.name || fallback
  }

  function stripWeapon(value) {
    if (typeof value !== 'string') return ''
    const name = value.trim()
    return name.startsWith('weapon_') ? name.slice(7) : name
  }

  function firstWeapon(value) {
    return Array.isArray(value) ? value[0] || null : value || null
  }

  function playerWeapon(player) {
    const primary = firstWeapon(player?.primary_weapon)
    const secondary = firstWeapon(player?.secondary_weapon)
    const fallback = (player?.weapons || []).find(
      (weapon) => weapon?.type !== 'Knife' && weapon?.type !== 'Grenade' && weapon?.type !== 'C4'
    )
    return stripWeapon(primary?.name || secondary?.name || fallback?.name || '')
  }

  function playerGrenades(player) {
    return (player?.grenades || []).map((grenade) => stripWeapon(grenade?.name)).filter(Boolean)
  }

  function flashOpacity(value) {
    const flashed = numberValue(value)
    return Math.min(1, flashed <= 1 ? flashed : flashed / 255)
  }

  function sidebarPlayers(data, side) {
    return (data?.players || []).filter(
      (player) =>
        player?.team?.side === side &&
        player?.infos?.type !== 'coach' &&
        player?.infos?.type !== 'spectator'
    )
  }

  function economyData(data, side) {
    const players = sidebarPlayers(data, side)
    const team = side === 'CT' ? data?.map?.team_ct : data?.map?.team_t
    const rows = players.map((player) => ({
      steamid: player?.steamid || '',
      name: playerName(player),
      money: numberValue(player?.state?.money),
      equipmentValue: numberValue(player?.state?.equip_value),
      armor: numberValue(player?.state?.armor),
      helmet: player?.state?.helmet === true,
      defusekit: player?.state?.defusekit === true,
      weapon: playerWeapon(player),
      grenades: playerGrenades(player)
    }))
    return {
      team: teamName(team, side === 'CT' ? 'CT 战队' : 'T 战队'),
      totalMoney: rows.reduce((sum, player) => sum + player.money, 0),
      totalEquipmentValue: rows.reduce((sum, player) => sum + player.equipmentValue, 0),
      consecutiveRoundLosses: numberValue(team?.consecutive_round_losses),
      rows
    }
  }

  function aliveData(data) {
    const phase = data?.phase_countdowns?.phase
    const players = data?.players || []
    const ct = players.filter(
      (player) => player?.team?.side === 'CT' && numberValue(player?.state?.health) > 0
    ).length
    const t = players.filter(
      (player) => player?.team?.side === 'T' && numberValue(player?.state?.health) > 0
    ).length
    const visible = LIVE_PHASES.has(phase) && ct + t > 0
    const clutch = (ct === 1 && t >= 1) || (t === 1 && ct >= 1)
    return { visible, ct, t, clutch }
  }

  function isLivePhase(phase) {
    return LIVE_PHASES.has(phase)
  }

  function identifier(value) {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  }

  function score(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  function activeMatch(data) {
    if (!data?.match || typeof data.match !== 'object' || Array.isArray(data.match)) return null
    const matchId = Object.keys(data.match)[0]
    return matchId ? data.match[matchId] || null : null
  }

  function finishedMapWins(maps, teamId) {
    const expectedTeamId = identifier(teamId)
    if (!expectedTeamId) return 0
    return (Array.isArray(maps) ? maps : []).reduce((wins, map) => {
      if (map?.status !== 'finished') return wins
      const teamAScore = score(map?.ascore ?? map?.team_a?.score)
      const teamBScore = score(map?.bscore ?? map?.team_b?.score)
      if (teamAScore === null || teamBScore === null || teamAScore === teamBScore) return wins
      const winnerId = identifier(
        teamAScore > teamBScore ? (map?.aid ?? map?.team_a?.id) : (map?.bid ?? map?.team_b?.id)
      )
      return wins + (winnerId === expectedTeamId ? 1 : 0)
    }, 0)
  }

  return Object.freeze({
    activeMatch,
    aliveData,
    economyData,
    finishedMapWins,
    flashOpacity,
    identifier,
    isLivePhase,
    numberValue,
    playerGrenades,
    playerWeapon,
    sidebarPlayers,
    stripWeapon
  })
})
