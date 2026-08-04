import type { IncomingMessage, Server as HttpServer } from 'node:http'
import type { Duplex } from 'node:stream'
import type { CSGOGSI, KillEvent, Player } from 'csgogsi'
import { WebSocket, WebSocketServer } from 'ws'
import { parseHlaePlayerDeathMessage } from '../../shared/gameplay-hud'

export interface KillFeedPlayer {
  steamid: string
  name: string
  side: 'CT' | 'T' | ''
}

export interface KillFeedPayload {
  id: string
  receivedAt: number
  killer: KillFeedPlayer | null
  victim: KillFeedPlayer
  assister: KillFeedPlayer | null
  weapon: string
  headshot: boolean
  wallbang: boolean
  throughSmoke: boolean
  noScope: boolean
  attackerBlind: boolean
  attackerInAir: boolean
  assistedFlash: boolean
}

export interface HlaeKillfeedStatus {
  state: 'waiting' | 'connected' | 'disconnected' | 'error'
  connectedAt: number | null
  disconnectedAt: number | null
  lastEventAt: number | null
  receivedEvents: number
  rejectedMessages: number
  lastError: string
  scriptUrl: string
  websocketUrl: string
}

const HLAE_WEBSOCKET_PATH = '/hlae-killfeed'

function playerPayload(player: Player): KillFeedPlayer {
  return {
    steamid: player.steamid,
    name: player.name,
    side: player.team?.side === 'CT' || player.team?.side === 'T' ? player.team.side : ''
  }
}

function killPayload(kill: KillEvent, receivedAt: number): KillFeedPayload {
  return {
    id: `${receivedAt}-${kill.victim.steamid}-${kill.weapon}`,
    receivedAt,
    killer: kill.killer ? playerPayload(kill.killer) : null,
    victim: playerPayload(kill.victim),
    assister: kill.assister ? playerPayload(kill.assister) : null,
    weapon: kill.weapon,
    headshot: kill.headshot,
    wallbang: kill.wallbang,
    throughSmoke: kill.thrusmoke,
    noScope: kill.noscope,
    attackerBlind: kill.attackerblind,
    attackerInAir: kill.attackerinair,
    assistedFlash: kill.flashed
  }
}

export class HlaeKillfeedBridge {
  private readonly websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    perMessageDeflate: false
  })
  private activeSocket: WebSocket | null = null
  private status: HlaeKillfeedStatus = {
    state: 'waiting',
    connectedAt: null,
    disconnectedAt: null,
    lastEventAt: null,
    receivedEvents: 0,
    rejectedMessages: 0,
    lastError: '',
    scriptUrl: 'http://localhost:5031/hlae/mytvhud-killfeed.js',
    websocketUrl: 'ws://localhost:5031/hlae-killfeed?hlae=1'
  }

  constructor(
    server: HttpServer,
    private readonly gsi: CSGOGSI,
    private readonly publish: (payload: KillFeedPayload) => void
  ) {
    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const requestUrl = new URL(
        request.url || '/',
        `http://${request.headers.host || 'localhost'}`
      )
      if (requestUrl.pathname !== HLAE_WEBSOCKET_PATH) return
      if (requestUrl.searchParams.get('hlae') !== '1') {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      this.websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        this.websocketServer.emit('connection', websocket, request)
      })
    })

    this.websocketServer.on('connection', (socket) => this.handleConnection(socket))
  }

  getStatus(): HlaeKillfeedStatus {
    return { ...this.status }
  }

  private handleConnection(socket: WebSocket): void {
    if (this.activeSocket && this.activeSocket.readyState === WebSocket.OPEN) {
      this.activeSocket.close(1008, '新的 HLAE 数据源已连接')
    }
    this.activeSocket = socket
    this.status = {
      ...this.status,
      state: 'connected',
      connectedAt: Date.now(),
      disconnectedAt: null,
      lastError: ''
    }

    socket.on('message', (buffer, isBinary) => {
      if (isBinary) {
        this.reject('拒绝二进制 HLAE 消息')
        return
      }
      try {
        const parsed = JSON.parse(buffer.toString()) as unknown
        const rawKill = parseHlaePlayerDeathMessage(parsed)
        if (!rawKill) {
          this.reject('HLAE 击杀消息字段不完整')
          return
        }
        const kill = this.gsi.digestMIRV(rawKill, 'player_death') as KillEvent | null
        if (!kill || !('victim' in kill)) {
          this.reject('HLAE 击杀事件未匹配到当前 GSI 选手')
          return
        }
        const receivedAt = Date.now()
        this.status = {
          ...this.status,
          state: 'connected',
          lastEventAt: receivedAt,
          receivedEvents: this.status.receivedEvents + 1,
          lastError: ''
        }
        this.publish(killPayload(kill, receivedAt))
      } catch (error) {
        this.reject(error instanceof Error ? error.message : String(error))
      }
    })

    socket.on('close', () => {
      if (this.activeSocket !== socket) return
      this.activeSocket = null
      this.status = {
        ...this.status,
        state: 'disconnected',
        disconnectedAt: Date.now()
      }
    })

    socket.on('error', (error) => {
      this.status = {
        ...this.status,
        state: 'error',
        lastError: error.message
      }
    })
  }

  private reject(reason: string): void {
    this.status = {
      ...this.status,
      rejectedMessages: this.status.rejectedMessages + 1,
      lastError: reason
    }
  }
}
