;(() => {
  'use strict'

  const gameplayCore = window.MYTVHUDGameplayCore
  if (!gameplayCore) {
    console.error('MYTVHUD 比赛 HUD 增强层无法启动：核心数据模块未加载。')
    return
  }
  const {
    activeMatch,
    aliveData,
    economyData,
    finishedMapWins,
    flashOpacity,
    identifier,
    isLivePhase,
    numberValue,
    sidebarPlayers,
    stripWeapon
  } = gameplayCore
  const RADAR_ZOOM_ALIVE_THRESHOLD = 4
  const RADAR_PLAYER_BASE_SCALE = 0.78
  const ECONOMY_ICON_ROOT = '/overlay/economy-icons'
  const ARMOR_ICON_URL = `${ECONOMY_ICON_ROOT}/armor.png`
  const HELMET_ICON_URL = `${ECONOMY_ICON_ROOT}/helmet.png`
  const DEFUSE_ICON_URL = `${ECONOMY_ICON_ROOT}/defuse.png`
  const GRENADE_LABELS = Object.freeze({
    decoy: '诱饵弹',
    flashbang: '闪光弹',
    hegrenade: '高爆手雷',
    incgrenade: '燃烧弹',
    molotov: '燃烧瓶',
    smokegrenade: '烟雾弹'
  })
  let latestData = null
  let economySignature = ''
  let aliveSignature = ''
  let flashSignature = ''
  let radarFrame = 0
  let vueHudFrame = 0

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = String(text)
    return node
  }

  function money(value) {
    return `$${Math.round(numberValue(value)).toLocaleString('zh-CN')}`
  }

  const layer = element('div', 'mytvhud-gameplay-layer')
  layer.id = 'mytvhud-gameplay-layer'
  const economyCT = element('section', 'mytvhud-economy is-ct')
  const economyT = element('section', 'mytvhud-economy is-t')
  const alive = element('section', 'mytvhud-alive')
  layer.append(economyCT, economyT, alive)
  document.body.append(layer)

  function updateScale() {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
    layer.style.transform = `scale(${scale})`
  }
  updateScale()
  window.addEventListener('resize', updateScale, { passive: true })

  function metric(label, value) {
    const wrapper = element('div', 'mytvhud-economy__metric')
    wrapper.append(element('span', '', label), element('strong', '', value))
    return wrapper
  }

  function hudIcon(source, label) {
    const image = element('img', 'mytvhud-economy__hud-icon')
    image.src = source
    image.alt = label
    image.draggable = false
    return image
  }

  function economyIcon(name, label, className) {
    const iconName = stripWeapon(name)
    if (!/^[a-z0-9_]+$/.test(iconName)) return null
    const image = element('img', className)
    image.src = `${ECONOMY_ICON_ROOT}/${iconName}.svg`
    image.alt = label
    image.draggable = false
    image.addEventListener('error', () => image.remove(), { once: true })
    return image
  }

  function renderEconomyPanel(container, summary) {
    const header = element('header', 'mytvhud-economy__summary')
    header.append(
      element('div', 'mytvhud-economy__team', summary.team),
      metric('现金', money(summary.totalMoney)),
      metric('装备', money(summary.totalEquipmentValue)),
      metric('连败', summary.consecutiveRoundLosses)
    )
    const rows = element('div', 'mytvhud-economy__rows')
    for (const [index, player] of summary.rows.entries()) {
      const row = element('div', 'mytvhud-economy__row')
      row.dataset.playerIndex = String(index)
      const equipment = element('div', 'mytvhud-economy__equipment')
      if (player.armor > 0) {
        equipment.append(
          hudIcon(player.helmet ? HELMET_ICON_URL : ARMOR_ICON_URL, player.helmet ? '头盔' : '护甲')
        )
      }
      if (player.defusekit) equipment.append(hudIcon(DEFUSE_ICON_URL, '拆弹器'))

      const weapon = element('div', 'mytvhud-economy__weapon-icon')
      const weaponImage = economyIcon(
        player.weapon,
        player.weapon || '武器',
        'mytvhud-economy__item-icon is-weapon'
      )
      if (weaponImage) weapon.append(weaponImage)

      const grenades = element('div', 'mytvhud-economy__grenades')
      for (const grenade of player.grenades) {
        const grenadeImage = economyIcon(
          grenade,
          GRENADE_LABELS[grenade] || grenade,
          `mytvhud-economy__item-icon is-grenade is-${grenade}`
        )
        if (grenadeImage) grenades.append(grenadeImage)
      }
      row.append(
        element('div', 'mytvhud-economy__name', player.name),
        element('div', 'mytvhud-economy__value', money(player.money)),
        element('div', 'mytvhud-economy__value', money(player.equipmentValue)),
        weapon,
        equipment,
        grenades
      )
      rows.append(row)
    }
    container.replaceChildren(header, rows)
  }

  function updateEconomy(data) {
    const visible = data?.phase_countdowns?.phase === 'freezetime'
    const ct = economyData(data, 'CT')
    const t = economyData(data, 'T')
    const signature = JSON.stringify([visible, ct, t])
    if (signature !== economySignature) {
      economySignature = signature
      renderEconomyPanel(economyCT, ct)
      renderEconomyPanel(economyT, t)
    }
    economyCT.classList.toggle('is-visible', visible && ct.rows.length > 0)
    economyT.classList.toggle('is-visible', visible && t.rows.length > 0)
  }

  function updateAlive(data) {
    const { visible, ct, t, clutch } = aliveData(data)
    const signature = `${visible}|${ct}|${t}|${clutch}`
    if (signature !== aliveSignature) {
      aliveSignature = signature
      alive.replaceChildren(
        element('div', 'mytvhud-alive__count is-ct', ct),
        element('div', 'mytvhud-alive__versus', 'V'),
        element('div', 'mytvhud-alive__count is-t', t)
      )
    }
    alive.classList.toggle('is-visible', visible)
    alive.classList.toggle('is-clutch', clutch)
    document.documentElement.classList.toggle('mytvhud-clutch-active', visible && clutch)
  }

  function setFlashState(target, opacity) {
    if (!target) return
    target.style.setProperty('--mytvhud-flash-opacity', String(opacity))
    target.classList.toggle('mytvhud-is-flashed', opacity > 0)
  }

  function updateSidebarFlash(data, side) {
    const players = sidebarPlayers(data, side)
    const container = document.querySelector(
      `.players-container > .player-container.${side}:not(.col)`
    )
    const cards = Array.from(container?.querySelectorAll(':scope > .player-for .player-card') || [])
    players.forEach((player, index) => {
      const opacity =
        numberValue(player?.state?.health) > 0 ? flashOpacity(player?.state?.flashed) : 0
      setFlashState(cards[index], opacity)
    })
    for (let index = players.length; index < cards.length; index += 1)
      setFlashState(cards[index], 0)
  }

  function updateFocusedFlash(player) {
    const target = document.querySelector('.player-avatar-container.focused')
    const opacity =
      numberValue(player?.state?.health) > 0 ? flashOpacity(player?.state?.flashed) : 0
    setFlashState(target, opacity)
  }

  function updateFlash(data) {
    const players = data?.players || []
    const signature = players
      .map((player) => `${player?.steamid}:${player?.state?.flashed}:${player?.state?.health}`)
      .join('|')
    if (signature === flashSignature) return
    flashSignature = signature
    updateSidebarFlash(data, 'CT')
    updateSidebarFlash(data, 'T')
    updateFocusedFlash(data?.player)
  }

  function updateSeriesScore(data) {
    const match = activeMatch(data)
    if (!match) return
    const sides = [
      ['CT', data?.map?.team_ct?.infos?.id],
      ['T', data?.map?.team_t?.infos?.id]
    ]
    for (const [side, teamId] of sides) {
      if (!identifier(teamId)) continue
      const wins = finishedMapWins(match.maps, teamId)
      const items = document.querySelectorAll(`.map-score-wrap.${side} .map-score-item`)
      items.forEach((item, index) => item.classList.toggle('win', index < wins))
    }
  }

  function updateVueHud() {
    vueHudFrame = 0
    if (!latestData) return
    flashSignature = ''
    updateFlash(latestData)
    updateSeriesScore(latestData)
  }

  function scheduleVueHudUpdate() {
    if (vueHudFrame) return
    vueHudFrame = requestAnimationFrame(() => {
      vueHudFrame = requestAnimationFrame(updateVueHud)
    })
  }

  function parseMarkerPosition(marker) {
    const transform = marker.style.transform || ''
    const match = transform.match(/translateX\((-?[\d.]+)px\)\s+translateY\((-?[\d.]+)px\)/)
    if (!match) return null
    const x = Number(match[1])
    const y = Number(match[2])
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  }

  function resetRadar(map) {
    map.style.setProperty('--mytvhud-radar-scale', '1')
    map.style.setProperty('--mytvhud-radar-offset-x', '-512px')
    map.style.setProperty('--mytvhud-radar-offset-y', '-512px')
    map.style.setProperty('--mytvhud-radar-player-scale', String(RADAR_PLAYER_BASE_SCALE))
    map.style.setProperty('--mytvhud-radar-object-scale', '1')
  }

  function updateRadarZoom() {
    radarFrame = 0
    const map = document.querySelector('.radar-container .map-container .map')
    if (!map || !latestData) return
    const phase = latestData?.phase_countdowns?.phase
    const players = latestData?.players || []
    const ctAlive = players.filter(
      (player) => player?.team?.side === 'CT' && numberValue(player?.state?.health) > 0
    ).length
    const tAlive = players.filter(
      (player) => player?.team?.side === 'T' && numberValue(player?.state?.health) > 0
    ).length
    const aliveCount = ctAlive + tAlive
    const clutch = (ctAlive === 1 && tAlive >= 1) || (tAlive === 1 && ctAlive >= 1)
    if (
      !isLivePhase(phase) ||
      (!clutch && aliveCount > RADAR_ZOOM_ALIVE_THRESHOLD) ||
      aliveCount < 1
    ) {
      resetRadar(map)
      return
    }

    const markers = Array.from(map.querySelectorAll(':scope > .player.visible:not(.dead)'))
    const bomb = map.querySelector(':scope > .bomb.visible')
    if (bomb) markers.push(bomb)
    const positions = markers.map(parseMarkerPosition).filter(Boolean)
    if (positions.length === 0) {
      resetRadar(map)
      return
    }

    const xs = positions.map((position) => position.x)
    const ys = positions.map((position) => position.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const span = Math.max(maxX - minX, maxY - minY, 300)
    const zoom = Math.min(1.9, Math.max(1.28, 690 / span))
    map.style.setProperty('--mytvhud-radar-scale', zoom.toFixed(3))
    map.style.setProperty('--mytvhud-radar-offset-x', `${(-centerX).toFixed(2)}px`)
    map.style.setProperty('--mytvhud-radar-offset-y', `${(-centerY).toFixed(2)}px`)
    map.style.setProperty(
      '--mytvhud-radar-player-scale',
      (RADAR_PLAYER_BASE_SCALE / zoom).toFixed(3)
    )
    map.style.setProperty('--mytvhud-radar-object-scale', (1 / zoom).toFixed(3))
  }

  function scheduleRadarUpdate() {
    if (radarFrame) return
    radarFrame = requestAnimationFrame(() => {
      radarFrame = requestAnimationFrame(updateRadarZoom)
    })
  }

  function update(data) {
    latestData = data
    updateEconomy(data)
    updateAlive(data)
    scheduleVueHudUpdate()
    scheduleRadarUpdate()
  }

  if (typeof window.io !== 'function') {
    console.error('MYTVHUD 比赛 HUD 增强层无法连接：Socket.IO 客户端未加载。')
    return
  }

  const socket = window.io({
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000
  })
  socket.on('gsi-data', update)
})()
