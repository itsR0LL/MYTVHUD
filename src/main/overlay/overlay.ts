import { BrowserWindow, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'

let overlayWindow: BrowserWindow | null = null

function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show()
    overlayWindow.focus()
    return overlayWindow
  }

  overlayWindow = new BrowserWindow({
    fullscreen: true,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    focusable: true,
    frame: false,
    title: 'MYTVHUD Overlay',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: true
    }
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // 保持 HUD 窗口位于全屏游戏上方
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setFullScreen(true)
  // 让鼠标事件穿透 HUD，避免干扰游戏操作
  overlayWindow.setIgnoreMouseEvents(true)

  const url = is.dev ? 'http://localhost:5032/' : 'http://localhost:5031/overlay'
  overlayWindow.loadURL(url).catch(() => {
    // 页面加载失败时关闭无效窗口，允许下次重新创建
    overlayWindow?.close()
    overlayWindow = null
  })

  return overlayWindow
}

ipcMain.on('openWindow', () => {
  createOverlayWindow()
})

ipcMain.on('closeWindow', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }
})

ipcMain.handle('getOverlayStatus', async () => {
  const w = overlayWindow
  const isOpen = !!(w && !w.isDestroyed())
  return {
    isOpen,
    isVisible: isOpen ? w!.isVisible() : false,
    isFocused: isOpen ? w!.isFocused() : false,
    isFullScreen: isOpen ? w!.isFullScreen() : false,
    url: isOpen ? w!.webContents.getURL() : '',
    id: isOpen ? w!.id : null
  }
})
