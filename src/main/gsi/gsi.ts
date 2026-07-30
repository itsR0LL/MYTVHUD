import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import { CSGOGSI } from 'csgogsi'
import { databaseService, type BaseEntity } from '../database/database'
import { join } from 'path'
import { applyFilters } from './filters'
import { app as electronApp, globalShortcut } from 'electron'
import cors from 'cors'
import { getBPPayload, setBPPublisher } from '../bp/bp'
import {
  getIntermissionPayload,
  publishIntermissionSnapshot,
  setIntermissionPublisher
} from '../intermission/intermission'
import {
  activeMatchFromSnapshot,
  buildActiveMatchScoreUpdate,
  resolveActiveMatchTeamSides,
  type GSIRuntimeContext,
  type ResolvedTeamSides
} from './match-runtime'

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
const GSI_BROADCAST_INTERVAL_MS = 50
const GSI_RUNTIME_SNAPSHOT_INTERVAL_MS = 500
type GSIData = Parameters<typeof applyFilters>[0]
type RuntimeSnapshot = {
  settings: Record<string, any>
  matches: Record<string, BaseEntity>
  players: BaseEntity[]
  teams: BaseEntity[]
  loadedAt: number
}
type TeamResolutionStatus = {
  state: 'waiting' | 'resolved' | 'unresolved'
  updatedAt: number | null
  teamCT: { id: string; name: string } | null
  teamT: { id: string; name: string } | null
}

let pendingGSIData: GSIData | null = null
let gsiBroadcastRunning = false
let lastGSIBroadcastAt = 0
let runtimeSnapshot: RuntimeSnapshot | null = null
let teamResolutionStatus: TeamResolutionStatus = {
  state: 'waiting',
  updatedAt: null,
  teamCT: null,
  teamT: null
}

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
    const player = players.find((item) => item.steamid === steamid)
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

expressApp.get('/api/gsi/team-resolution', (_req, res) => {
  res.json(teamResolutionStatus)
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

async function loadRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  const now = Date.now()
  if (runtimeSnapshot && now - runtimeSnapshot.loadedAt < GSI_RUNTIME_SNAPSHOT_INTERVAL_MS) {
    return runtimeSnapshot
  }

  const [settings, matches, players, teams] = await Promise.all([
    databaseService.settings.getAll(),
    databaseService.matchs.getAll(),
    databaseService.players.getAll(),
    databaseService.teams.getAll()
  ])
  runtimeSnapshot = { settings, matches, players, teams, loadedAt: now }
  return runtimeSnapshot
}

async function syncActiveMatchScore(
  data: GSIData,
  snapshot: RuntimeSnapshot,
  activeMatch: BaseEntity | null,
  resolvedSides: ResolvedTeamSides | null
): Promise<BaseEntity | null> {
  const updatedMatch = buildActiveMatchScoreUpdate(data, activeMatch, resolvedSides)
  if (!updatedMatch) return activeMatch

  await databaseService.matchs.modify(String(updatedMatch.id), { maps: updatedMatch.maps })
  snapshot.matches[String(updatedMatch.id)] = updatedMatch
  snapshot.loadedAt = Date.now()
  await publishIntermissionSnapshot()
  return updatedMatch
}

function updateTeamResolutionStatus(
  context: GSIRuntimeContext,
  resolvedSides: ResolvedTeamSides | null
): void {
  if (!resolvedSides) {
    teamResolutionStatus = {
      state: 'unresolved',
      updatedAt: Date.now(),
      teamCT: null,
      teamT: null
    }
    return
  }

  const teamSummary = (id: string): { id: string; name: string } | null => {
    const team = context.teams.find((item) => String(item.id) === id)
    if (!team || typeof team.name !== 'string') return null
    return { id, name: team.name }
  }
  const teamCT = teamSummary(resolvedSides.CT)
  const teamT = teamSummary(resolvedSides.T)
  teamResolutionStatus =
    teamCT && teamT
      ? { state: 'resolved', updatedAt: Date.now(), teamCT, teamT }
      : { state: 'unresolved', updatedAt: Date.now(), teamCT: null, teamT: null }
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
      const snapshot = await loadRuntimeSnapshot()
      let activeMatch = activeMatchFromSnapshot(snapshot.settings, snapshot.matches)
      let context: GSIRuntimeContext = {
        players: snapshot.players,
        teams: snapshot.teams,
        activeMatch
      }
      const resolvedSides = resolveActiveMatchTeamSides(data, context)
      updateTeamResolutionStatus(context, resolvedSides)
      activeMatch = await syncActiveMatchScore(data, snapshot, activeMatch, resolvedSides)
      context = { ...context, activeMatch }
      const gamedata = await applyFilters(data, context)
      const match = activeMatch ? { [String(activeMatch.id)]: activeMatch } : {}
      lastGSIBroadcastAt = Date.now()
      // HUD 只需要最新状态。连接繁忙时丢弃旧帧，避免 OBS 的 Socket 缓冲区持续累积延迟。
      io.volatile.emit('gsi-data', { ...gamedata, settings: snapshot.settings, match })
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
