import type { RawKill } from 'csgogsi'

export type GameplaySide = 'CT' | 'T'

export interface GameplayPlayerState {
  health?: number
  armor?: number
  helmet?: boolean
  defusekit?: boolean
  flashed?: number
  money?: number
  equip_value?: number
}

export interface GameplayWeapon {
  name?: string
  type?: string
  state?: string
}

export interface GameplayPlayer {
  steamid?: string
  name?: string
  defaultName?: string
  observer_slot?: number
  team?: { side?: GameplaySide }
  state?: GameplayPlayerState
  weapons?: GameplayWeapon[]
  grenades?: GameplayWeapon[]
  primary_weapon?: GameplayWeapon | GameplayWeapon[] | null
  secondary_weapon?: GameplayWeapon | GameplayWeapon[] | null
  infos?: { name?: string }
}

export interface EconomyPlayerRow {
  steamid: string
  name: string
  money: number
  equipmentValue: number
  weapon: string
  armor: number
  helmet: boolean
  defusekit: boolean
  grenades: string[]
}

export interface EconomySummary {
  side: GameplaySide
  totalMoney: number
  totalEquipmentValue: number
  consecutiveRoundLosses: number
  players: EconomyPlayerRow[]
}

export interface AliveSituation {
  ct: number
  t: number
  primary: string
  secondary: string
  clutchSide: GameplaySide | null
}

export interface HlaePlayerDeathEnvelope {
  type: 'player_death'
  clientTime: number
  data: {
    userid: number
    attacker: number
    assister: number
    user_steamid: string
    attacker_steamid: string
    assister_steamid: string
    assistedflash: boolean
    weapon: string
    weapon_itemid: string
    weapon_fauxitemid: string
    weapon_originalowner_xuid: string
    headshot: boolean
    dominated: number
    revenge: number
    wipe: number
    attackerblind: boolean
    thrusmoke: boolean
    noscope: boolean
    penetrated: number
    noreplay: boolean
    attackerinair: boolean
  }
}

const LIVE_PHASES = new Set(['live', 'bomb', 'defuse'])

function finiteNonNegative(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function firstWeapon(
  value: GameplayWeapon | GameplayWeapon[] | null | undefined
): GameplayWeapon | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function displayName(player: GameplayPlayer): string {
  return player.infos?.name || player.name || player.defaultName || '选手'
}

export function stripWeaponPrefix(value: unknown): string {
  const weapon = typeof value === 'string' ? value.trim() : ''
  return weapon.startsWith('weapon_') ? weapon.slice('weapon_'.length) : weapon
}

export function buildEconomySummary(
  side: GameplaySide,
  players: GameplayPlayer[],
  consecutiveRoundLosses: unknown
): EconomySummary {
  const rows = players
    .filter((player) => player.team?.side === side)
    .sort((left, right) => {
      const leftSlot = finiteNonNegative(left.observer_slot ?? Number.MAX_SAFE_INTEGER)
      const rightSlot = finiteNonNegative(right.observer_slot ?? Number.MAX_SAFE_INTEGER)
      return leftSlot - rightSlot
    })
    .map((player): EconomyPlayerRow => {
      const primary = firstWeapon(player.primary_weapon)
      const secondary = firstWeapon(player.secondary_weapon)
      const fallback = (player.weapons ?? []).find(
        (weapon) => weapon.type !== 'Knife' && weapon.type !== 'Grenade' && weapon.type !== 'C4'
      )
      return {
        steamid: player.steamid || '',
        name: displayName(player),
        money: finiteNonNegative(player.state?.money),
        equipmentValue: finiteNonNegative(player.state?.equip_value),
        weapon: stripWeaponPrefix(primary?.name || secondary?.name || fallback?.name || ''),
        armor: finiteNonNegative(player.state?.armor),
        helmet: player.state?.helmet === true,
        defusekit: player.state?.defusekit === true,
        grenades: (player.grenades ?? [])
          .map((grenade) => stripWeaponPrefix(grenade.name))
          .filter(Boolean)
      }
    })

  return {
    side,
    totalMoney: rows.reduce((total, player) => total + player.money, 0),
    totalEquipmentValue: rows.reduce((total, player) => total + player.equipmentValue, 0),
    consecutiveRoundLosses: finiteNonNegative(consecutiveRoundLosses),
    players: rows
  }
}

export function buildAliveSituation(
  players: GameplayPlayer[],
  phase: unknown
): AliveSituation | null {
  if (typeof phase !== 'string' || !LIVE_PHASES.has(phase)) return null

  const ct = players.filter(
    (player) => player.team?.side === 'CT' && finiteNonNegative(player.state?.health) > 0
  ).length
  const t = players.filter(
    (player) => player.team?.side === 'T' && finiteNonNegative(player.state?.health) > 0
  ).length
  if (ct === 0 && t === 0) return null

  let secondary = '存活人数'
  let clutchSide: GameplaySide | null = null
  if (ct === 1 && t === 1) {
    secondary = '一对一'
  } else if (ct === 1 && t > 1) {
    secondary = `CT 残局 · 1 对 ${t}`
    clutchSide = 'CT'
  } else if (t === 1 && ct > 1) {
    secondary = `T 残局 · 1 对 ${ct}`
    clutchSide = 'T'
  }

  return { ct, t, primary: `${ct} 对 ${t}`, secondary, clutchSide }
}

export function normalizeFlashOpacity(value: unknown): number {
  const flashed = finiteNonNegative(value)
  if (flashed <= 1) return flashed
  return Math.min(1, flashed / 255)
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function exactString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function exactBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function exactInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null
}

export function parseHlaePlayerDeathMessage(value: unknown): RawKill | null {
  const envelope = objectValue(value)
  if (!envelope || envelope.type !== 'player_death') return null
  const data = objectValue(envelope.data)
  if (!data) return null

  const userid = exactInteger(data.userid)
  const attacker = exactInteger(data.attacker)
  const assister = exactInteger(data.assister)
  const userSteamId = exactString(data.user_steamid)
  const attackerSteamId = exactString(data.attacker_steamid)
  const assisterSteamId = exactString(data.assister_steamid)
  const weapon = exactString(data.weapon)
  const assistedflash = exactBoolean(data.assistedflash)
  const headshot = exactBoolean(data.headshot)
  const attackerblind = exactBoolean(data.attackerblind)
  const thrusmoke = exactBoolean(data.thrusmoke)
  const noscope = exactBoolean(data.noscope)
  const noreplay = exactBoolean(data.noreplay)
  const attackerinair = exactBoolean(data.attackerinair)
  const penetrated = exactInteger(data.penetrated)
  const dominated = exactInteger(data.dominated)
  const revenge = exactInteger(data.revenge)
  const wipe = exactInteger(data.wipe)

  if (
    userid === null ||
    attacker === null ||
    assister === null ||
    userSteamId === null ||
    attackerSteamId === null ||
    assisterSteamId === null ||
    weapon === null ||
    assistedflash === null ||
    headshot === null ||
    attackerblind === null ||
    thrusmoke === null ||
    noscope === null ||
    noreplay === null ||
    attackerinair === null ||
    penetrated === null ||
    dominated === null ||
    revenge === null ||
    wipe === null
  ) {
    return null
  }

  const clientTime = finiteNonNegative(envelope.clientTime) || Date.now()
  return {
    name: 'player_death',
    clientTime,
    keys: {
      userid: { value: userid, xuid: userSteamId },
      attacker: { value: attacker, xuid: attackerSteamId },
      assister: { value: assister, xuid: assisterSteamId },
      assistedflash,
      weapon,
      weapon_itemid: exactString(data.weapon_itemid) ?? '',
      weapon_fauxitemid: exactString(data.weapon_fauxitemid) ?? '',
      weapon_originalowner_xuid: exactString(data.weapon_originalowner_xuid) ?? '0',
      headshot,
      dominated,
      revenge,
      wipe,
      attackerblind,
      thrusmoke,
      noscope,
      penetrated,
      noreplay,
      attackerinair
    }
  }
}
