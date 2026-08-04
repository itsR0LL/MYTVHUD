(() => {
  'use strict'

  const PLAYER_API = '/api/players/'
  const DEFAULT_AVATAR = {
    CT: '/overlay/assets/default-ct-f3624238-KVI9Kqdi.png',
    T: '/overlay/assets/default-t-f42d6f37-Cb1ObOLY.png'
  }
  const LIVE_PHASES = new Set(['live', 'bomb', 'defuse'])
  const KILLFEED_LIFETIME_MS = 7000
  const KILLFEED_MAX_ITEMS = 5
  const RADAR_ZOOM_ALIVE_THRESHOLD = 4
  const avatarCache = new Map()

  let latestData = null
  let economySignature = ''
  let aliveSignature = ''
  let flashSignature = ''
  let radarFrame = 0

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = String(text)
    return node
  }

  function numberValue(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }

  function money(value) {
    return `$${Math.round(numberValue(value)).toLocaleString('zh-CN')}`
  }

  function playerName(player) {
    return player?.infos?.name || player?.name || player?.defaultName || '选手'
  }

  function teamName(team, fallback) {
    return team?.infos?.name || team?.name || fallback
  }

  function stripWeapon(value) {
    if (typeof value !== 'string') return ''
    const name = value.trim()
    return name.startsWith('weapon_') ? name.slice(7) : name
  }

  function firstWeapon(value) {
    return Array.isArray(value) ? value[0] || null : value || null
  }

  function visibleWeapon(player) {
    const primary = firstWeapon(player?.primary_weapon)
    const secondary = firstWeapon(player?.secondary_weapon)
    const fallback = (player?.weapons || []).find(
      (weapon) => !['Knife', 'Grenade', 'C4'].includes(weapon?.type)
    )
    return stripWeapon(primary?.name || secondary?.name || fallback?.name || '') || '—'
  }

  function flashOpacity(value) {
    const flashed = numberValue(value)
    return Math.min(1, flashed <= 1 ? flashed : flashed / 255)
  }

  function grenadeLabel(name) {
    switch (name) {
      case 'flashbang':
        return { text: '闪', className: 'is-flash' }
      case 'smokegrenade':
        return { text: '烟', className: 'is-smoke' }
      case 'molotov':
      case 'incgrenade':
        return { text: '火', className: 'is-fire' }
      case 'hegrenade':
        return { text: '雷', className: '' }
      case 'decoy':
        return { text: '诱', className: '' }
      default:
        return null
    }
  }

  const layer = element('div', 'mytvhud-gameplay-layer')
  layer.id = 'mytvhud-gameplay-layer'
  const economyCT = element('section', 'mytvhud-economy is-ct')
  const economyT = element('section', 'mytvhud-economy is-t')
  const alive = element('section', 'mytvhud-alive')
  const flashCT = element('div', 'mytvhud-flash-row is-ct')
  const flashT = element('div', 'mytvhud-flash-row is-t')
  const flashFocused = element('div', 'mytvhud-flash-focused')
  const killfeed = element('section', 'mytvhud-killfeed')
  layer.append(economyCT, economyT, alive, flashCT, flashT, flashFocused, killfeed)
  document.body.append(layer)

  function updateScale() {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
    layer.style.transform = `scale(${scale})`
  }
  updateScale()
  window.addEventListener('resize', updateScale, { passive: true })

  function economyData(data, side) {
    const players = (data?.players || []).filter((player) => player?.team?.side === side)
    const team = side === 'CT' ? data?.map?.team_ct : data?.map?.team_t
    const rows = players.map((player) => ({
      steamid: player?.steamid || '',
      name: playerName(player),
      money: numberValue(player?.state?.money),
      equipmentValue: numberValue(player?.state?.equip_value),
      weapon: visibleWeapon(player),
      armor: numberValue(player?.state?.armor),
      helmet: player?.state?.helmet === true,
      defusekit: player?.state?.defusekit === true,
      grenades: (player?.grenades || []).map((grenade) => stripWeapon(grenade?.name)).filter(Boolean)
    }))
    return {
      team: teamName(team, side === 'CT' ? 'CT 战队' : 'T 战队'),
      totalMoney: rows.reduce((sum, player) => sum + player.money, 0),
      totalEquipmentValue: rows.reduce((sum, player) => sum + player.equipmentValue, 0),
      consecutiveRoundLosses: numberValue(team?.consecutive_round_losses),
      rows
    }
  }

  function metric(label, value) {
    const wrapper = element('div', 'mytvhud-economy__metric')
    wrapper.append(element('span', '', label), element('strong', '', value))
    return wrapper
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
    for (const player of summary.rows) {
      const row = element('div', 'mytvhud-economy__row')
      const equipment = element('div', 'mytvhud-economy__equipment')
      if (player.armor > 0) {
        equipment.append(
          element('span', 'mytvhud-economy__badge', player.helmet ? '盔甲' : '护甲')
        )
      }
      if (player.defusekit) equipment.append(element('span', 'mytvhud-economy__badge', '钳'))

      const grenades = element('div', 'mytvhud-economy__grenades')
      for (const grenade of player.grenades) {
        const label = grenadeLabel(grenade)
        if (!label) continue
        grenades.append(
          element(
            'span',
            `mytvhud-economy__badge${label.className ? ` ${label.className}` : ''}`,
            label.text
          )
        )
      }
      row.append(
        element('div', 'mytvhud-economy__name', player.name),
        element('div', 'mytvhud-economy__value', money(player.money)),
        element('div', 'mytvhud-economy__value', money(player.equipmentValue)),
        element('div', 'mytvhud-economy__weapon', player.weapon),
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
    const phase = data?.phase_countdowns?.phase
    const players = data?.players || []
    const ct = players.filter(
      (player) => player?.team?.side === 'CT' && numberValue(player?.state?.health) > 0
    ).length
    const t = players.filter(
      (player) => player?.team?.side === 'T' && numberValue(player?.state?.health) > 0
    ).length
    const visible = LIVE_PHASES.has(phase) && ct + t > 0
    let secondary = '存活人数'
    let clutch = false
    if (ct === 1 && t === 1) {
      secondary = '一对一'
      clutch = true
    } else if (ct === 1 && t > 1) {
      secondary = `CT 残局 · 1 对 ${t}`
      clutch = true
    } else if (t === 1 && ct > 1) {
      secondary = `T 残局 · 1 对 ${ct}`
      clutch = true
    }
    const signature = `${visible}|${ct}|${t}|${secondary}`
    if (signature !== aliveSignature) {
      aliveSignature = signature
      const text = element('div', 'mytvhud-alive__text')
      text.append(
        element('div', 'mytvhud-alive__primary', `${ct} 对 ${t}`),
        element('div', 'mytvhud-alive__secondary', secondary)
      )
      alive.replaceChildren(
        element('div', 'mytvhud-alive__count is-ct', ct),
        text,
        element('div', 'mytvhud-alive__count is-t', t)
      )
    }
    alive.classList.toggle('is-visible', visible)
    alive.classList.toggle('is-clutch', clutch)
  }

  async function resolveAvatar(steamid, side) {
    const cacheKey = `${steamid}|${side}`
    if (avatarCache.has(cacheKey)) return avatarCache.get(cacheKey)
    const pending = fetch(`${PLAYER_API}${encodeURIComponent(steamid)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((record) => (typeof record?.avatar === 'string' && record.avatar ? record.avatar : DEFAULT_AVATAR[side]))
      .catch(() => DEFAULT_AVATAR[side])
    avatarCache.set(cacheKey, pending)
    return pending
  }

  function createFlashCard(player, side) {
    const card = element('div', 'mytvhud-flash-card')
    card.dataset.steamid = player?.steamid || ''
    const image = element('img')
    image.alt = ''
    image.src = DEFAULT_AVATAR[side]
    card.append(image)
    if (player?.steamid) {
      resolveAvatar(player.steamid, side).then((avatar) => {
        if (card.dataset.steamid === player.steamid) image.src = avatar
      })
    }
    return card
  }

  function updateFlashRow(container, players, side) {
    const ids = players.map((player) => player?.steamid || '').join('|')
    if (container.dataset.signature !== ids) {
      container.dataset.signature = ids
      container.replaceChildren(...players.map((player) => createFlashCard(player, side)))
    }
    const cards = container.children
    players.forEach((player, index) => {
      const opacity = numberValue(player?.state?.health) > 0 ? flashOpacity(player?.state?.flashed) : 0
      cards[index]?.style.setProperty('--mytvhud-flash-opacity', String(opacity))
    })
  }

  function updateFocusedFlash(player) {
    const steamid = player?.steamid || ''
    const side = player?.team?.side
    if (!steamid || (side !== 'CT' && side !== 'T')) {
      flashFocused.replaceChildren()
      flashFocused.dataset.signature = ''
      return
    }
    const signature = `${steamid}|${side}`
    if (flashFocused.dataset.signature !== signature) {
      flashFocused.dataset.signature = signature
      const image = element('img')
      image.alt = ''
      image.src = DEFAULT_AVATAR[side]
      flashFocused.replaceChildren(image)
      resolveAvatar(steamid, side).then((avatar) => {
        if (flashFocused.dataset.signature === signature) image.src = avatar
      })
    }
    flashFocused.style.setProperty(
      '--mytvhud-flash-opacity',
      String(numberValue(player?.state?.health) > 0 ? flashOpacity(player?.state?.flashed) : 0)
    )
  }

  function updateFlash(data) {
    const players = data?.players || []
    const ct = players.filter((player) => player?.team?.side === 'CT')
    const t = players.filter((player) => player?.team?.side === 'T')
    const signature = players
      .map((player) => `${player?.steamid}:${player?.state?.flashed}:${player?.state?.health}`)
      .join('|')
    if (signature === flashSignature) return
    flashSignature = signature
    updateFlashRow(flashCT, ct, 'CT')
    updateFlashRow(flashT, t, 'T')
    updateFocusedFlash(data?.player)
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
    map.style.setProperty('--mytvhud-radar-icon-scale', '1')
  }

  function updateRadarZoom() {
    radarFrame = 0
    const map = document.querySelector('.radar-container .map-container .map')
    if (!map || !latestData) return
    const phase = latestData?.phase_countdowns?.phase
    const aliveCount = (latestData?.players || []).filter(
      (player) => numberValue(player?.state?.health) > 0
    ).length
    if (!LIVE_PHASES.has(phase) || aliveCount > RADAR_ZOOM_ALIVE_THRESHOLD || aliveCount < 1) {
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
    map.style.setProperty('--mytvhud-radar-icon-scale', (1 / zoom).toFixed(3))
  }

  function scheduleRadarUpdate() {
    if (radarFrame) return
    radarFrame = requestAnimationFrame(() => {
      radarFrame = requestAnimationFrame(updateRadarZoom)
    })
  }

  function sideColor(side) {
    if (side === 'CT') return 'var(--ct-color, #3179e6)'
    if (side === 'T') return 'var(--t-color, #e33261)'
    return '#ffffff'
  }

  function killModifier(label) {
    return element('span', 'mytvhud-killfeed__modifier', label)
  }

  function removeKillfeedItem(item) {
    item.classList.add('is-leaving')
    window.setTimeout(() => item.remove(), 280)
  }

  function addKillfeedItem(payload) {
    if (!payload?.victim || typeof payload.weapon !== 'string') return
    const item = element('article', 'mytvhud-killfeed__item')
    item.style.setProperty('--killer-color', sideColor(payload.killer?.side))
    item.style.setProperty('--victim-color', sideColor(payload.victim?.side))
    item.append(element('span', 'mytvhud-killfeed__name', payload.killer?.name || '世界'))
    if (payload.assister?.name) {
      item.append(element('span', 'mytvhud-killfeed__assist', `+ ${payload.assister.name}`))
    }
    item.append(element('span', 'mytvhud-killfeed__weapon', stripWeapon(payload.weapon) || '—'))
    const modifiers = element('span', 'mytvhud-killfeed__modifiers')
    if (payload.headshot) modifiers.append(killModifier('爆头'))
    if (payload.wallbang) modifiers.append(killModifier('穿透'))
    if (payload.throughSmoke) modifiers.append(killModifier('穿烟'))
    if (payload.noScope) modifiers.append(killModifier('无镜'))
    if (payload.attackerBlind) modifiers.append(killModifier('盲杀'))
    if (payload.attackerInAir) modifiers.append(killModifier('空中'))
    if (payload.assistedFlash) modifiers.append(killModifier('闪光助攻'))
    if (modifiers.childElementCount) item.append(modifiers)
    item.append(element('span', 'mytvhud-killfeed__name', payload.victim.name || '选手'))
    killfeed.prepend(item)
    while (killfeed.childElementCount > KILLFEED_MAX_ITEMS) killfeed.lastElementChild?.remove()
    window.setTimeout(() => removeKillfeedItem(item), KILLFEED_LIFETIME_MS)
  }

  function update(data) {
    latestData = data
    updateEconomy(data)
    updateAlive(data)
    updateFlash(data)
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
  socket.on('kill-feed', addKillfeedItem)
})()
