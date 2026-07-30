import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import { CSGOGSI } from 'csgogsi'
import { databaseService } from '../database/database'
import { join } from 'path'
import { applyFilters } from './filters'
import { app as electronApp, globalShortcut } from 'electron'
import cors from 'cors'
import { getBPPayload, setBPPublisher } from '../bp/bp'
import { getIntermissionPayload, setIntermissionPublisher } from '../intermission/intermission'

const expressApp = express()
const GSI = new CSGOGSI()
const server = http.createServer(expressApp)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// HUD 主动刷新使用的实时通信命名空间
const realtime = io.of('/realtime')
const GSI_BROADCAST_INTERVAL_MS = 33
type GSIData = Parameters<typeof applyFilters>[0]

let pendingGSIData: GSIData | null = null
let gsiBroadcastRunning = false
let lastGSIBroadcastAt = 0

setBPPublisher((payload) => {
  io.emit('bp-state', payload)
})

setIntermissionPublisher((payload) => {
  io.emit('intermission-state', payload)
})

export function emitOverlayRefresh(): void {
  realtime.emit('refresh-now')
}

expressApp.use(express.urlencoded({ extended: true }))
expressApp.use(express.json({ limit: '12Mb' }))
expressApp.use(cors())

// 接收 CS2 推送的 GSI 数据
expressApp.post('/gsi', (req, res) => {
  GSI.digest(req.body)
  res.sendStatus(200)
})

// 为 HUD 页面提供本地数据接口
expressApp.get('/api/players/:steamid', async (req, res) => {
  try {
    const { steamid } = req.params
    const players = await databaseService.players.getAll()
    const player = players.find((p) => {
      const pid = String((p as any).steamid ?? (p as any).steamID ?? (p as any).steamId ?? '')
      return pid === steamid
    })
    if (player) res.json(player)
    else res.status(404).json({ error: 'Player not found' })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

expressApp.get('/api/teams/:id', async (req, res) => {
  try {
    const { id } = req.params
    const team = await databaseService.teams.getById(id)
    if (team) res.json(team)
    else res.status(404).json({ error: `Team not found, return ${team}` })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

expressApp.get('/api/players', async (_req, res) => {
  const data = await databaseService.players.getAll()
  res.json(data)
})

expressApp.get('/api/teams', async (_req, res) => {
  const data = await databaseService.teams.getAll()
  res.json(data)
})

expressApp.get('/api/matchs', async (_req, res) => {
  const data = await databaseService.matchs.getAll()
  res.json(data)
})

expressApp.get('/api/settings', async (_req, res) => {
  const data = await databaseService.settings.getAll()
  res.json(data)
})

expressApp.get('/api/bp', async (_req, res) => {
  try {
    res.json(await getBPPayload())
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

expressApp.get('/api/intermission', async (_req, res) => {
  try {
    res.json(await getIntermissionPayload())
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

expressApp.use('/overlay', express.static(join(__dirname, 'overlay/file')))
expressApp.get('/bp', (_req, res) => {
  res.sendFile(join(__dirname, 'bp/file/index.html'))
})
expressApp.use('/bp', express.static(join(__dirname, 'bp/file')))
expressApp.get('/intermission', (_req, res) => {
  res.sendFile(join(__dirname, 'intermission/file/index.html'))
})
expressApp.use('/intermission', express.static(join(__dirname, 'intermission/file')))

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function broadcastLatestGSIData(): Promise<void> {
  if (gsiBroadcastRunning) return
  gsiBroadcastRunning = true

  try {
    while (pendingGSIData) {
      const remainingInterval = GSI_BROADCAST_INTERVAL_MS - (Date.now() - lastGSIBroadcastAt)
      if (remainingInterval > 0) await wait(remainingInterval)

      const data = pendingGSIData
      pendingGSIData = null
      const [settings, match, gamedata] = await Promise.all([
        databaseService.settings.getAll(),
        databaseService.matchs.getAll(),
        applyFilters(data)
      ])
      lastGSIBroadcastAt = Date.now()
      io.emit('gsi-data', { ...gamedata, settings, match })
    }
  } catch (error) {
    console.error('处理 GSI 数据失败：', error)
  } finally {
    gsiBroadcastRunning = false
    if (pendingGSIData) void broadcastLatestGSIData()
  }
}

// 始终只保留尚未处理的最新一帧，避免 GSI 高频输入阻塞管理端 IPC。
GSI.on('data', (data) => {
  pendingGSIData = data as unknown as GSIData
  void broadcastLatestGSIData()
})

const PORT = 5031
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
let shortcutKey = 'Ctrl+Alt+F5'

const getShortcutKey = async () => {
  try {
    const settings = await databaseService.settings.getAll()
    return settings.shortcutKey || 'Ctrl+Alt+F5'
  } catch (error) {
    console.error('Failed to get shortcut key settings:', error)
    return 'Ctrl+Alt+F5'
  }
}

electronApp.whenReady().then(async () => {
  try {
    shortcutKey = await getShortcutKey()
    const ok = globalShortcut.register(shortcutKey, () => {
      emitOverlayRefresh()
      console.log(`${shortcutKey} shortcut pressed, emitted refresh-now on /realtime`)
    })
    if (!ok) {
      console.warn(`Failed to register global shortcut ${shortcutKey}`)
    }
  } catch (err) {
    console.error(`Error registering ${shortcutKey} shortcut:`, err)
  }
})

electronApp.on('will-quit', () => {
  try {
    globalShortcut.unregister(shortcutKey)
    globalShortcut.unregisterAll()
  } catch {}
})
