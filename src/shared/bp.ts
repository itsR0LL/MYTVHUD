export const BP_MAP_ASSET_BASE_URL = 'http://localhost:5031/bp/maps'

export const BP_MAPS = [
  {
    id: 'de_ancient',
    name: 'Ancient',
    displayName: 'Ancient(远古遗迹)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_ancient.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_ancient.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/ancient.png`
  },
  {
    id: 'de_anubis',
    name: 'Anubis',
    displayName: 'Anubis(阿努比斯)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_anubis.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_anubis.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/anubis.png`
  },
  {
    id: 'de_dust2',
    name: 'Dust2',
    displayName: 'Dust2(炙热沙城2)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_dust2.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_dust2.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/dust2.png`
  },
  {
    id: 'de_inferno',
    name: 'Inferno',
    displayName: 'Inferno(炼狱小镇)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_inferno.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_inferno.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/inferno.png`
  },
  {
    id: 'de_mirage',
    name: 'Mirage',
    displayName: 'Mirage(荒漠迷城)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_mirage.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_mirage.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/mirage.png`
  },
  {
    id: 'de_nuke',
    name: 'Nuke',
    displayName: 'Nuke(核子危机)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_nuke.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_nuke.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/nuke.png`
  },
  {
    id: 'de_overpass',
    name: 'Overpass',
    displayName: 'Overpass(死亡游乐园)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_overpass.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_overpass.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/overpass.png`
  },
  {
    id: 'de_vertigo',
    name: 'Vertigo',
    displayName: 'Vertigo(殒命大厦)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_vertigo.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_vertigo.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/vertigo.png`
  },
  {
    id: 'de_cache',
    name: 'Cache',
    displayName: 'Cache(死城之谜)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_cache.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_cache.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/cache.png`
  },
  {
    id: 'de_train',
    name: 'Train',
    displayName: 'Train(列车停放站)',
    image: `${BP_MAP_ASSET_BASE_URL}/icons/de_train.png`,
    wideImage: `${BP_MAP_ASSET_BASE_URL}/wide/de_train.png`,
    bo5Image: `${BP_MAP_ASSET_BASE_URL}/bo5/train.png`
  }
] as const

export const BP_ACTIONS = ['ban', 'pick', 'decider'] as const
export const BP_TEAM_SLOTS = ['team_a', 'team_b'] as const
export const BP_STARTING_SIDES = ['CT', 'T'] as const
export const BP_MATCH_TYPES = ['BO1', 'BO3', 'BO5'] as const

export type BPMapId = (typeof BP_MAPS)[number]['id']
export type BPAction = (typeof BP_ACTIONS)[number]
export type BPTeamSlot = (typeof BP_TEAM_SLOTS)[number]
export type BPStartingSide = (typeof BP_STARTING_SIDES)[number]
export type BPMatchType = (typeof BP_MATCH_TYPES)[number]

export interface BPSequenceItem {
  map: BPMapId
  action: BPAction
  actor: BPTeamSlot | ''
  startingSide: BPStartingSide | ''
}

export interface BPContentInput {
  sequence: BPSequenceItem[]
}

export interface BPState {
  version: 1
  sequence: BPSequenceItem[]
  visible: boolean
  animationEnabled: boolean
  revision: number
}

export interface BPTeam {
  id: string | number
  name: string
  name_ingame: string
  avatar?: string
}

export interface BPMatch {
  id: string | number
  type: BPMatchType
  team_a: BPTeam
  team_b: BPTeam
}

export interface BPPayload {
  state: BPState
  match: BPMatch | null
}

export const BP_SERIES_RULES: Record<BPMatchType, { ban: number; pick: number }> = {
  BO1: { ban: 6, pick: 0 },
  BO3: { ban: 4, pick: 2 },
  BO5: { ban: 2, pick: 4 }
}

export const BP_SERIES_ACTION_ORDER: Record<BPMatchType, readonly BPAction[]> = {
  BO1: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider'],
  BO3: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'],
  BO5: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider']
}

export function isBPSequenceActionOrderValid(
  sequence: readonly BPSequenceItem[],
  matchType: BPMatchType
): boolean {
  const actionOrder = BP_SERIES_ACTION_ORDER[matchType]
  return sequence.every((item, index) => item.action === actionOrder[index])
}

export function createDefaultBPState(): BPState {
  return {
    version: 1,
    sequence: [],
    visible: false,
    animationEnabled: true,
    revision: 0
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number])
}

export function normalizeBPSequence(value: unknown): BPSequenceItem[] {
  if (!Array.isArray(value)) return []

  const result: BPSequenceItem[] = []
  const usedMaps = new Set<BPMapId>()

  for (const rawItem of value) {
    if (result.length >= 7 || !isRecord(rawItem)) break
    if (
      !isOneOf(
        rawItem.map,
        BP_MAPS.map((item) => item.id)
      )
    )
      continue
    if (usedMaps.has(rawItem.map)) continue
    if (!isOneOf(rawItem.action, BP_ACTIONS)) continue

    const isFinalStep = result.length === 6
    if (isFinalStep && rawItem.action !== 'decider') continue
    if (!isFinalStep && rawItem.action === 'decider') continue

    const actor =
      rawItem.action !== 'decider' && isOneOf(rawItem.actor, BP_TEAM_SLOTS) ? rawItem.actor : ''
    const startingSide =
      rawItem.action === 'pick' && isOneOf(rawItem.startingSide, BP_STARTING_SIDES)
        ? rawItem.startingSide
        : ''

    result.push({ map: rawItem.map, action: rawItem.action, actor, startingSide })
    usedMaps.add(rawItem.map)
  }

  return result
}

export function normalizeBPState(value: unknown): BPState {
  const source = isRecord(value) ? value : {}

  return {
    version: 1,
    sequence: normalizeBPSequence(source.sequence),
    visible: source.visible === true,
    animationEnabled: source.animationEnabled !== false,
    revision: Math.max(0, Math.floor(Number(source.revision) || 0))
  }
}
