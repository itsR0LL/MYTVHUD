import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 暴露给渲染进程的应用接口
const api = {
  minimize: () => ipcRenderer.send('minimize'),
  close: () => ipcRenderer.send('close'),
  openOverlay: () => ipcRenderer.send('openWindow'),
  closeOverlay: () => ipcRenderer.send('closeWindow'),
  openWindow: () => ipcRenderer.send('openWindow'),
  closeWindow: () => ipcRenderer.send('closeWindow'),
  getOverlayStatus: () => ipcRenderer.invoke('getOverlayStatus'),
  autoPlaceGSI: () => ipcRenderer.invoke('gsi:auto-place'),
  openDataDirectory: () => ipcRenderer.invoke('data:open-directory'),
  exportDataPackage: () => ipcRenderer.invoke('data:export'),
  importDataPackage: () => ipcRenderer.invoke('data:import'),
  getBPState: () => ipcRenderer.invoke('bp:get-state'),
  setBPState: (state: unknown) => ipcRenderer.invoke('bp:set-state', state),
  setBPContent: (content: unknown) => ipcRenderer.invoke('bp:set-content', content),
  getIntermissionState: () => ipcRenderer.invoke('intermission:get-state'),
  updateIntermissionState: (update: unknown) =>
    ipcRenderer.invoke('intermission:update-state', update),
  updateIntermissionMapStatus: (update: unknown) =>
    ipcRenderer.invoke('intermission:update-map-status', update),
  sendIntermissionTimerCommand: (command: unknown) =>
    ipcRenderer.invoke('intermission:timer-command', command)
}

// 按存储类型封装数据库 IPC 调用
const db = {
  matchs: {
    // matchs 在主进程中使用键值存储语义
    getAll: () => ipcRenderer.invoke('db:invoke', { target: 'matchs', action: 'getAll' }),
    getById: (id: string | number) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'matchs',
        action: 'get',
        payload: { key: String(id) }
      }),
    add: (item: { id: string | number; [key: string]: any }) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'matchs',
        action: 'add',
        payload: { key: String(item.id), value: item }
      }),
    remove: (id: string | number) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'matchs',
        action: 'remove',
        payload: { key: String(id) }
      }),
    modify: (id: string | number, partial: Record<string, any>) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'matchs',
        action: 'modify',
        payload: { key: String(id), partial }
      }),
    set: (items: Array<{ id: string | number; [key: string]: any }>) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'matchs',
        action: 'setAll',
        payload: { data: Object.fromEntries(items.map((it) => [String(it.id), it])) }
      })
  },
  players: {
    getAll: () => ipcRenderer.invoke('db:invoke', { target: 'players', action: 'getAll' }),
    getById: (id: string | number) =>
      ipcRenderer.invoke('db:invoke', { target: 'players', action: 'getById', payload: { id } }),
    add: (item: { id: string | number; [key: string]: any }) =>
      ipcRenderer.invoke('db:invoke', { target: 'players', action: 'add', payload: { item } }),
    remove: (id: string | number) =>
      ipcRenderer.invoke('db:invoke', { target: 'players', action: 'remove', payload: { id } }),
    modify: (id: string | number, partial: Record<string, any>) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'players',
        action: 'modify',
        payload: { id, partial }
      }),
    set: (items: Array<{ id: string | number; [key: string]: any }>) =>
      ipcRenderer.invoke('db:invoke', { target: 'players', action: 'set', payload: { items } })
  },
  teams: {
    getAll: () => ipcRenderer.invoke('db:invoke', { target: 'teams', action: 'getAll' }),
    getById: (id: string | number) =>
      ipcRenderer.invoke('db:invoke', { target: 'teams', action: 'getById', payload: { id } }),
    add: (item: { id: string | number; [key: string]: any }) =>
      ipcRenderer.invoke('db:invoke', { target: 'teams', action: 'add', payload: { item } }),
    remove: (id: string | number) =>
      ipcRenderer.invoke('db:invoke', { target: 'teams', action: 'remove', payload: { id } }),
    modify: (id: string | number, partial: Record<string, any>) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'teams',
        action: 'modify',
        payload: { id, partial }
      }),
    set: (items: Array<{ id: string | number; [key: string]: any }>) =>
      ipcRenderer.invoke('db:invoke', { target: 'teams', action: 'set', payload: { items } })
  },
  settings: {
    getAll: () => ipcRenderer.invoke('db:invoke', { target: 'settings', action: 'getAll' }),
    get: (key: string) =>
      ipcRenderer.invoke('db:invoke', { target: 'settings', action: 'get', payload: { key } }),
    add: (key: string, value: any) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'settings',
        action: 'add',
        payload: { key, value }
      }),
    set: (key: string, value: any) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'settings',
        action: 'set',
        payload: { key, value }
      }),
    modify: (key: string, partial: Record<string, any>) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'settings',
        action: 'modify',
        payload: { key, partial }
      }),
    remove: (key: string) =>
      ipcRenderer.invoke('db:invoke', { target: 'settings', action: 'remove', payload: { key } }),
    setAll: (data: Record<string, any>) =>
      ipcRenderer.invoke('db:invoke', { target: 'settings', action: 'setAll', payload: { data } })
  },
  additional: {
    getAll: () => ipcRenderer.invoke('db:invoke', { target: 'additional', action: 'getAll' }),
    get: (key: string) =>
      ipcRenderer.invoke('db:invoke', { target: 'additional', action: 'get', payload: { key } }),
    add: (key: string, value: any) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'additional',
        action: 'add',
        payload: { key, value }
      }),
    set: (key: string, value: any) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'additional',
        action: 'set',
        payload: { key, value }
      }),
    modify: (key: string, partial: Record<string, any>) =>
      ipcRenderer.invoke('db:invoke', {
        target: 'additional',
        action: 'modify',
        payload: { key, partial }
      }),
    remove: (key: string) =>
      ipcRenderer.invoke('db:invoke', { target: 'additional', action: 'remove', payload: { key } }),
    setAll: (data: Record<string, any>) =>
      ipcRenderer.invoke('db:invoke', { target: 'additional', action: 'setAll', payload: { data } })
  }
}

// 启用上下文隔离时通过 contextBridge 暴露接口，否则直接挂载到 window
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('db', db)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore：类型已在 index.d.ts 中声明
  window.electron = electronAPI
  // @ts-ignore：类型已在 index.d.ts 中声明
  window.api = api
  // @ts-ignore：类型已在 index.d.ts 中声明
  window.db = db
}
