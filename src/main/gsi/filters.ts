import type { CSGO, PlayerExtension } from '../csgo-extended'
import {
  injectResolvedTeamInfo,
  resolveActiveMatchTeamSides,
  type GSIRuntimeContext,
  type ResolvedTeamSides
} from './match-runtime'
export type Filter = (data: CSGO) => CSGO | Promise<CSGO>
export interface FilterOptions {
  sortPlayersByObserverSlot?: boolean
  replaceTeamName?: boolean
}

const defaultOptions: Required<FilterOptions> = {
  sortPlayersByObserverSlot: true,
  replaceTeamName: true
}

const customFilters: Filter[] = []

export function registerFilter(filter: Filter): void {
  customFilters.push(filter)
}

export function clearFilters(): void {
  customFilters.length = 0
}

export function getFilters(): Filter[] {
  return [...customFilters]
}

export function composeFilters(filters: Filter[]): (data: CSGO) => Promise<CSGO> {
  return async (data: CSGO) => {
    let acc: CSGO = data
    for (const f of filters) {
      try {
        const next = await Promise.resolve(f(acc))
        acc = (next ?? acc) as CSGO
      } catch {
        // 单个过滤器失败时保留上一阶段数据，避免中断整条处理链
      }
    }
    return acc
  }
}

// 内置过滤器：按 observer_slot 升序排列选手
export function sortPlayersByObserverSlotFilter(data: CSGO): CSGO {
  try {
    const players = (data as any)?.players as PlayerExtension[] | undefined
    if (!Array.isArray(players) || players.length === 0) return data

    const toSlot = (value: unknown): number => {
      const n = Number(value)
      if (!Number.isFinite(n)) return Number.POSITIVE_INFINITY
      return n + 1
    }

    const slotOf = (p: PlayerExtension): number => toSlot((p as any)?.observer_slot)
    const sorted = players.slice().sort((a, b) => slotOf(a) - slotOf(b))

    return { ...(data as any), players: sorted } as CSGO
  } catch {
    return data
  }
}
export function injectTeamInfo(
  data: CSGO,
  context: GSIRuntimeContext,
  resolvedSides: ResolvedTeamSides | null
): CSGO {
  return injectResolvedTeamInfo(data, context, resolvedSides)
}

export function playerGrenadesFilter(data: CSGO): CSGO {
  try {
    const players = (data as any)?.players as any[] | undefined

    const order: Record<string, number> = {
      weapon_hegrenade: 1,
      weapon_flashbang: 2,
      weapon_smokegrenade: 3,
      weapon_incgrenade: 4,
      weapon_molotov: 4
    }

    const weightOf = (w: any): number => {
      const name = w?.name
      return typeof name === 'string' && name in order ? order[name] : 9999
    }

    const transformPlayer = (p: any) => {
      if (!p || typeof p !== 'object') return p
      const weapons: any[] = Array.isArray(p.weapons) ? p.weapons : []
      const grenades = weapons
        .filter((w: any) => String(w?.type ?? '').toLowerCase() === 'grenade')
        .sort((a: any, b: any) => weightOf(a) - weightOf(b))
      const nonGrenades = weapons.filter(
        (w: any) => String(w?.type ?? '').toLowerCase() !== 'grenade'
      )
      return { ...p, grenades, weapons: nonGrenades }
    }

    const nextPlayers = Array.isArray(players) ? players.map(transformPlayer) : players
    const nextPlayer = transformPlayer((data as any)?.player)

    return { ...(data as any), players: nextPlayers, player: nextPlayer } as CSGO
  } catch {
    return data
  }
}

export function playerWeaponsFilter(data: CSGO): CSGO {
  try {
    const transformPlayer = (p: any) => {
      if (!p || typeof p !== 'object') return p
      const weapons: any[] = Array.isArray(p.weapons) ? p.weapons : []

      const activeList = weapons.filter((w: any) => w?.state === 'active' || w?.state === 'reload')
      const primaryTypes = new Set([
        'SniperRifle',
        'Submachine Gun',
        'Shotgun',
        'Machine Gun',
        'Rifle'
      ])
      const primaryList = weapons.filter((w: any) => primaryTypes.has(w?.type))
      const secondaryList = weapons.filter((w: any) => w?.type === 'Pistol')
      const bombList = weapons.filter((w: any) => w?.type === 'C4')

      const pick = (arr: any[]) => (arr.length === 0 ? null : arr.length === 1 ? arr[0] : arr)

      return {
        ...p,
        active_weapon: pick(activeList),
        primary_weapon: pick(primaryList),
        secondary_weapon: pick(secondaryList),
        bomb: pick(bombList)
      }
    }

    const nextPlayers = Array.isArray((data as any)?.players)
      ? ((data as any).players as any[]).map(transformPlayer)
      : (data as any)?.players

    const nextPlayer = transformPlayer((data as any)?.player)

    return { ...(data as any), players: nextPlayers, player: nextPlayer } as CSGO
  } catch {
    return data
  }
}

export function injectPlayerInfo(data: CSGO, context: GSIRuntimeContext): CSGO {
  try {
    const playersList = context.players

    if (!Array.isArray(playersList) || playersList.length === 0) return data

    // 建立“Steam ID -> 完整选手记录”的索引
    const lookup = new Map<string, any>()
    for (const p of playersList) {
      const sid = typeof p.steamid === 'string' ? p.steamid.trim() : ''
      if (!sid) continue
      lookup.set(sid, p)
    }

    const attachInfos = (pl: any) => {
      if (!pl || typeof pl !== 'object') return pl
      const sid = typeof pl.steamid === 'string' ? pl.steamid.trim() : ''
      if (!sid) return pl
      const info = lookup.get(sid)
      if (info) {
        const nextInfo = { ...info }
        delete nextInfo.avatar
        return { ...pl, infos: nextInfo }
      }
      return pl
    }

    const nextPlayers = Array.isArray((data as any)?.players)
      ? ((data as any).players as any[]).map(attachInfos)
      : (data as any)?.players

    const nextPlayer = attachInfos((data as any)?.player)

    return { ...(data as any), players: nextPlayers, player: nextPlayer } as CSGO
  } catch {
    return data
  }
}

function playerIsFocused(data: CSGO): CSGO {
  try {
    const players = (data as any)?.players as any[] | undefined
    const focused = (data as any)?.player

    if (!Array.isArray(players) || players.length === 0) return data

    const getSteamId = (obj: any): string =>
      typeof obj?.steamid === 'string' ? obj.steamid.trim() : ''

    const focusedId = getSteamId(focused)
    const isSame = (p: any): boolean => {
      if (!focused) return false
      const pid = getSteamId(p)
      if (pid && focusedId) return pid === focusedId
      return p === focused
    }

    const nextPlayers = players.map((p) => ({ ...p, isFocused: isSame(p) }))

    return { ...(data as any), players: nextPlayers } as CSGO
  } catch {
    return data
  }
}

export async function applyFilters(
  gamedata: CSGO,
  context: GSIRuntimeContext,
  options: FilterOptions = defaultOptions
): Promise<CSGO> {
  const filters: Filter[] = []
  const resolvedSides = resolveActiveMatchTeamSides(gamedata, context)

  if (options.sortPlayersByObserverSlot) {
    filters.push(sortPlayersByObserverSlotFilter)
  }

  if (options.replaceTeamName) {
    filters.push((data) => injectTeamInfo(data, context, resolvedSides))
  }

  // 根据 Steam ID 注入本地选手资料
  filters.push((data) => injectPlayerInfo(data, context))

  // 从全部选手及当前观察选手的武器列表中拆分投掷物
  filters.push(playerGrenadesFilter)
  // 提取当前武器、主武器、副武器和 C4，同时保留原武器列表
  filters.push(playerWeaponsFilter)
  // 在选手数组中标记当前观察目标
  filters.push(playerIsFocused)

  if (customFilters.length) {
    filters.push(...customFilters)
  }

  if (!filters.length) return gamedata

  return composeFilters(filters)(gamedata)
}
