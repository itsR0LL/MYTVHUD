import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import appIcon from './logo.png?asset'
import { registerDatabaseIPC, databaseService } from './database/database'
import { registerDataTransferIPC } from './database/data-transfer'
import './gsi/gsi'
import './overlay/overlay'
import { registerAutoPlaceGSIIPC } from './gsi/auto-place'

let acrylicEnabledSetting = true

function createWindow(): void {
  // 创建管理器主窗口
  const mainWindow = new BrowserWindow({
    width: 1150,
    height: 750,
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

  if (process.platform === 'win32' && acrylicEnabledSetting) {
    const applyAcrylic = (): void => {
      try {
        mainWindow.setBackgroundMaterial('acrylic')
      } catch {}
    }
    applyAcrylic()
    mainWindow.on('blur', applyAcrylic)
    mainWindow.on('focus', applyAcrylic)
  }

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

  // 启动时读取窗口毛玻璃设置
  try {
    const enabled = await databaseService.settings.get('acrylicEnabled')
    acrylicEnabledSetting = enabled == null ? true : Boolean(enabled)
  } catch {}

  // 注册数据库 IPC 接口
  registerDatabaseIPC(ipcMain)
  // 注册数据目录及赛事数据导入、导出接口
  registerDataTransferIPC(ipcMain)
  // 注册 GSI 配置自动写入接口
  registerAutoPlaceGSIIPC(ipcMain)

  // 注册应用重启接口
  ipcMain.handle('app:relaunch', () => {
    try {
      app.relaunch()
      app.exit(0)
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  })

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
