export const MANAGER_SETTING_KEYS = [
  'seriesName_first',
  'seriesName_second',
  'overlayFocusedPlayer',
  'overlaySidebars',
  'overlayTopbar',
  'overlayRadar',
  'ctColor',
  'tColor',
  'borderRadius',
  'shortcutKey'
] as const

export type ManagerSettingKey = (typeof MANAGER_SETTING_KEYS)[number]

export interface ManagerSettingsForm {
  seriesName_first: string
  seriesName_second: string
  overlayFocusedPlayer: boolean
  overlaySidebars: 'row' | 'column' | 'undefined'
  overlayTopbar: boolean
  overlayRadar: boolean
  ctColor: string
  tColor: string
  borderRadius: string
  shortcutKey: string
}

const DEFAULT_MANAGER_SETTINGS: ManagerSettingsForm = {
  seriesName_first: '',
  seriesName_second: '',
  overlayFocusedPlayer: true,
  overlaySidebars: 'row',
  overlayTopbar: true,
  overlayRadar: true,
  ctColor: '286efa',
  tColor: 'f52559',
  borderRadius: '0',
  shortcutKey: 'Ctrl+Alt+I'
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function overlaySidebarsValue(value: unknown): ManagerSettingsForm['overlaySidebars'] {
  return value === 'row' || value === 'column' || value === 'undefined' ? value : 'row'
}

function borderRadiusValue(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '0'
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) return '0'
  return String(Math.min(20, Math.max(0, Math.round(parsed))))
}

export function createDefaultManagerSettings(): ManagerSettingsForm {
  return { ...DEFAULT_MANAGER_SETTINGS }
}

export function normalizeManagerSettings(value: unknown): ManagerSettingsForm {
  const source =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  return {
    seriesName_first: stringValue(
      source.seriesName_first,
      DEFAULT_MANAGER_SETTINGS.seriesName_first
    ),
    seriesName_second: stringValue(
      source.seriesName_second,
      DEFAULT_MANAGER_SETTINGS.seriesName_second
    ),
    overlayFocusedPlayer: booleanValue(
      source.overlayFocusedPlayer,
      DEFAULT_MANAGER_SETTINGS.overlayFocusedPlayer
    ),
    overlaySidebars: overlaySidebarsValue(source.overlaySidebars),
    overlayTopbar: booleanValue(source.overlayTopbar, DEFAULT_MANAGER_SETTINGS.overlayTopbar),
    overlayRadar: booleanValue(source.overlayRadar, DEFAULT_MANAGER_SETTINGS.overlayRadar),
    ctColor: stringValue(source.ctColor, DEFAULT_MANAGER_SETTINGS.ctColor),
    tColor: stringValue(source.tColor, DEFAULT_MANAGER_SETTINGS.tColor),
    borderRadius: borderRadiusValue(source.borderRadius),
    shortcutKey: stringValue(source.shortcutKey, DEFAULT_MANAGER_SETTINGS.shortcutKey)
  }
}

export function managerSettingsEntries(
  value: ManagerSettingsForm
): Array<[ManagerSettingKey, string | boolean]> {
  return MANAGER_SETTING_KEYS.map((key) => [key, value[key]])
}
