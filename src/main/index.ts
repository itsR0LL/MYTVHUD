import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import appIcon from './logo.png?asset'
import { registerDatabaseIPC, removeDeprecatedRegistrationFields } from './database/database'
import { registerDataTransferIPC } from './database/data-transfer'
import {
  hideBPOutput,
  registerBPIPC,
  removeDeprecatedBPState,
  setBPContentPreparedHandler,
  setBPStartOutputGuard
} from './bp/bp'
import {
  initializeIntermissionState,
  registerIntermissionIPC,
  resetIntermissionScoreOverride
} from './intermission/intermission'
import { registerMatchResetIPC } from './match-reset'
import './gsi/gsi'
import './overlay/overlay'
import { registerAutoPlaceGSIIPC } from './gsi/auto-place'
import {
  initializeMatchRuntimeState,
  registerMatchRuntimeIPC,
  setNextMatchCreatedHandler
} from './match-session/match-session'
import {
  initializeBroadcastRuntimeState,
  hideBroadcastOutput,
  registerBroadcastRuntimeIPC,
  setBroadcastStartOutputGuard,
  updatePreparedProgramNextMatch
} from './intermission/broadcast-flow'
import { isBPSequenceComplete } from '../shared/bp'
import {
  publishIntermissionNextSnapshot,
  registerIntermissionNextIPC
} from './intermission-next/integration'
import {
  initializeBroadcastDirectorRuntime,
  registerBroadcastDirectorIPC,
  setBroadcastDirectorPublisher
} from './intermission/broadcast-director'

function createWindow(): void {
  // 创建管理器主窗口
  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 890,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    fullscreenable: false,
    icon: appIcon,
    minWidth: 1150,
    minHeight: 750,
    maxWidth: 1500,
    maxHeight: 1200,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发环境加载 electron-vite 提供的热更新地址，生产环境加载本地页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Electron 初始化完成后再注册系统接口并创建窗口
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })
  ipcMain.on('close', () => {
    BrowserWindow.getAllWindows().forEach((win) => win.close())
  })

  try {
    await removeDeprecatedRegistrationFields()
  } catch (error) {
    console.error('清理旧版注册字段失败：', error)
  }

  try {
    await removeDeprecatedBPState()
  } catch (error) {
    console.error('清理旧版 BP 持久化状态失败：', error)
  }

  try {
    await initializeIntermissionState()
  } catch (error) {
    console.error('初始化播出控制状态失败：', error)
  }

  try {
    await initializeMatchRuntimeState()
  } catch (error) {
    console.error('初始化比赛运行状态失败：', error)
  }

  try {
    await initializeBroadcastRuntimeState()
  } catch (error) {
    console.error('初始化播出运行状态失败：', error)
  }

  try {
    await initializeBroadcastDirectorRuntime()
  } catch (error) {
    console.error('初始化统一播出导演台失败：', error)
  }

  setBroadcastDirectorPublisher(() => {
    void publishIntermissionNextSnapshot().catch((error: unknown) => {
      console.error('发布统一播出导演台状态失败：', error)
    })
  })

  setBPStartOutputGuard(async () => {
    await hideBroadcastOutput()
  })
  setBroadcastStartOutputGuard(async () => {
    await hideBPOutput()
  })
  setBPContentPreparedHandler(async (match, sequence) => {
    await updatePreparedProgramNextMatch({
      matchId: match.id,
      type: match.type,
      team_a: match.team_a,
      team_b: match.team_b,
      bpReady: isBPSequenceComplete(sequence, match.type)
    })
  })
  setNextMatchCreatedHandler(async () => {
    await resetIntermissionScoreOverride()
  })

  // 注册数据库 IPC 接口
  registerDatabaseIPC(ipcMain)
  // 注册 BP 控制与展示状态接口
  registerBPIPC(ipcMain)
  // 注册播出控制状态、地图状态与倒计时接口
  registerIntermissionIPC(ipcMain)
  // 注册自动播出流程接口
  registerBroadcastRuntimeIPC(ipcMain)
  // 注册统一播出阶段与主操作接口
  registerBroadcastDirectorIPC(ipcMain)
  // 注册统一播出、页面布局与背景输出接口
  registerIntermissionNextIPC(ipcMain)
  // 注册比赛运行状态接口
  registerMatchRuntimeIPC(ipcMain)
  // 注册比赛结束后的播出状态联动重置接口
  registerMatchResetIPC(ipcMain)
  // 注册数据目录及赛事数据导入、导出接口
  registerDataTransferIPC(ipcMain)
  // 注册 GSI 配置自动写入接口
  registerAutoPlaceGSIIPC(ipcMain)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
