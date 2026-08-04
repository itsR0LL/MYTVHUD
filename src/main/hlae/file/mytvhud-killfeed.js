// MYTVHUD HLAE 击杀事件桥接脚本。
// 在 HLAE 控制台执行：mirv_script_load "此文件的绝对路径"
{
  const EVENT_HOOK_ID = 'mytvhud/killfeed/game-event/v1'
  const FRAME_HOOK_ID = 'mytvhud/killfeed/frame/v1'
  const WEBSOCKET_ADDRESS = 'ws://localhost:5031/hlae-killfeed?hlae=1'

  class MytvhudWebSocketConnection {
    constructor() {
      this.wsIn = null
      this.wsOut = null
      this.exception = null
      this.closed = true
      this.connecting = false
    }

    async connect() {
      if (this.connecting || this.isConnected()) return
      this.connecting = true
      this.exception = null
      try {
        const websocket = await mirv.connect_async(WEBSOCKET_ADDRESS)
        this.wsIn = websocket.in
        this.wsOut = websocket.out
        this.closed = false
        this.connecting = false
        this.readUntilClosed()
      } catch (error) {
        this.connecting = false
        this.closeWithError(error)
      }
    }

    isConnected() {
      return this.exception === null && this.wsOut !== null && !this.closed
    }

    async readUntilClosed() {
      if (!this.wsIn) return
      try {
        while (true) {
          const message = await this.wsIn.next()
          if (message === null) break
          if (typeof message === 'object') message.consume()
        }
        this.dropHandles()
        this.closed = true
      } catch (error) {
        this.closeWithError(error)
      }
    }

    async send(message) {
      if (!this.wsOut || !this.isConnected()) return
      try {
        await this.wsOut.send(message)
      } catch (error) {
        this.closeWithError(error)
      }
    }

    async flush() {
      if (!this.wsOut || !this.isConnected()) return
      try {
        await this.wsOut.flush()
      } catch (error) {
        this.closeWithError(error)
      }
    }

    closeWithError(error) {
      this.exception = error
      this.dropHandles()
      this.closed = true
      console.error('MYTVHUD 击杀信息连接异常：', error)
    }

    dropHandles() {
      try {
        if (this.wsIn) this.wsIn.drop()
      } catch {
        // 连接已由 HLAE 释放。
      }
      try {
        if (this.wsOut) this.wsOut.drop()
      } catch {
        // 连接已由 HLAE 释放。
      }
      this.wsIn = null
      this.wsOut = null
    }
  }

  function playerSteamId(entityIndex) {
    if (entityIndex === 0xffff) return '0'
    const controller = mirv.getEntityFromIndex(entityIndex + 1)
    if (!controller || !controller.isPlayerController()) return '0'
    return controller.getSteamId().toString()
  }

  function asString(value, fallback) {
    return typeof value === 'string' ? value : fallback
  }

  function asInteger(value, fallback) {
    return Number.isInteger(value) ? value : fallback
  }

  function asBoolean(value) {
    return value === true
  }

  const connection = new MytvhudWebSocketConnection()
  let tick = 0

  mirv.events.gameEvent.off(EVENT_HOOK_ID)
  mirv.events.clientFrameStageNotify.off(FRAME_HOOK_ID)

  mirv.events.gameEvent.on(EVENT_HOOK_ID, (event) => {
    if (event.name !== 'player_death' || !connection.isConnected()) return
    try {
      const raw = JSON.parse(event.data)
      const userid = asInteger(raw.userid, 0xffff)
      const attacker = asInteger(raw.attacker, 0xffff)
      const assister = asInteger(raw.assister, 0xffff)
      const message = {
        type: 'player_death',
        clientTime: Date.now(),
        data: {
          userid,
          attacker,
          assister,
          user_steamid: playerSteamId(userid),
          attacker_steamid: playerSteamId(attacker),
          assister_steamid: playerSteamId(assister),
          assistedflash: asBoolean(raw.assistedflash),
          weapon: asString(raw.weapon, ''),
          weapon_itemid: asString(raw.weapon_itemid, ''),
          weapon_fauxitemid: asString(raw.weapon_fauxitemid, ''),
          weapon_originalowner_xuid: asString(raw.weapon_originalowner_xuid, '0'),
          headshot: asBoolean(raw.headshot),
          dominated: asInteger(raw.dominated, 0),
          revenge: asInteger(raw.revenge, 0),
          wipe: asInteger(raw.wipe, 0),
          attackerblind: asBoolean(raw.attackerblind),
          thrusmoke: asBoolean(raw.thrusmoke),
          noscope: asBoolean(raw.noscope),
          penetrated: asInteger(raw.penetrated, 0),
          noreplay: asBoolean(raw.noreplay),
          attackerinair: asBoolean(raw.attackerinair)
        }
      }
      connection.send(JSON.stringify(message))
    } catch (error) {
      console.error('MYTVHUD 无法处理 player_death：', error)
    }
  })

  mirv.events.clientFrameStageNotify.on(FRAME_HOOK_ID, (event) => {
    if (event.curStage === SOURCESDK_CS2.ClientFrameStage_t.FRAME_START && event.isBefore) {
      if (!connection.isConnected() && !connection.connecting && tick % 64 === 0) {
        connection.connect()
      }
      if (connection.isConnected()) connection.flush()
      tick += 1
      mirv.run_jobs()
      mirv.run_jobs_async()
    }
    if (
      event.curStage === SOURCESDK_CS2.ClientFrameStage_t.FRAME_RENDER_PASS &&
      event.isBefore &&
      connection.isConnected()
    ) {
      connection.flush()
    }
  })

  console.log(`MYTVHUD 击杀信息脚本已加载，正在连接 ${WEBSOCKET_ADDRESS}`)
}
