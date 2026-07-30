/// <reference types="vite/client" />

type BPState = import('../../shared/bp').BPState
type BPPayload = import('../../shared/bp').BPPayload
type BPContentInput = import('../../shared/bp').BPContentInput

interface Window {
  api: {
    minimize: () => void
    close: () => void
    openWindow: () => void
    closeWindow: () => void
    autoPlaceGSI: () => Promise<{ success: boolean; message: string; targetPath?: string }>
    openDataDirectory: () => Promise<{
      success: boolean
      filePath?: string
      error?: string
    }>
    exportDataPackage: () => Promise<{
      success: boolean
      canceled?: boolean
      filePath?: string
      playerCount?: number
      teamCount?: number
      error?: string
    }>
    importDataPackage: () => Promise<{
      success: boolean
      canceled?: boolean
      filePath?: string
      backupPath?: string
      playerCount?: number
      teamCount?: number
      error?: string
    }>
    getOverlayStatus: () => Promise<{
      isOpen: boolean
      isVisible: boolean
      isFocused: boolean
      isFullScreen: boolean
      url: string
      id: number | null
    }>
    getBPState: () => Promise<BPPayload>
    setBPState: (state: BPState) => Promise<BPPayload>
    setBPContent: (content: BPContentInput) => Promise<BPPayload>
  }
}

interface Player {
  id: string | number
  name: string
  steamid: string
  avatar: string
  type: 'player' | 'coach' | 'spectator'
}

interface Team {
  id: string | number
  name: string
  name_ingame: string
  avatar?: string
}

interface PickMap {
  name:
    | 'de_mirage'
    | 'de_inferno'
    | 'de_dust2'
    | 'de_nuke'
    | 'de_overpass'
    | 'de_train'
    | 'de_vertigo'
    | 'de_cache'
    | 'de_office'
    | 'de_cbble'
    | 'de_anubis'
    | 'de_ancient'
  pickby: string
  decider: boolean
  ascore: any
  aid: string | number
  bscore: any
  bid: string | number
}

interface Match {
  id: string | number
  team_a: Team
  team_b: Team
  type: 'BO1' | 'BO3' | 'BO5'
  maps: PickMap[]
}
