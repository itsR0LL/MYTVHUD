import fs from 'node:fs'
import readline from 'node:readline'

const inputPath = process.argv[2]
if (!inputPath) throw new Error('缺少 JSONL 文件路径')
const summaryOnly = process.argv.includes('--summary')

const previousPlayers = new Map()
const inferredEvents = []
const mapNames = new Set()
const phases = new Map()
let frameCount = 0
let invalidLines = 0
let framesWithAllPlayers = 0
let firstFrameAt = null
let lastFrameAt = null

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function activeWeapon(player) {
  const weapons = player?.weapons
  if (!weapons || typeof weapons !== 'object') return null
  for (const weapon of Object.values(weapons)) {
    if (weapon?.state === 'active' && typeof weapon?.name === 'string') return weapon.name
  }
  return null
}

function playerState(steamId, player) {
  return {
    steamId,
    name: typeof player?.name === 'string' ? player.name : '',
    team: typeof player?.team === 'string' ? player.team : '',
    health: finiteNumber(player?.state?.health),
    kills: finiteNumber(player?.match_stats?.kills),
    assists: finiteNumber(player?.match_stats?.assists),
    deaths: finiteNumber(player?.match_stats?.deaths),
    roundKills: finiteNumber(player?.state?.round_kills),
    roundHeadshots: finiteNumber(player?.state?.round_killhs),
    activeWeapon: activeWeapon(player)
  }
}

function positiveDelta(current, previous, key) {
  const currentValue = current[key]
  const previousValue = previous?.[key]
  if (currentValue === null || previousValue === null || previousValue === undefined) return 0
  return Math.max(0, currentValue - previousValue)
}

const lines = readline.createInterface({
  input: fs.createReadStream(inputPath, { encoding: 'utf8' }),
  crlfDelay: Infinity
})

for await (const line of lines) {
  if (!line.trim()) continue
  let record
  try {
    record = JSON.parse(line)
  } catch {
    invalidLines += 1
    continue
  }
  if (record.recordType !== 'gsi-frame') continue
  frameCount += 1
  firstFrameAt ??= record.receivedAtUnixMs
  lastFrameAt = record.receivedAtUnixMs
  const payload = record.payload
  if (!payload || typeof payload !== 'object') continue
  if (typeof payload.map?.name === 'string') mapNames.add(payload.map.name)
  if (typeof payload.phase_countdowns?.phase === 'string') {
    const phase = payload.phase_countdowns.phase
    phases.set(phase, (phases.get(phase) ?? 0) + 1)
  }
  const allPlayers = payload.allplayers
  if (!allPlayers || typeof allPlayers !== 'object') continue
  framesWithAllPlayers += 1

  const currentPlayers = new Map(
    Object.entries(allPlayers).map(([steamId, player]) => [steamId, playerState(steamId, player)])
  )
  const deaths = []
  const killers = []
  const assists = []
  const statChanges = []
  for (const [steamId, current] of currentPlayers) {
    const previous = previousPlayers.get(steamId)
    if (!previous) continue
    const changes = {
      health: current.health !== null && previous.health !== null ? current.health - previous.health : 0,
      kills: current.kills !== null && previous.kills !== null ? current.kills - previous.kills : 0,
      assists: current.assists !== null && previous.assists !== null ? current.assists - previous.assists : 0,
      deaths: current.deaths !== null && previous.deaths !== null ? current.deaths - previous.deaths : 0,
      roundKills:
        current.roundKills !== null && previous.roundKills !== null
          ? current.roundKills - previous.roundKills
          : 0,
      roundHeadshots:
        current.roundHeadshots !== null && previous.roundHeadshots !== null
          ? current.roundHeadshots - previous.roundHeadshots
          : 0
    }
    if (Object.values(changes).some((value) => value !== 0)) {
      statChanges.push({ name: current.name, team: current.team, ...changes })
    }
    if (previous.health !== null && previous.health > 0 && current.health === 0) {
      deaths.push({
        ...current,
        deathDelta: positiveDelta(current, previous, 'deaths')
      })
    }
    const killDelta = positiveDelta(current, previous, 'kills')
    const roundKillDelta = positiveDelta(current, previous, 'roundKills')
    const headshotDelta = positiveDelta(current, previous, 'roundHeadshots')
    if (killDelta > 0 || roundKillDelta > 0) {
      killers.push({ current, previous, killDelta, roundKillDelta, headshotDelta })
    }
    const assistDelta = positiveDelta(current, previous, 'assists')
    if (assistDelta > 0) assists.push({ current, assistDelta })
  }

  if (deaths.length || killers.length || assists.length) {
    const uniquePair = deaths.length === 1 && killers.length === 1
    const killer = uniquePair ? killers[0] : null
    inferredEvents.push({
      sequence: record.sequence,
      receivedAtUnixMs: record.receivedAtUnixMs,
      map: payload.map?.name ?? '',
      round: finiteNumber(payload.map?.round),
      phase: payload.phase_countdowns?.phase ?? '',
      uniquePair,
      deaths,
      killers: killers.map(({ current, previous, killDelta, roundKillDelta, headshotDelta }) => ({
        ...current,
        previousActiveWeapon: previous.activeWeapon,
        killDelta,
        roundKillDelta,
        headshotDelta
      })),
      assists,
      statChanges,
      inferred: uniquePair
        ? {
            killer: killer.current.name,
            killerSteamId: killer.current.steamId,
            victim: deaths[0].name,
            victimSteamId: deaths[0].steamId,
            headshot: killer.headshotDelta > 0,
            weaponBefore: killer.previous.activeWeapon,
            weaponAfter: killer.current.activeWeapon
          }
        : null
    })
  }
  previousPlayers.clear()
  for (const entry of currentPlayers) previousPlayers.set(...entry)
}

const pairedEvents = inferredEvents.filter((event) => event.uniquePair)
const ambiguousEvents = inferredEvents.filter(
  (event) => (event.deaths.length > 0 || event.killers.length > 0) && !event.uniquePair
)
const deathTransitions = inferredEvents.reduce((sum, event) => sum + event.deaths.length, 0)
const killIncrements = inferredEvents.reduce(
  (sum, event) => sum + event.killers.reduce((inner, killer) => inner + killer.killDelta, 0),
  0
)
const headshotIncrements = inferredEvents.reduce(
  (sum, event) => sum + event.killers.reduce((inner, killer) => inner + killer.headshotDelta, 0),
  0
)
const weaponChangedAcrossKill = pairedEvents.filter(
  (event) => event.inferred.weaponBefore !== event.inferred.weaponAfter
).length
const weaponChangedEvents = pairedEvents
  .filter((event) => event.inferred.weaponBefore !== event.inferred.weaponAfter)
  .map((event) => ({
    sequence: event.sequence,
    round: event.round,
    killer: event.inferred.killer,
    victim: event.inferred.victim,
    weaponBefore: event.inferred.weaponBefore,
    weaponAfter: event.inferred.weaponAfter
  }))
const unknownWeaponEvents = pairedEvents.filter(
  (event) => !event.inferred.weaponBefore && !event.inferred.weaponAfter
).length
const sameTeamPairs = pairedEvents.filter(
  (event) => event.killers[0].team && event.killers[0].team === event.deaths[0].team
).length
const killDeltaMismatchEvents = pairedEvents.filter(
  (event) => event.killers[0].killDelta !== event.killers[0].roundKillDelta
).length
const assistIncrements = inferredEvents.reduce(
  (sum, event) => sum + event.assists.reduce((inner, assist) => inner + assist.assistDelta, 0),
  0
)
const pairedEventsWithAssist = pairedEvents.filter((event) => event.assists.length > 0).length
const unexplainedDeathsWithStatIncrement = ambiguousEvents.reduce(
  (sum, event) => sum + event.deaths.filter((player) => player.deathDelta > 0).length,
  0
)

process.stdout.write(
  `${JSON.stringify(
    {
      inputPath,
      frameCount,
      invalidLines,
      framesWithAllPlayers,
      firstFrameAt,
      lastFrameAt,
      durationMs: firstFrameAt && lastFrameAt ? lastFrameAt - firstFrameAt : 0,
      mapNames: [...mapNames],
      phases: Object.fromEntries(phases),
      deathTransitions,
      killIncrements,
      headshotIncrements,
      pairedEventCount: pairedEvents.length,
      ambiguousEventCount: ambiguousEvents.length,
      weaponChangedAcrossKill,
      weaponChangedEvents,
      unknownWeaponEvents,
      sameTeamPairs,
      killDeltaMismatchEvents,
      assistIncrements,
      pairedEventsWithAssist,
      unexplainedDeathsWithStatIncrement,
      ambiguousEvents: summaryOnly ? ambiguousEvents.map((event) => ({
        sequence: event.sequence,
        round: event.round,
        phase: event.phase,
        deaths: event.deaths.map((player) => player.name),
        killers: event.killers.map((player) => ({
          name: player.name,
          killDelta: player.killDelta,
          roundKillDelta: player.roundKillDelta,
          headshotDelta: player.headshotDelta
        })),
        statChanges: event.statChanges
      })) : ambiguousEvents,
      pairedEvents: summaryOnly ? undefined : pairedEvents
    },
    null,
    2
  )}\n`
)
