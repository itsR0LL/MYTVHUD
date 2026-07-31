import { ElectronAPI } from '@electron-toolkit/preload'
import type { BPContentInput } from '../shared/bp'
import type { IntermissionPayload, IntermissionStateUpdate } from '../shared/intermission'
import type { MatchRuntimeV1 } from '../shared/match-session'
import type { BroadcastRuntimeV1 } from '../shared/broadcast-flow'
import type { BroadcastDirectorSnapshot } from '../shared/broadcast-director'
import type { IntermissionTestModeStateV1 } from '../shared/intermission-test-mode'
import type { IntermissionNextCoordinatorResult } from '../main/intermission-next/state'

interface DataTransferResult {
  success: boolean
  canceled?: boolean
  filePath?: string
  backupPath?: string
  playerCount?: number
  teamCount?: number
  error?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      minimize: () => void
      close: () => void
      openWindow: () => void
      closeWindow: () => void
      getOverlayStatus: () => Promise<{
        isOpen: boolean
        isVisible: boolean
        isFocused: boolean
        isFullScreen: boolean
        url: string
        id: number | null
      }>
      autoPlaceGSI: () => Promise<{ success: boolean; message: string; targetPath?: string }>
      openDataDirectory: () => Promise<DataTransferResult>
      exportDataPackage: () => Promise<DataTransferResult>
      importDataPackage: () => Promise<DataTransferResult>
      setBPContent: (content: BPContentInput) => Promise<import('../shared/bp').BPPayload>
      resetMatchBroadcastState: (confirmed: boolean) => Promise<void>
      saveMatch: (value: { match: unknown; allowStructureInvalidation: boolean }) => Promise<{
        match: import('../shared/match-session').MatchRecord
        runtimeInvalidated: boolean
      }>
      getMatchRuntimeState: () => Promise<MatchRuntimeV1>
      finishMatchSeries: () => Promise<MatchRuntimeV1>
      clearMatchRuntimeState: () => Promise<MatchRuntimeV1>
      createNextMatch: (setup: {
        teamAId: string | number
        teamBId: string | number
        type: import('../shared/bp').BPMatchType
      }) => Promise<{ id: string | number; [key: string]: any }>
      getIntermissionState: () => Promise<IntermissionPayload>
      updateIntermissionState: (update: IntermissionStateUpdate) => Promise<IntermissionPayload>
      getBroadcastState: () => Promise<BroadcastRuntimeV1>
      prepareBroadcastMapReport: (
        mapId: import('../shared/bp').BPMapId
      ) => Promise<BroadcastRuntimeV1>
      advanceBroadcastDirector: () => Promise<BroadcastDirectorSnapshot>
      hideUnifiedBroadcast: () => Promise<BroadcastDirectorSnapshot>
      playBroadcastDirectorBP: () => Promise<BroadcastDirectorSnapshot>
      restoreBroadcastDirectorWarmup: () => Promise<BroadcastDirectorSnapshot>
      jumpBroadcastDirector: (
        request: import('../shared/broadcast-director').BroadcastDirectorJumpRequest
      ) => Promise<BroadcastDirectorSnapshot>
      getIntermissionTestModeState: () => Promise<IntermissionTestModeStateV1>
      setIntermissionTestModeEnabled: (enabled: boolean) => Promise<IntermissionTestModeStateV1>
      setIntermissionTestStage: (stage: unknown) => Promise<IntermissionTestModeStateV1>
      advanceIntermissionTestStage: () => Promise<IntermissionTestModeStateV1>
      hideIntermissionTestOutput: () => Promise<IntermissionTestModeStateV1>
      getIntermissionNextState: () => Promise<IntermissionNextCoordinatorResult>
      updateIntermissionNextLayout: (
        layout: import('../shared/intermission-next').IntermissionNextLayoutState
      ) => Promise<IntermissionNextCoordinatorResult>
      updateIntermissionNextPageFlowTemplates: (
        templates: import('../shared/broadcast-page-flow-next/page-flow').BroadcastPageFlowTemplatesV3
      ) => Promise<IntermissionNextCoordinatorResult>
    }
    db: {
      matchs: {
        getAll: () => Promise<Array<{ id: string | number; [key: string]: any }>>
        getById: (
          id: string | number
        ) => Promise<{ id: string | number; [key: string]: any } | undefined>
        add: (item: {
          id: string | number
          [key: string]: any
        }) => Promise<{ id: string | number; [key: string]: any }>
        remove: (id: string | number) => Promise<boolean>
        modify: (
          id: string | number,
          partial: Record<string, any>
        ) => Promise<{ id: string | number; [key: string]: any } | undefined>
        set: (
          items: Array<{ id: string | number; [key: string]: any }>
        ) => Promise<Array<{ id: string | number; [key: string]: any }>>
      }
      players: {
        getAll: () => Promise<Array<{ id: string | number; [key: string]: any }>>
        getById: (
          id: string | number
        ) => Promise<{ id: string | number; [key: string]: any } | undefined>
        add: (item: {
          id: string | number
          [key: string]: any
        }) => Promise<{ id: string | number; [key: string]: any }>
        remove: (id: string | number) => Promise<boolean>
        modify: (
          id: string | number,
          partial: Record<string, any>
        ) => Promise<{ id: string | number; [key: string]: any } | undefined>
        set: (
          items: Array<{ id: string | number; [key: string]: any }>
        ) => Promise<Array<{ id: string | number; [key: string]: any }>>
      }
      teams: {
        getAll: () => Promise<Array<{ id: string | number; [key: string]: any }>>
        getById: (
          id: string | number
        ) => Promise<{ id: string | number; [key: string]: any } | undefined>
        add: (item: {
          id: string | number
          [key: string]: any
        }) => Promise<{ id: string | number; [key: string]: any }>
        remove: (id: string | number) => Promise<boolean>
        modify: (
          id: string | number,
          partial: Record<string, any>
        ) => Promise<{ id: string | number; [key: string]: any } | undefined>
        set: (
          items: Array<{ id: string | number; [key: string]: any }>
        ) => Promise<Array<{ id: string | number; [key: string]: any }>>
      }
      settings: {
        getAll: () => Promise<Record<string, any>>
        get: (key: string) => Promise<any>
        add: (key: string, value: any) => Promise<void>
        set: (key: string, value: any) => Promise<void>
        modify: (key: string, partial: Record<string, any>) => Promise<any>
        remove: (key: string) => Promise<boolean>
        setAll: (data: Record<string, any>) => Promise<Record<string, any>>
      }
      additional: {
        getAll: () => Promise<Record<string, any>>
        get: (key: string) => Promise<any>
        add: (key: string, value: any) => Promise<void>
        set: (key: string, value: any) => Promise<void>
        modify: (key: string, partial: Record<string, any>) => Promise<any>
        remove: (key: string) => Promise<boolean>
        setAll: (data: Record<string, any>) => Promise<Record<string, any>>
      }
    }
  }
}
