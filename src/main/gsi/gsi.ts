import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import { CSGOGSI } from 'csgogsi'
import { databaseService, type BaseEntity } from '../database/database'
import { join } from 'path'
import { applyFilters } from './filters'
import { app as electronApp, globalShortcut } from 'electron'
import cors from 'cors'
import { setBPPublisher } from '../bp/bp'
import { publishIntermissionSnapshot, setIntermissionPublisher } from '../intermission/intermission'
import {
  activeMatchFromSnapshot,
  resolveActiveMatchTeamSides,
  type GSIRuntimeContext,
  type ResolvedTeamSides
} from './match-runtime'
import { capturePlayerHeadshotFrame, processActiveMatchFrame } from '../match-session/match-session'
import { getTeamAbbreviation, isBPSequenceComplete, normalizeBPSequence } from '../../shared/bp'
import { isBPMatchType } from '../../shared/match-session'
import {
  getUtilityReplayCaptureDiagnostics,
  initializeUtilityReplayCaptureState,
  processUtilityReplayFrame
} from './utility-replay'
import { LatestFrameProcessor } from './latest-frame-processor'
import { registerGSIResetHooks } from './reset-coordinator'
import {
  initializeIntermissionNextOutput,
  publishIntermissionNextSnapshot
} from '../intermission-next/integration'

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
  reason: string
  gsiMapId: string
  plannedMapIds: string[]
}
type UtilityReplayQueuedFrame = {
  data: GSIData
  receivedAtMs: number
}
type PendingGSIFrame = {
  data: GSIData
  utilityReplaySequence: number
}

let pendingGSIFrame: PendingGSIFrame | null = null
let gsiBroadcastRunning = false
let gsiInputSuspended = false
let gsiBroadcastIdleWaiters: Array<() => void> = []
let lastGSIBroadcastAt = 0
let runtimeSnapshot: RuntimeSnapshot | null = null
let teamResolutionStatus: TeamResolutionStatus = {
  state: 'waiting',
  updatedAt: null,
  teamCT: null,
  teamT: null,
  reason: '等待 CS2 GSI 数据',
  gsiMapId: '',
  plannedMapIds: []
}

setBPPublisher(() => {
  void publishIntermissionNextSnapshot().catch((error: unknown) => {
    console.error('发布统一播出 BP 状态失败：', error)
  })
})

setIntermissionPublisher(() => {
  void publishIntermissionNextSnapshot().catch((error: unknown) => {
    console.error('发布新版赛间状态失败：', error)
  })
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

expressApp.get('/api/gsi/utility-replay-status', (_req, res) => {
  res.json({
    queue: utilityReplayFrameProcessor.getStats(),
    capture: getUtilityReplayCaptureDiagnostics()
  })
})

expressApp.use('/overlay', express.static(join(__dirname, 'overlay/file')))
expressApp.use('/bp', express.static(join(__dirname, 'bp/file'), { index: false }))
void initializeIntermissionNextOutput(expressApp, (eventName, payload) => {
  io.emit(eventName, payload)
}).catch((error: unknown) => {
  console.error('初始化新版赛间输出失败：', error)
})

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

function utilityReplayFramePriority(frame: UtilityReplayQueuedFrame): number {
  if (frame.data.map?.phase === 'gameover') return 2
  if (frame.data.round?.phase === 'freezetime') return 1
  return 0
}

const utilityReplayFrameProcessor = new LatestFrameProcessor<UtilityReplayQueuedFrame>(
  async ({ data, receivedAtMs }) => {
    const snapshot = await loadRuntimeSnapshot()
    const activeMatch = activeMatchFromSnapshot(snapshot.settings, snapshot.matches)
    const context: GSIRuntimeContext = {
      players: snapshot.players,
      teams: snapshot.teams,
      activeMatch
    }
    const resolvedSides = resolveActiveMatchTeamSides(data, context)
    await processUtilityReplayFrame(data, activeMatch, resolvedSides, receivedAtMs)
  },
  (error) => {
    console.error('处理前 30 秒道具回放数据失败：', error)
  },
  (pending, incoming) => {
    const pendingPriority = utilityReplayFramePriority(pending)
    const incomingPriority = utilityReplayFramePriority(incoming)
    return (
      pendingPriority > incomingPriority ||
      (pendingPriority > 0 && pendingPriority === incomingPriority)
    )
  }
)

async function syncActiveMatchScore(
  data: GSIData,
  snapshot: RuntimeSnapshot,
  activeMatch: BaseEntity | null,
  resolvedSides: ResolvedTeamSides | null,
  utilityReplaySequence: number
): Promise<BaseEntity | null> {
  if (data.map?.phase === 'gameover') {
    await utilityReplayFrameProcessor.waitFor(utilityReplaySequence)
  }
  const result = await processActiveMatchFrame(data, activeMatch, resolvedSides, snapshot.players)
  if (!result.match) return null
  snapshot.matches[String(result.match.id)] = result.match
  snapshot.loadedAt = Date.now()
  if (!result.scoreChanged) return result.match
  await publishIntermissionSnapshot()
  return result.match
}

function queueUtilityReplayFrame(data: GSIData, receivedAtMs: number): number {
  return utilityReplayFrameProcessor.submit({ data, receivedAtMs })
}

function updateTeamResolutionStatus(
  data: GSIData,
  context: GSIRuntimeContext,
  resolvedSides: ResolvedTeamSides | null
): void {
  const gsiMapId = typeof data.map?.name === 'string' ? data.map.name : ''
  const plannedMapIds = Array.isArray(context.activeMatch?.maps)
    ? context.activeMatch.maps
        .map((map: unknown) =>
          typeof map === 'object' &&
          map !== null &&
          typeof (map as Record<string, unknown>).name === 'string'
            ? String((map as Record<string, unknown>).name)
            : ''
        )
        .filter(Boolean)
    : []
  const activeMatchType = context.activeMatch?.type
  const hasCompleteBP =
    isBPMatchType(activeMatchType) &&
    isBPSequenceComplete(normalizeBPSequence(context.activeMatch?.bpSequence), activeMatchType)
  if (!context.activeMatch || !gsiMapId || !plannedMapIds.includes(gsiMapId) || !hasCompleteBP) {
    let reason = '当前比赛 BP 尚未完整保存'
    if (!context.activeMatch) reason = '当前没有合法比赛记录'
    else if (!gsiMapId) reason = '当前 GSI 数据尚未包含地图名称'
    else if (!plannedMapIds.includes(gsiMapId)) {
      reason = `GSI 地图 ${gsiMapId} 不属于当前比赛计划`
    }
    teamResolutionStatus = {
      state: 'unresolved',
      updatedAt: Date.now(),
      teamCT: null,
      teamT: null,
      reason,
      gsiMapId,
      plannedMapIds
    }
    return
  }
  if (!resolvedSides) {
    const reason = '无法通过注册选手 SteamID 与所属战队解析 CT/T 对应关系'
    teamResolutionStatus = {
      state: 'unresolved',
      updatedAt: Date.now(),
      teamCT: null,
      teamT: null,
      reason,
      gsiMapId,
      plannedMapIds
    }
    return
  }

  const teamSummary = (id: string): { id: string; name: string } | null => {
    const team = context.teams.find((item) => String(item.id) === id)
    if (!team) return null
    const name = getTeamAbbreviation({
      name: typeof team.name === 'string' ? team.name : '',
      name_ingame: typeof team.name_ingame === 'string' ? team.name_ingame : ''
    })
    return name ? { id, name } : null
  }
  const teamCT = teamSummary(resolvedSides.CT)
  const teamT = teamSummary(resolvedSides.T)
  teamResolutionStatus =
    teamCT && teamT
      ? {
          state: 'resolved',
          updatedAt: Date.now(),
          teamCT,
          teamT,
          reason: '',
          gsiMapId,
          plannedMapIds
        }
      : {
          state: 'unresolved',
          updatedAt: Date.now(),
          teamCT: null,
          teamT: null,
          reason: '已经解析战队 ID，但注册战队数据不完整',
          gsiMapId,
          plannedMapIds
        }
}

async function broadcastLatestGSIData(): Promise<void> {
  if (gsiBroadcastRunning) return
  gsiBroadcastRunning = true

  try {
    while (pendingGSIFrame) {
      const remainingInterval = GSI_BROADCAST_INTERVAL_MS - (Date.now() - lastGSIBroadcastAt)
      if (remainingInterval > 0) await wait(remainingInterval)

      const pendingFrame = pendingGSIFrame
      pendingGSIFrame = null
      const data = pendingFrame.data
      const snapshot = await loadRuntimeSnapshot()
      let activeMatch = activeMatchFromSnapshot(snapshot.settings, snapshot.matches)
      let context: GSIRuntimeContext = {
        players: snapshot.players,
        teams: snapshot.teams,
        activeMatch
      }
      const resolvedSides = resolveActiveMatchTeamSides(data, context)
      updateTeamResolutionStatus(data, context, resolvedSides)
      activeMatch = await syncActiveMatchScore(
        data,
        snapshot,
        activeMatch,
        resolvedSides,
        pendingFrame.utilityReplaySequence
      )
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
    const idleWaiters = gsiBroadcastIdleWaiters
    gsiBroadcastIdleWaiters = []
    for (const resolve of idleWaiters) resolve()
    if (pendingGSIFrame) void broadcastLatestGSIData()
  }
}

function waitForGSIBroadcastIdle(): Promise<void> {
  if (!gsiBroadcastRunning) return Promise.resolve()
  return new Promise((resolve) => {
    gsiBroadcastIdleWaiters.push(resolve)
  })
}

registerGSIResetHooks({
  suspend: async () => {
    gsiInputSuspended = true
    pendingGSIFrame = null
    await utilityReplayFrameProcessor.suspendAndDrain()
    await waitForGSIBroadcastIdle()
    runtimeSnapshot = null
  },
  resume: () => {
    pendingGSIFrame = null
    runtimeSnapshot = null
    utilityReplayFrameProcessor.resume()
    gsiInputSuspended = false
  }
})

// 始终只保留尚未处理的最新一帧，避免 GSI 高频输入阻塞管理端 IPC。
GSI.on('data', (data) => {
  if (gsiInputSuspended) return
  const frame = data as unknown as GSIData
  capturePlayerHeadshotFrame(frame)
  const utilityReplaySequence = queueUtilityReplayFrame(frame, Date.now())
  pendingGSIFrame = { data: frame, utilityReplaySequence }
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
    await initializeUtilityReplayCaptureState()
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
