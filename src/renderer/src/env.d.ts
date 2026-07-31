/// <reference types="vite/client" />

type BPContentInput = import('../../shared/bp').BPContentInput
type IntermissionPayload = import('../../shared/intermission').IntermissionPayload
type IntermissionStateUpdate = import('../../shared/intermission').IntermissionStateUpdate
type MatchRuntimeV1 = import('../../shared/match-session').MatchRuntimeV1
type BroadcastRuntimeV1 = import('../../shared/broadcast-flow').BroadcastRuntimeV1
type BroadcastDirectorSnapshot = import('../../shared/broadcast-director').BroadcastDirectorSnapshot
type IntermissionTestModeStateV1 =
  import('../../shared/intermission-test-mode').IntermissionTestModeStateV1
type IntermissionNextCoordinatorResult =
  import('../../main/intermission-next/state').IntermissionNextCoordinatorResult

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
    setBPContent: (content: BPContentInput) => Promise<import('../../shared/bp').BPPayload>
    resetMatchBroadcastState: (confirmed: boolean) => Promise<void>
    saveMatch: (value: { match: unknown; allowStructureInvalidation: boolean }) => Promise<{
      match: import('../../shared/match-session').MatchRecord
      runtimeInvalidated: boolean
    }>
    getMatchRuntimeState: () => Promise<MatchRuntimeV1>
    finishMatchSeries: () => Promise<MatchRuntimeV1>
    clearMatchRuntimeState: () => Promise<MatchRuntimeV1>
    createNextMatch: (setup: {
      teamAId: string | number
      teamBId: string | number
      type: import('../../shared/bp').BPMatchType
    }) => Promise<{ id: string | number; [key: string]: any }>
    getIntermissionState: () => Promise<IntermissionPayload>
    updateIntermissionState: (update: IntermissionStateUpdate) => Promise<IntermissionPayload>
    getBroadcastState: () => Promise<BroadcastRuntimeV1>
    prepareBroadcastMapReport: (
      mapId: import('../../shared/bp').BPMapId
    ) => Promise<BroadcastRuntimeV1>
    advanceBroadcastDirector: () => Promise<BroadcastDirectorSnapshot>
    hideUnifiedBroadcast: () => Promise<BroadcastDirectorSnapshot>
    playBroadcastDirectorBP: () => Promise<BroadcastDirectorSnapshot>
    restoreBroadcastDirectorWarmup: () => Promise<BroadcastDirectorSnapshot>
    jumpBroadcastDirector: (
      request: import('../../shared/broadcast-director').BroadcastDirectorJumpRequest
    ) => Promise<BroadcastDirectorSnapshot>
    getIntermissionTestModeState: () => Promise<IntermissionTestModeStateV1>
    setIntermissionTestModeEnabled: (enabled: boolean) => Promise<IntermissionTestModeStateV1>
    setIntermissionTestStage: (stage: unknown) => Promise<IntermissionTestModeStateV1>
    advanceIntermissionTestStage: () => Promise<IntermissionTestModeStateV1>
    hideIntermissionTestOutput: () => Promise<IntermissionTestModeStateV1>
    getIntermissionNextState: () => Promise<IntermissionNextCoordinatorResult>
    updateIntermissionNextLayout: (
      layout: import('../../shared/intermission-next').IntermissionNextLayoutState
    ) => Promise<IntermissionNextCoordinatorResult>
    updateIntermissionNextPageFlowTemplates: (
      templates: import('../../shared/broadcast-page-flow-next/page-flow').BroadcastPageFlowTemplatesV3
    ) => Promise<IntermissionNextCoordinatorResult>
  }
}

interface Player {
  id: string | number
  name: string
  steamid: string
  avatar: string
  type: 'player' | 'coach' | 'spectator'
  team_id: string
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
  status: import('../../shared/intermission').MatchMapStatus
}

interface Match {
  id: string | number
  team_a: Team
  team_b: Team
  type: 'BO1' | 'BO3' | 'BO5'
  maps: PickMap[]
}
