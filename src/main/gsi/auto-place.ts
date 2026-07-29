import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import { join, dirname } from 'path'
import fs from 'fs'

// 注册 GSI 配置写入接口，将 cfg 文件放入 game/csgo/cfg
export function registerAutoPlaceGSIIPC(ipc: IpcMain): void {
  ipc.handle('gsi:auto-place', async () => {
    try {
      // 不传入父窗口，避免窗口未创建时出现类型问题
      const res = await dialog.showOpenDialog({
        title: '选择 cs2.exe',
        properties: ['openFile'],
        filters: [{ name: '可执行文件', extensions: ['exe'] }]
      })

      if (res.canceled || !res.filePaths?.length) {
        return { success: false, message: '操作已取消' }
      }

      const exePath = res.filePaths[0]
      // cs2.exe 路径格式：<游戏根目录>\\game\\bin\\win64\\cs2.exe
      const win64Dir = dirname(exePath)
      const binDir = dirname(win64Dir)
      const gameDir = dirname(binDir)
      const cfgDir = join(gameDir, 'csgo', 'cfg')

      // 依次从构建输出目录和开发源码目录查找 GSI 配置模板
      const candidates = [
        join(__dirname, 'gsi', 'gamestate_integration_mytvhud.cfg'),
        join(process.cwd(), 'src', 'gamestate_integration_mytvhud.cfg')
      ]
      const source = candidates.find((p) => {
        try {
          return fs.existsSync(p)
        } catch {
          return false
        }
      })

      if (!source) {
        return { success: false, message: '找不到 GSI 配置源文件（cfg）' }
      }

      try {
        fs.mkdirSync(cfgDir, { recursive: true })
      } catch {}

      const target = join(cfgDir, 'gamestate_integration_mytvhud.cfg')
      const content = fs.readFileSync(source, 'utf-8')
      fs.writeFileSync(target, content, 'utf-8')

      return { success: true, message: `GSI 配置文件已写入：${target}`, targetPath: target }
    } catch (err: any) {
      return { success: false, message: String(err?.message ?? err) }
    }
  })
}
