import { ElectronAPI } from '@electron-toolkit/preload'
import type { BPContentInput, BPPayload, BPState } from '../shared/bp'

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
      openOverlay: () => void
      closeOverlay: () => void
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
      getBPState: () => Promise<BPPayload>
      setBPState: (state: BPState) => Promise<BPPayload>
      setBPContent: (content: BPContentInput) => Promise<BPPayload>
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
