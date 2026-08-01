;(function startIntermissionNextOutput(window, document) {
  'use strict'

  const runtime = window.IntermissionNextOutputRuntime
  if (!runtime) return
  const outputMode = document.body.dataset.outputMode
  const outputStateUrl = '/api/intermission-next'

  const stage = document.getElementById('stage')
  const pageLayer = document.getElementById('page-layer')
  const brandLayer = document.getElementById('brand-layer')
  const backgroundLayer = document.getElementById('background-layer')
  const connectionState = document.getElementById('connection-state')
  const videoSlots = [
    document.getElementById('background-video-a'),
    document.getElementById('background-video-b')
  ]
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

  let payload = null
  let receivedAtPerformanceMs = performance.now()
  let renderedPageSignature = null
  let activePageId = null
  let lastBackgroundRevision = null
  let lastBackgroundSwitchRevision = null
  let effectiveTransition = null
  let animationFrameId = null
  let utilityReplayView = null
  let mapMediaVisuals = []
  let clockOutputs = []
  let componentOutputs = []
  let enterAnimationOutputs = []
  let componentOutputById = new Map()
  let lastClockUpdateAtMs = Number.NEGATIVE_INFINITY
  const requestedMapMediaFrameEnds = new Set()
  const CLOCK_UPDATE_INTERVAL_MS = 100
  const UTILITY_REPLAY_PAGE_DURATION_MS = 30_000
  const UTILITY_REPLAY_FLASH_DURATION_MS = 250
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
  const TRANSITION_BRAND_URL = '/intermission-next/assets/brand/counter-strike-2-wordmark.svg'
  const EVENT_MARK_URL = '/intermission-next/assets/brand/mytvhud-chicken-mark.svg'
  const TRANSITION_BRAND_PARTS = [
    { id: 'number-2', start: 0 },
    { id: 'strike', start: 0.12 },
    { id: 'counter', start: 0.24 }
  ]
  const brandVectorHook = brandLayer.querySelector('[data-brand-vector-hook]')
  const leftBrandCover = brandLayer.querySelector('.brand-cover-left')
  const rightBrandCover = brandLayer.querySelector('.brand-cover-right')
  let transitionBrandPartNodes = []

  function setStyle(node, property, value) {
    if (!node || node.style.getPropertyValue(property) === value) return
    node.style.setProperty(property, value)
  }

  async function loadTransitionBrand() {
    if (!brandVectorHook) return
    try {
      const response = await window.fetch(TRANSITION_BRAND_URL, { cache: 'force-cache' })
      if (!response.ok) return
      const source = new window.DOMParser().parseFromString(await response.text(), 'image/svg+xml')
      if (source.querySelector('parsererror')) return
      const definitions = source.querySelector('defs')
      const logo = document.createElementNS(SVG_NAMESPACE, 'g')
      logo.setAttribute('data-transition-brand-logo', '')
      logo.setAttribute('transform', 'translate(557.5 457)')
      if (definitions) brandVectorHook.appendChild(document.importNode(definitions, true))
      for (const descriptor of TRANSITION_BRAND_PARTS) {
        const part = source.getElementById(descriptor.id)
        if (!part) return
        const importedPart = document.importNode(part, true)
        importedPart.setAttribute('data-transition-brand-part', descriptor.id)
        logo.appendChild(importedPart)
      }
      brandVectorHook.appendChild(logo)
      transitionBrandPartNodes = TRANSITION_BRAND_PARTS.map((descriptor) => ({
        descriptor,
        node: logo.querySelector(`[data-transition-brand-part="${descriptor.id}"]`)
      })).filter((entry) => entry.node)
    } catch {
      brandVectorHook.replaceChildren()
      transitionBrandPartNodes = []
    }
  }

  function clampUnit(value) {
    return Math.max(0, Math.min(1, value))
  }

  function easeOutCubic(value) {
    return 1 - (1 - clampUnit(value)) ** 3
  }

  function easeInOutCubic(value) {
    const progress = clampUnit(value)
    return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
  }

  function updateTransitionBrandAssembly(progress) {
    if (!brandVectorHook) return
    const normalizedProgress = clampUnit(progress)
    const fadeIn = clampUnit(normalizedProgress / 0.12)
    const fadeOut = clampUnit((1 - normalizedProgress) / 0.18)
    const exitProgress = easeOutCubic((normalizedProgress - 0.82) / 0.18)
    setStyle(brandVectorHook, 'opacity', String(Math.min(fadeIn, fadeOut)))

    for (let index = 0; index < transitionBrandPartNodes.length; index += 1) {
      const { descriptor, node: part } = transitionBrandPartNodes[index]
      const assemblyProgress = easeOutCubic((normalizedProgress - descriptor.start) / 0.5)
      const entryOffset = (1 - assemblyProgress) * (280 + index * 70)
      const exitOffset = exitProgress * 120
      setStyle(part, 'opacity', String(assemblyProgress))
      setStyle(
        part,
        'transform',
        `translate3d(${entryOffset - exitOffset}px, 0, 0) scale(${0.94 + assemblyProgress * 0.06})`
      )
    }
  }

  function serverNowMs() {
    if (!payload) return Date.now()
    return payload.serverNowMs + performance.now() - receivedAtPerformanceMs
  }

  function setConnectionMessage(message, visible) {
    connectionState.textContent = message
    connectionState.classList.toggle('is-visible', visible)
  }

  function resizeStage() {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080)
    setStyle(stage, '--stage-scale', String(scale))
  }

  function element(tagName, className, text) {
    const node = document.createElement(tagName)
    if (className) node.className = className
    if (text !== undefined && text !== null) node.textContent = String(text)
    return node
  }

  function svgElement(tagName, attributes = {}) {
    const node = document.createElementNS(SVG_NAMESPACE, tagName)
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null) node.setAttribute(name, String(value))
    }
    return node
  }

  function append(parent, ...children) {
    for (const child of children) if (child) parent.appendChild(child)
    return parent
  }

  function markEnter(node, group, index, total) {
    node.dataset.enterGroup = group
    node.dataset.enterIndex = String(index ?? 0)
    node.dataset.enterTotal = String(total ?? 1)
    return node
  }

  function markInterleavedRows(firstTable, secondTable, group) {
    const firstRows = [...firstTable.querySelectorAll('tbody tr')]
    const secondRows = [...secondTable.querySelectorAll('tbody tr')]
    const orderedRows = []
    const maximumRows = Math.max(firstRows.length, secondRows.length)
    for (let index = 0; index < maximumRows; index += 1) {
      if (firstRows[index]) orderedRows.push(firstRows[index])
      if (secondRows[index]) orderedRows.push(secondRows[index])
    }
    for (let index = 0; index < orderedRows.length; index += 1) {
      markEnter(orderedRows[index], group, index, orderedRows.length)
    }
  }

  function component(pageId, componentId, content, extraClass) {
    const layout = payload.layout.pages[pageId].components[componentId]
    const wrapper = element(
      'section',
      `broadcast-component component-${componentId}${extraClass ? ` ${extraClass}` : ''}`
    )
    wrapper.dataset.componentId = componentId
    if (layout) {
      wrapper.style.cssText = runtime.componentStyle(layout)
    } else {
      wrapper.style.display = 'none'
    }
    wrapper.appendChild(content)
    return wrapper
  }

  function panel(extraClass) {
    return element('div', `panel${extraClass ? ` ${extraClass}` : ''}`)
  }

  function teamBlock(team, right) {
    const root = element('div', `team${right ? ' is-right' : ''}`)
    if (team.avatar) {
      const image = element('img', 'team-avatar')
      image.src = team.avatar
      image.alt = ''
      image.addEventListener('error', () => image.remove(), { once: true })
      root.appendChild(image)
    }
    root.appendChild(element('div', 'team-name', team.name))
    return root
  }

  function eventMark() {
    const root = element('div', 'event-mark')
    const wordmarkSlot = element('span', 'event-mark-wordmark-slot')
    const wordmark = element('strong', 'event-mark-wordmark', 'MYTV')
    wordmark.dataset.eventMarkPart = 'wordmark'
    wordmarkSlot.appendChild(wordmark)
    const mark = element('img', 'event-mark-icon')
    mark.src = EVENT_MARK_URL
    mark.alt = ''
    mark.width = 160
    mark.height = 155
    mark.dataset.eventMarkPart = 'icon'
    append(root, wordmarkSlot, mark)
    return root
  }

  function refreshMapMediaVisualState(visual) {
    const images = visual.mapMediaImages ?? [...visual.querySelectorAll('.map-media-image')]
    const hasLoadedMedia = images.some((image) => image.dataset.mapMediaReady === 'true')
    const configuredImages = images.filter((image) => image.dataset.mapMediaFileUrl)
    const allConfiguredMediaFailed =
      configuredImages.length > 0 &&
      configuredImages.every((image) => image.dataset.mapMediaFailed === 'true')
    visual.classList.toggle('has-loaded-media', hasLoadedMedia)
    visual.classList.toggle('is-text-only', !hasLoadedMedia && allConfiguredMediaFailed)
  }

  function configureMapMediaImage(image, file) {
    const fileUrl = file ? file.url : ''
    if (image.dataset.mapMediaFileUrl === fileUrl) return
    image.mapMediaFile = file
    image.dataset.mapMediaFileUrl = fileUrl
    image.dataset.mapMediaSource = fileUrl
    image.dataset.mapMediaReady = 'false'
    image.dataset.mapMediaFailed = 'false'
    image.style.opacity = '0'
    if (!file) {
      image.removeAttribute('src')
      return
    }
    image.width = file.width
    image.height = file.height
    image.src = file.url
  }

  function createMapMediaImage(file, role, visual) {
    const image = element('img', `map-media-image is-${role}`)
    image.alt = ''
    image.dataset.mapMediaRole = role
    image.addEventListener('load', () => {
      image.dataset.mapMediaReady = 'true'
      image.dataset.mapMediaFailed = 'false'
      refreshMapMediaVisualState(visual)
    })
    image.addEventListener('error', () => {
      const configuredFile = image.mapMediaFile
      if (!configuredFile) return
      const fallbackSource = runtime.nextMapMediaSource(
        configuredFile,
        image.dataset.mapMediaSource
      )
      if (fallbackSource) {
        image.dataset.mapMediaSource = fallbackSource
        image.src = fallbackSource
        return
      }
      image.dataset.mapMediaReady = 'false'
      image.dataset.mapMediaFailed = 'true'
      image.style.opacity = '0'
      refreshMapMediaVisualState(visual)
    })
    configureMapMediaImage(image, file)
    return image
  }

  function setMapMediaImageRole(image, role) {
    image.classList.toggle('is-current', role === 'current')
    image.classList.toggle('is-preload', role === 'preload')
    image.dataset.mapMediaRole = role
  }

  function syncMapMediaVisualFiles(visual, frame) {
    const images = visual.mapMediaImages ?? [...visual.querySelectorAll('.map-media-image')]
    if (images.length !== 2) return false
    const desiredCurrent = images.find(
      (image) => image.dataset.mapMediaFileUrl === frame.current.url
    )
    const currentSlot = images.find((image) => image.classList.contains('is-current')) ?? images[0]
    const preloadSlot = images.find((image) => image !== currentSlot) ?? images[1]

    if (!desiredCurrent) {
      configureMapMediaImage(preloadSlot, frame.current)
      currentSlot.style.opacity = currentSlot.dataset.mapMediaReady === 'true' ? '1' : '0'
      preloadSlot.style.opacity = '0'
      return false
    }

    const desiredPreloadSlot = images.find((image) => image !== desiredCurrent) ?? preloadSlot
    setMapMediaImageRole(desiredCurrent, 'current')
    setMapMediaImageRole(desiredPreloadSlot, 'preload')
    configureMapMediaImage(desiredPreloadSlot, frame.preload)
    refreshMapMediaVisualState(visual)
    return desiredCurrent.dataset.mapMediaReady === 'true'
  }

  function createMapMediaVisual(frame, mapName, extraClass) {
    const visual = element('div', `map-media-visual${extraClass ? ` ${extraClass}` : ''}`)
    visual.dataset.mapMediaMapId = frame.mapId
    visual.dataset.mapMediaPurpose = frame.purpose
    const images = element('div', 'map-media-images')
    const currentImage = createMapMediaImage(frame.current, 'current', visual)
    const preloadImage = createMapMediaImage(frame.preload, 'preload', visual)
    visual.mapMediaImages = [currentImage, preloadImage]
    images.appendChild(currentImage)
    images.appendChild(preloadImage)
    visual.appendChild(images)
    visual.appendChild(element('div', 'map-media-fallback-text', mapName))
    return visual
  }

  function statValue(value) {
    return value === null || value === undefined ? '—' : String(value)
  }

  function createTeamTableTitle(team, side) {
    const title = element('div', `team-table-title is-team-${side}`)
    const name = element('strong', 'team-table-name', team.name)
    if (team.avatar) {
      const image = element('img', 'team-table-avatar')
      image.src = team.avatar
      image.alt = ''
      image.addEventListener('error', () => image.remove(), { once: true })
      append(title, image, name)
    } else {
      title.appendChild(name)
    }
    return title
  }

  function createPlayerTable(team, players, highlightedSteamid, series, side = 'a') {
    const root = element('div', `team-table${series ? ` series-team-table is-team-${side}` : ''}`)
    root.appendChild(createTeamTableTitle(team, side))
    const table = element('table', 'stat-table')
    const head = element('thead')
    const headRow = element('tr')
    const columns = series
      ? side === 'b'
        ? [
            ['地图', 'mapsPlayed'],
            ['爆头率', 'headshotRate'],
            ['D', 'deaths'],
            ['A', 'assists'],
            ['K', 'kills'],
            ['选手', 'name']
          ]
        : [
            ['选手', 'name'],
            ['K', 'kills'],
            ['A', 'assists'],
            ['D', 'deaths'],
            ['爆头率', 'headshotRate'],
            ['地图', 'mapsPlayed']
          ]
      : [
          ['选手', 'name'],
          ['K', 'kills'],
          ['A', 'assists'],
          ['D', 'deaths'],
          ['ADR', 'adr'],
          ['爆头率', 'headshotRate']
        ]
    const columnGroup = element('colgroup')
    const nameColumnWidth = series ? 34 : 38
    const metricColumnWidth = (100 - nameColumnWidth) / (columns.length - 1)
    for (let index = 0; index < columns.length; index += 1) {
      const column = element('col')
      const isNameColumn = columns[index][1] === 'name'
      column.style.width = `${isNameColumn ? nameColumnWidth : metricColumnWidth}%`
      columnGroup.appendChild(column)
    }
    table.appendChild(columnGroup)
    for (const [label] of columns) headRow.appendChild(element('th', '', label))
    head.appendChild(headRow)
    table.appendChild(head)
    const body = element('tbody')
    for (const player of players) {
      const row = element('tr', player.steamid === highlightedSteamid ? 'is-highlighted' : '')
      for (const [, key] of columns) {
        const value = key === 'headshotRate' ? `${statValue(player[key])}%` : statValue(player[key])
        row.appendChild(element('td', '', value))
      }
      body.appendChild(row)
    }
    table.appendChild(body)
    root.appendChild(table)
    return root
  }

  function mapStateText(map, teamA, teamB) {
    if (map.status === 'finished') {
      return map.teamAScore === null || map.teamBScore === null
        ? '已结束'
        : `${map.teamAScore} : ${map.teamBScore}`
    }
    if (map.status === 'live') return '进行中'
    if (map.decider) return '决胜图'
    if (map.pickedByTeamId === teamA.id) return `${teamA.name} 选用`
    if (map.pickedByTeamId === teamB.id) return `${teamB.name} 选用`
    return '待进行'
  }

  function mapSelectionText(map, teamA, teamB) {
    if (map.decider) return '决胜图'
    if (map.pickedByTeamId === teamA.id) return `${teamA.name} 选用`
    if (map.pickedByTeamId === teamB.id) return `${teamB.name} 选用`
    return map.status === 'live' ? '进行中' : '待进行'
  }

  function createMapStripTeam(team, side) {
    const root = element('div', `map-strip-team is-team-${side}`)
    const name = element('strong', 'map-strip-team-name', team.name)
    root.appendChild(name)
    if (team.avatar) {
      const image = element('img', 'map-strip-team-avatar')
      image.alt = ''
      image.addEventListener('load', () => root.classList.add('has-team-avatar'))
      image.addEventListener('error', () => image.remove(), { once: true })
      image.src = team.avatar
      root.appendChild(image)
    }
    return root
  }

  function createMapStrip(data) {
    const strip = element('div', 'map-strip')
    strip.appendChild(createMapStripTeam(data.teamA, 'a'))
    for (const map of data.maps) {
      const card = element('div', `map-strip-card is-${map.status}`)
      const mediaFrame = runtime.findMapMediaFrame(payload.mapMedia, map.mapId, 'sequence')
      if (mediaFrame) {
        card.classList.add('has-map-media')
        card.appendChild(createMapMediaVisual(mediaFrame, map.name, 'map-sequence-media'))
      }
      if (map.status === 'finished' && map.teamAScore !== null && map.teamBScore !== null) {
        if (map.teamAScore > map.teamBScore) card.classList.add('is-won-by-team-a')
        if (map.teamBScore > map.teamAScore) card.classList.add('is-won-by-team-b')
      }
      const meta = element('div', 'map-strip-meta')
      append(
        meta,
        element('strong', 'map-strip-name', map.name),
        element('span', 'map-strip-pick', mapSelectionText(map, data.teamA, data.teamB))
      )
      card.appendChild(meta)
      if (map.status === 'finished') {
        card.appendChild(
          element(
            'strong',
            'map-strip-score score',
            map.teamAScore === null || map.teamBScore === null
              ? '已结束'
              : `${map.teamAScore}-${map.teamBScore}`
          )
        )
      } else if (map.status === 'live') {
        card.appendChild(element('strong', 'map-strip-live', '进行中'))
      }
      strip.appendChild(card)
    }
    strip.appendChild(createMapStripTeam(data.teamB, 'b'))
    return strip
  }

  function createMapReport(data) {
    const root = panel('panel-accent')
    const sourceMap = data.maps.find((map) => map.mapId === data.sourceMapId)
    const report = element('div', 'map-report')
    const head = element('div', 'map-report-head')
    markEnter(head, 'teams')
    head.appendChild(teamBlock(data.teamA, false))
    const score = element('div', 'final-map-score score')
    append(
      score,
      element('span', '', data.finalScore.teamA),
      element('span', 'divider', ':'),
      element('span', '', data.finalScore.teamB)
    )
    head.appendChild(score)
    head.appendChild(teamBlock(data.teamB, true))
    report.appendChild(head)

    const meta = markEnter(element('div', 'map-report-meta'), 'opening')
    const copy = element('div')
    append(
      copy,
      element('div', 'section-kicker', '本图结果'),
      element(
        'div',
        'section-title',
        `${sourceMap ? sourceMap.name : data.sourceMapId} · 本图比赛数据`
      )
    )
    const series = element('div', 'series-score-line')
    append(
      series,
      element('span', '', '系列赛大比分'),
      element('strong', 'score', `${data.seriesScore.teamA} : ${data.seriesScore.teamB}`)
    )
    append(meta, copy, series)
    report.appendChild(meta)

    const grid = element('div', 'report-grid')
    const statsBox = element('div', 'player-stats-box')
    statsBox.appendChild(element('div', 'subhead', '本图选手数据'))
    const dual = element('div', 'dual-player-stats')
    const teamATable = createPlayerTable(
      data.teamA,
      data.teamAPlayers,
      data.highlightedSteamid,
      false,
      'a'
    )
    const teamBTable = createPlayerTable(
      data.teamB,
      data.teamBPlayers,
      data.highlightedSteamid,
      false,
      'b'
    )
    markInterleavedRows(teamATable, teamBTable, 'playerRows')
    append(dual, teamATable, teamBTable)
    statsBox.appendChild(dual)
    grid.appendChild(statsBox)
    report.appendChild(grid)
    root.appendChild(report)
    return root
  }

  function compactCard(kicker, value, suffixNode, mediaFrame) {
    const root = panel()
    if (mediaFrame) {
      root.classList.add('has-map-media')
      root.appendChild(createMapMediaVisual(mediaFrame, value, 'compact-map-media'))
    }
    const body = element('div', 'compact-card')
    const copy = element('div', 'compact-card-copy')
    append(
      copy,
      element('div', 'section-kicker', kicker),
      element('div', 'compact-card-value', value)
    )
    append(body, copy, suffixNode)
    root.appendChild(body)
    return root
  }

  function createWarmupTeams(data) {
    const root = panel('warmup-teams-panel')
    if (!data.teamA || !data.teamB) {
      root.appendChild(element('div', 'warmup-empty-match', '比赛对阵待定'))
      return root
    }
    append(
      root,
      teamBlock(data.teamA, false),
      element('strong', 'warmup-versus', 'VS'),
      teamBlock(data.teamB, true)
    )
    return root
  }

  function createWarmupStatus(data) {
    const status = panel('warmup-status-panel')
    const title = data.matchType ? `${data.matchType} · 比赛准备中` : '赛事暖场'
    const bpLabel =
      data.bpStatus === 'bp_ready'
        ? 'BP 已准备'
        : data.bpStatus === 'bp_pending'
          ? '等待 BP 完成'
          : '等待比赛配置'
    append(
      status,
      element('strong', 'warmup-status-title', title),
      element('span', 'warmup-status-copy', bpLabel)
    )
    return status
  }

  function renderWarmup(data) {
    const page = element('article', 'broadcast-page page-warmup')
    append(
      page,
      markEnter(component('warmup', 'eventBrand', createEventBrand()), 'opening'),
      markEnter(component('warmup', 'matchTeams', createWarmupTeams(data)), 'teams'),
      markEnter(component('warmup', 'matchStatus', createWarmupStatus(data)), 'timing'),
      markEnter(
        component('warmup', 'warmupPrompt', compactCard('即将开始', data.prompt)),
        'timing'
      ),
      markEnter(component('warmup', 'eventMark', eventMark()), 'opening')
    )
    return page
  }

  function renderBP(data) {
    const page = element('article', 'broadcast-page page-bp')
    const core = element('div', 'bp-core-root')
    const coreComponent = component('bp', 'bpCore', core)
    const status = panel('warmup-status-panel')
    append(
      status,
      element('strong', 'warmup-status-title', `${data.matchType} · BP 已完成`),
      element('span', 'warmup-status-copy', data.playbackStarted ? '正在播放' : '等待导播开始')
    )
    const timer = element('strong', 'countdown', '--:--')
    timer.dataset.clockOutput = ''
    append(
      page,
      coreComponent,
      markEnter(component('bp', 'eventBrand', createEventBrand('BAN & PICK')), 'opening'),
      markEnter(component('bp', 'matchTeams', createWarmupTeams(data)), 'opening'),
      markEnter(component('bp', 'matchStatus', status), 'opening'),
      markEnter(component('bp', 'bpTimer', compactCard('BP 播放', '展示进度', timer)), 'opening'),
      markEnter(component('bp', 'eventMark', eventMark()), 'opening')
    )

    const bpRenderer = window.MYTVHUDBPRenderer
    if (bpRenderer && typeof bpRenderer.mount === 'function') {
      bpRenderer.mount(
        core,
        {
          state: {
            version: 1,
            sequence: data.sequence,
            visible: true,
            playbackStarted: data.playbackStarted,
            playbackStartedAtMs: data.playbackStartedAtMs,
            animationEnabled: data.animationEnabled,
            revision: data.playRevision
          },
          match: {
            id: data.matchId,
            type: data.matchType,
            team_a: data.teamA,
            team_b: data.teamB
          }
        },
        { allowAnimation: !data.preview }
      )
    } else {
      core.appendChild(element('div', 'bp-renderer-error', 'BP 核心展示未能载入'))
    }
    return page
  }

  function renderMapBreak(data) {
    const page = element('article', 'broadcast-page page-map-break')
    const mapSequence = markEnter(
      component('map_break', 'mapSequence', createMapStrip(data)),
      'opening'
    )
    const mapReport = component('map_break', 'mapReport', createMapReport(data))
    append(page, mapSequence, mapReport)
    const nextMapValue = data.nextMap ? data.nextMap.name : '系列赛已结束'
    const nextMapMedia = data.nextMap
      ? runtime.findMapMediaFrame(payload.mapMedia, data.nextMap.mapId, 'hero')
      : null
    const nextMap = markEnter(
      component(
        'map_break',
        'nextMap',
        compactCard('下一张地图', nextMapValue, null, nextMapMedia)
      ),
      'opening'
    )
    page.appendChild(nextMap)
    const timer = element('strong', 'countdown', '--:--')
    timer.dataset.clockOutput = ''
    page.appendChild(
      markEnter(
        component('map_break', 'breakTimer', compactCard('地图间休息', '下一阶段准备中', timer)),
        'opening'
      )
    )
    page.appendChild(markEnter(component('map_break', 'eventMark', eventMark()), 'opening'))
    return page
  }

  function winnerTeam(data) {
    if (data.winnerTeamId === data.teamA.id) return data.teamA
    if (data.winnerTeamId === data.teamB.id) return data.teamB
    return null
  }

  function createWinner(data) {
    const root = panel('panel-accent winner-panel')
    const winner = winnerTeam(data)
    if (winner?.avatar) {
      const image = element('img', 'winner-avatar')
      image.src = winner.avatar
      image.alt = ''
      image.addEventListener('error', () => image.remove(), { once: true })
      root.appendChild(image)
    }
    const copy = element('div', 'winner-copy')
    append(
      copy,
      element('div', 'winner-label', winner ? '系列赛获胜方' : '系列赛结束'),
      element(
        'div',
        'winner-name',
        winner ? winner.name : `${data.teamA.name} VS ${data.teamB.name}`
      )
    )
    root.appendChild(copy)
    root.appendChild(element('div', 'winner-trophy', winner ? '系列赛获胜方' : '系列赛结果'))
    return root
  }

  function createFinalSeriesScore(data) {
    const root = panel()
    const score = element('div', 'final-series-score score')
    const teamA = element('div', 'final-series-team is-team-a')
    const teamB = element('div', 'final-series-team is-team-b')
    append(
      teamA,
      element('span', 'final-series-team-name', data.teamA.name),
      element('strong', 'final-series-team-score', data.finalSeriesScore.teamA)
    )
    append(
      teamB,
      element('strong', 'final-series-team-score', data.finalSeriesScore.teamB),
      element('span', 'final-series-team-name', data.teamB.name)
    )
    append(score, teamA, element('span', 'divider', ':'), teamB)
    root.appendChild(score)
    return root
  }

  function createCompletedMapResults(data) {
    const root = panel('list-panel')
    root.appendChild(element('div', 'list-panel-head', '已完成地图'))
    const list = element('div', 'map-result-list')
    const finishedMaps = data.maps.filter((map) => map.status === 'finished')
    if (finishedMaps.length === 0) {
      list.appendChild(element('div', 'timeline-empty', '暂无已确认的地图结果'))
    } else {
      for (const map of finishedMaps) {
        const row = element('div', 'map-result-row')
        if (map.teamAScore !== null && map.teamBScore !== null) {
          if (map.teamAScore > map.teamBScore) row.classList.add('is-won-by-team-a')
          if (map.teamBScore > map.teamAScore) row.classList.add('is-won-by-team-b')
        }
        const copy = element('div', 'map-result-copy')
        append(
          copy,
          element('strong', 'map-result-name', map.name),
          element('span', 'map-result-detail', mapSelectionText(map, data.teamA, data.teamB))
        )
        append(
          row,
          copy,
          element(
            'div',
            'map-result-score score',
            map.teamAScore === null || map.teamBScore === null
              ? '已结束'
              : `${map.teamAScore} : ${map.teamBScore}`
          )
        )
        list.appendChild(row)
      }
    }
    root.appendChild(list)
    return root
  }

  function createMapHistory(data) {
    const root = panel('list-panel')
    root.appendChild(element('div', 'list-panel-head', '系列赛地图历史'))
    const grid = element('div', 'history-grid')
    for (const map of data.maps) {
      const card = element('div', 'history-card')
      const mediaFrame = runtime.findMapMediaFrame(payload.mapMedia, map.mapId, 'sequence')
      if (mediaFrame) {
        card.classList.add('has-map-media')
        card.appendChild(createMapMediaVisual(mediaFrame, map.name, 'history-map-media'))
      }
      const content = element('div', 'history-card-content')
      append(
        content,
        element('strong', '', map.name),
        element('span', '', mapStateText(map, data.teamA, data.teamB))
      )
      card.appendChild(content)
      grid.appendChild(card)
    }
    root.appendChild(grid)
    return root
  }

  function createSeriesPlayerStats(data) {
    const root = panel()
    const stats = element('div', 'series-stats')
    const heading = element('div', 'series-stats-heading')
    append(
      heading,
      element('span', 'series-stats-kicker', '系列赛数据'),
      element('strong', 'series-stats-title', '系列赛选手累计数据')
    )
    const comparison = element('div', 'series-stats-comparison')
    const teamATable = createPlayerTable(
      data.teamA,
      data.teamAPlayers,
      data.highlightedSteamid,
      true,
      'a'
    )
    const teamBTable = createPlayerTable(
      data.teamB,
      data.teamBPlayers,
      data.highlightedSteamid,
      true,
      'b'
    )
    markInterleavedRows(teamATable, teamBTable, 'playerRows')
    append(comparison, teamATable, teamBTable)
    append(stats, heading, comparison)
    root.appendChild(stats)
    return root
  }

  function nextMatchLabel(nextMatch) {
    if (!nextMatch) return '下一场比赛尚未配置'
    const readiness = nextMatch.status === 'bp_ready' ? 'BP 已就绪' : '等待 BP'
    return `${nextMatch.teamA.name} VS ${nextMatch.teamB.name} · ${readiness}`
  }

  function statusCard(label) {
    const root = panel()
    const line = element('div', 'status-line')
    append(line, element('span', 'status-dot'), element('strong', '', label))
    root.appendChild(line)
    return root
  }

  function renderSeriesEnd(data) {
    const page = element('article', 'broadcast-page page-series-end')
    append(
      page,
      markEnter(component('series_end', 'winner', createWinner(data)), 'winner'),
      markEnter(component('series_end', 'finalScore', createFinalSeriesScore(data)), 'finalScore'),
      markEnter(
        component('series_end', 'completedMapResults', createCompletedMapResults(data)),
        'history'
      ),
      markEnter(component('series_end', 'mapHistory', createMapHistory(data)), 'history'),
      component('series_end', 'seriesPlayerStats', createSeriesPlayerStats(data)),
      markEnter(
        component('series_end', 'nextMatchStatus', statusCard(nextMatchLabel(data.nextMatch))),
        'playerRows'
      )
    )
    const timer = element('strong', 'countdown', '--:--')
    timer.dataset.clockOutput = ''
    page.appendChild(
      markEnter(
        component('series_end', 'seriesEndTimer', compactCard('播出阶段', '系列赛结束', timer)),
        'history'
      )
    )
    page.appendChild(markEnter(component('series_end', 'eventMark', eventMark()), 'winner'))
    return page
  }

  function createEventBrand(label) {
    const root = element('div', 'event-brand')
    root.appendChild(element('div', 'event-brand-label', label || '赛事播出待机'))
    root.appendChild(eventMark())
    return root
  }

  function createPreviousResult(data) {
    const root = panel()
    const body = element('div', 'previous-result')
    body.appendChild(element('div', 'section-kicker', '上一场系列赛'))
    if (!data.previousResult) {
      body.appendChild(element('div', 'section-title', '暂无上一场比赛结果'))
    } else {
      const result = data.previousResult
      const score = element('div', 'previous-result-score')
      append(
        score,
        element('span', 'team-name', result.teamA.name),
        element(
          'strong',
          'score',
          `${result.finalSeriesScore.teamA} : ${result.finalSeriesScore.teamB}`
        ),
        element('span', 'team-name', result.teamB.name)
      )
      body.appendChild(score)
    }
    root.appendChild(body)
    return root
  }

  function standbyStatusLabel(data) {
    if (data.nextMatchStatus === 'bp_ready') return '下一场比赛 BP 已就绪'
    if (data.nextMatchStatus === 'bp_pending') return '下一场比赛等待 BP'
    return '下一场比赛尚未配置'
  }

  function createNextTeams(data) {
    const root = panel('panel-accent')
    const body = element('div', 'next-teams')
    if (!data.nextMatch) {
      body.appendChild(element('div'))
      body.appendChild(element('div', 'section-title', '等待下一场对阵信息'))
      body.appendChild(element('div'))
    } else {
      append(
        body,
        teamBlock(data.nextMatch.teamA, false),
        element('div', 'versus', 'VS'),
        teamBlock(data.nextMatch.teamB, true)
      )
    }
    root.appendChild(body)
    return root
  }

  function createStartCountdown() {
    const root = panel()
    const body = element('div', 'large-countdown')
    const timer = element('strong', 'countdown', '--:--')
    timer.dataset.clockOutput = ''
    append(body, element('div', 'section-kicker', '距离下一阶段'), timer)
    root.appendChild(body)
    return root
  }

  function createStandbyPrompt(knownDuration) {
    const root = element('div', 'standby-prompt')
    append(
      root,
      element('div', 'section-kicker', '赛事待机'),
      element('strong', '', knownDuration ? '下一阶段准备中' : '下一场时间待定')
    )
    return root
  }

  function renderStandby(data) {
    const page = element('article', 'broadcast-page page-standby')
    const knownDuration = payload.clock.totalDurationMs > 0
    append(
      page,
      markEnter(component('standby', 'eventBrand', createEventBrand()), 'previous'),
      markEnter(
        component('standby', 'previousSeriesResult', createPreviousResult(data)),
        'previous'
      ),
      markEnter(
        component('standby', 'nextMatchStatus', statusCard(standbyStatusLabel(data))),
        'nextMatch'
      ),
      markEnter(component('standby', 'nextTeams', createNextTeams(data)), 'nextMatch'),
      markEnter(component('standby', 'startCountdown', createStartCountdown()), 'timing'),
      markEnter(
        component('standby', 'standbyPrompt', createStandbyPrompt(knownDuration)),
        'timing'
      ),
      markEnter(component('standby', 'eventMark', eventMark()), 'previous')
    )
    return page
  }

  function utilityReplayPages(data) {
    return [
      { team: data.teamA, teamId: String(data.teamA.id), side: 'CT' },
      { team: data.teamA, teamId: String(data.teamA.id), side: 'T' },
      { team: data.teamB, teamId: String(data.teamB.id), side: 'CT' },
      { team: data.teamB, teamId: String(data.teamB.id), side: 'T' }
    ]
  }

  function utilitySeriesScore(data) {
    return data.page === 'map_break' ? data.seriesScore : data.finalSeriesScore
  }

  function utilityTeamName(team) {
    return team?.name || '待定战队'
  }

  function utilityScoreboard(data) {
    const score = utilitySeriesScore(data)
    const root = element('div', 'utility-scoreboard')
    append(
      root,
      element('strong', 'utility-score-team is-team-a', utilityTeamName(data.teamA)),
      element('span', 'utility-score-value is-team-a', score.teamA),
      element('span', 'utility-score-separator', ':'),
      element('span', 'utility-score-value is-team-b', score.teamB),
      element('strong', 'utility-score-team is-team-b', utilityTeamName(data.teamB))
    )
    return root
  }

  function renderUtilityReplay(data) {
    const replay = payload.utilityReplay
    const page = element('article', 'broadcast-page utility-replay-page')
    utilityReplayView = null
    if (!replay?.complete) {
      append(
        page,
        element('strong', 'utility-unavailable-title', '本图前 30 秒道具回放不可用'),
        element('span', 'utility-unavailable-note', '该地图没有完整记录全部正式回合')
      )
      return page
    }

    const header = element('header', 'utility-header')
    const title = element('div', 'utility-title')
    append(
      title,
      element('span', 'utility-kicker', '本图前 30 秒'),
      element('strong', 'utility-title-value', '')
    )
    const breakClock = element('div', 'utility-break-clock')
    append(
      breakClock,
      element('span', '', '下一张地图倒计时'),
      element(
        'strong',
        '',
        runtime.formatDuration(runtime.playbackClockRemainingMs(payload.clock, serverNowMs()))
      )
    )
    breakClock.hidden = data.page === 'series_end'
    append(header, title, breakClock, utilityScoreboard(data))

    const body = element('div', 'utility-body')
    const radar = element('div', 'utility-radar')
    const radarImage = element('img', 'utility-radar-image')
    radarImage.src = replay.radarAssetPath
    radarImage.alt = ''
    radarImage.draggable = false
    const drawing = svgElement('svg', {
      class: 'utility-radar-drawing',
      viewBox: '0 0 1024 1024',
      'aria-hidden': 'true'
    })
    append(radar, radarImage, drawing)

    const detail = element('aside', 'utility-detail')
    const pageLabel = element('span', 'utility-page-label')
    const pageTitle = element('h1', 'utility-page-title')
    const pageDescription = element(
      'p',
      'utility-page-description',
      '本图全部正式回合 · 烟 / 闪 / 火'
    )
    const roundCount = element('strong', 'utility-round-count')
    const pageClock = element('div', 'utility-page-clock')
    append(pageClock, element('span', '', '回合开局'), element('strong', '', '00:00 / 00:30'))
    const legend = element('div', 'utility-legend')
    for (const [type, label] of [
      ['smoke', '烟雾'],
      ['flash', '闪光'],
      ['fire', '燃烧']
    ]) {
      const item = element('span', `utility-legend-item is-${type}`)
      append(item, element('i', ''), document.createTextNode(label))
      legend.appendChild(item)
    }
    append(detail, pageLabel, pageTitle, pageDescription, roundCount, pageClock, legend)
    append(body, radar, detail)
    append(page, header, body)

    utilityReplayView = {
      replay,
      pages: utilityReplayPages(data),
      title: title.querySelector('.utility-title-value'),
      breakClock: breakClock.querySelector('strong'),
      drawing,
      pageLabel,
      pageTitle,
      roundCount,
      pageClock: pageClock.querySelector('strong'),
      lastPageIndex: -1
    }
    updateUtilityReplay(serverNowMs())
    return page
  }

  function trajectoryVisibleUntil(event) {
    if (event.type === 'smoke') {
      return event.effectEndedAtMs ?? event.endedAtMs ?? UTILITY_REPLAY_PAGE_DURATION_MS
    }
    if (event.type === 'flashbang') {
      return event.explodedAtMs === null
        ? (event.endedAtMs ?? UTILITY_REPLAY_PAGE_DURATION_MS)
        : event.explodedAtMs + UTILITY_REPLAY_FLASH_DURATION_MS
    }
    return (event.endedAtMs ?? UTILITY_REPLAY_PAGE_DURATION_MS) + 500
  }

  function appendTrajectory(drawing, event, pageElapsedMs) {
    if (pageElapsedMs > trajectoryVisibleUntil(event)) return
    const points = event.trajectory.filter((point) => point[0] <= pageElapsedMs)
    if (!points.length) return
    const typeClass =
      event.type === 'flashbang' ? 'flash' : event.type === 'firebomb' ? 'fire' : 'smoke'
    if (points.length > 1) {
      drawing.appendChild(
        svgElement('polyline', {
          class: `utility-trajectory is-${typeClass}`,
          points: points.map((point) => `${point[1]},${point[2]}`).join(' ')
        })
      )
    }
    drawing.appendChild(
      svgElement('circle', {
        class: `utility-origin is-${typeClass}`,
        cx: points[0][1],
        cy: points[0][2],
        r: 7
      })
    )
  }

  function lastTrajectoryPosition(event, timeMs) {
    return event.trajectory.filter((point) => point[0] <= timeMs).at(-1) || null
  }

  function appendSmokeEffect(drawing, event, pageElapsedMs) {
    if (
      event.effectStartedAtMs === null ||
      pageElapsedMs < event.effectStartedAtMs ||
      pageElapsedMs > (event.effectEndedAtMs ?? UTILITY_REPLAY_PAGE_DURATION_MS)
    ) {
      return
    }
    const position = lastTrajectoryPosition(event, event.effectStartedAtMs)
    if (!position) return
    drawing.append(
      svgElement('circle', {
        class: 'utility-effect utility-smoke-effect',
        cx: position[1],
        cy: position[2],
        r: 31
      }),
      svgElement('circle', {
        class: 'utility-landing is-smoke',
        cx: position[1],
        cy: position[2],
        r: 8
      })
    )
  }

  function appendFlashEffect(drawing, event, pageElapsedMs) {
    if (
      event.explodedAtMs === null ||
      pageElapsedMs < event.explodedAtMs ||
      pageElapsedMs >= event.explodedAtMs + UTILITY_REPLAY_FLASH_DURATION_MS
    ) {
      return
    }
    const position = lastTrajectoryPosition(event, event.explodedAtMs)
    if (!position) return
    const effectProgress = (pageElapsedMs - event.explodedAtMs) / UTILITY_REPLAY_FLASH_DURATION_MS
    drawing.appendChild(
      svgElement('circle', {
        class: 'utility-flash-burst',
        cx: position[1],
        cy: position[2],
        r: 12 + effectProgress * 70,
        opacity: 1 - effectProgress
      })
    )
  }

  function appendFireProjectileLanding(drawing, event, pageElapsedMs) {
    if (
      event.endedAtMs === null ||
      pageElapsedMs < event.endedAtMs ||
      pageElapsedMs > event.endedAtMs + 500
    ) {
      return
    }
    const position = lastTrajectoryPosition(event, event.endedAtMs)
    if (!position) return
    drawing.appendChild(
      svgElement('circle', {
        class: 'utility-landing is-fire',
        cx: position[1],
        cy: position[2],
        r: 9
      })
    )
  }

  function appendInfernoEffect(drawing, event, pageElapsedMs) {
    if (
      event.effectStartedAtMs === null ||
      pageElapsedMs < event.effectStartedAtMs ||
      pageElapsedMs > (event.effectEndedAtMs ?? UTILITY_REPLAY_PAGE_DURATION_MS)
    ) {
      return
    }
    const frame = event.flameFrames.filter((item) => item[0] <= pageElapsedMs).at(-1)
    if (!frame) return
    for (const position of frame[1]) {
      drawing.appendChild(
        svgElement('circle', {
          class: 'utility-effect utility-fire-effect',
          cx: position[0],
          cy: position[1],
          r: 11
        })
      )
    }
  }

  function drawUtilityEvents(view, currentPage, pageElapsedMs) {
    const events = view.replay.events.filter(
      (event) => event.teamId === currentPage.teamId && event.side === currentPage.side
    )
    const drawing = svgElement('g')
    for (const event of events) {
      appendTrajectory(drawing, event, pageElapsedMs)
      if (event.type === 'smoke') appendSmokeEffect(drawing, event, pageElapsedMs)
      if (event.type === 'flashbang') appendFlashEffect(drawing, event, pageElapsedMs)
      if (event.type === 'firebomb') appendFireProjectileLanding(drawing, event, pageElapsedMs)
      if (event.type === 'inferno') appendInfernoEffect(drawing, event, pageElapsedMs)
    }
    view.drawing.replaceChildren(drawing)
  }

  function updateUtilityReplay(nowMs) {
    const view = utilityReplayView
    const segment = payload?.activeSegment
    if (!view || segment?.contentType !== 'map_utility_replay') return
    const remainingMs = runtime.playbackClockRemainingMs(payload.clock, nowMs)
    const elapsedMs = Math.max(0, payload.clock.totalDurationMs - (remainingMs ?? 0))
    const segmentElapsedMs = Math.min(
      segment.durationMs,
      Math.max(0, elapsedMs - segment.startOffsetMs)
    )
    const pageIndex = Math.min(
      view.pages.length - 1,
      Math.floor(segmentElapsedMs / UTILITY_REPLAY_PAGE_DURATION_MS)
    )
    const pageElapsedMs =
      pageIndex === view.pages.length - 1 && segmentElapsedMs === segment.durationMs
        ? UTILITY_REPLAY_PAGE_DURATION_MS
        : segmentElapsedMs % UTILITY_REPLAY_PAGE_DURATION_MS
    const currentPage = view.pages[pageIndex]
    const rounds = view.replay.rounds.filter((round) =>
      currentPage.side === 'CT'
        ? round.teamCTId === currentPage.teamId
        : round.teamTId === currentPage.teamId
    )
    if (view.lastPageIndex !== pageIndex) {
      view.lastPageIndex = pageIndex
      view.title.textContent = `${utilityTeamName(currentPage.team)} · ${currentPage.side} 方前 30 秒道具展示`
      view.pageLabel.textContent = `PAGE ${pageIndex + 1} / 4`
      view.pageTitle.textContent = `${utilityTeamName(currentPage.team)} · ${currentPage.side} SIDE`
      view.roundCount.textContent = `叠加 ${rounds.length} 个正式回合`
    }
    if (view.breakClock) view.breakClock.textContent = runtime.formatDuration(remainingMs)
    view.pageClock.textContent = `${runtime.formatDuration(pageElapsedMs)} / 00:30`
    drawUtilityEvents(view, currentPage, pageElapsedMs)
  }

  function renderPage() {
    const data = payload.pageData
    if (window.MYTVHUDBPRenderer && typeof window.MYTVHUDBPRenderer.destroy === 'function') {
      window.MYTVHUDBPRenderer.destroy()
    }
    pageLayer.replaceChildren()
    utilityReplayView = null
    mapMediaVisuals = []
    clockOutputs = []
    componentOutputs = []
    enterAnimationOutputs = []
    componentOutputById = new Map()
    lastClockUpdateAtMs = Number.NEGATIVE_INFINITY
    activePageId = data ? data.page : null
    if (!data) return
    if (data.page === 'warmup') pageLayer.appendChild(renderWarmup(data))
    if (data.page === 'bp') pageLayer.appendChild(renderBP(data))
    if (payload.activeSegment?.contentType === 'map_utility_replay') {
      pageLayer.appendChild(renderUtilityReplay(data))
    }
    if (data.page === 'map_break') pageLayer.appendChild(renderMapBreak(data))
    if (data.page === 'series_end') pageLayer.appendChild(renderSeriesEnd(data))
    if (data.page === 'standby') pageLayer.appendChild(renderStandby(data))

    mapMediaVisuals = [...pageLayer.querySelectorAll('.map-media-visual')]
    clockOutputs = [...pageLayer.querySelectorAll('[data-clock-output]')]
    componentOutputs = [...pageLayer.querySelectorAll('[data-component-id]')]
    componentOutputById = new Map(componentOutputs.map((node) => [node.dataset.componentId, node]))
    enterAnimationOutputs = [...pageLayer.querySelectorAll('[data-enter-group]')].map((node) => ({
      node,
      group: node.dataset.enterGroup,
      index: Number(node.dataset.enterIndex),
      total: Number(node.dataset.enterTotal),
      eventMarks: [...node.querySelectorAll('.event-mark')].map((mark) => ({
        wordmark: mark.querySelector('[data-event-mark-part="wordmark"]'),
        icon: mark.querySelector('[data-event-mark-part="icon"]')
      }))
    }))
  }

  function setVideoAsset(video, asset) {
    const assetId = asset ? asset.id : ''
    if (video.dataset.assetId === assetId) return false
    video.dataset.assetId = assetId
    video.classList.remove('is-failed')
    if (!asset) {
      video.pause()
      video.removeAttribute('src')
      video.load()
      return true
    }
    video.src = asset.streamUrl
    video.preload = 'auto'
    video.muted = !asset.audioEnabled
    video.loop = asset.seamlessLoop
    video.load()
    return true
  }

  function syncVideoTransport(video, asset, status) {
    if (!asset || video.classList.contains('is-failed')) return
    if (status === 'playing') {
      if (video.paused) {
        video.play().catch(() => {
          video.classList.add('is-failed')
        })
      }
    } else if (!video.paused) {
      video.pause()
    }
  }

  function syncVideoPlayback(video, asset, positionMs, status) {
    if (!asset || video.classList.contains('is-failed')) return
    const durationMs = asset.durationMs
    const normalizedPositionMs =
      durationMs > 0 && asset.seamlessLoop ? positionMs % durationMs : positionMs
    const targetSeconds = normalizedPositionMs / 1000
    const setPosition = () => {
      if (Number.isFinite(video.duration)) {
        video.currentTime = Math.min(targetSeconds, Math.max(0, video.duration - 0.05))
      } else {
        video.currentTime = targetSeconds
      }
    }
    if (video.readyState >= 1) setPosition()
    else video.addEventListener('loadedmetadata', setPosition, { once: true })
    syncVideoTransport(video, asset, status)
  }

  function configureBackground() {
    const state = payload.background
    const assignments = runtime.planBackgroundVideoSlots(
      videoSlots.map((video) => video.dataset.assetId || null),
      state
    )
    const positionMs = runtime.backgroundPositionAt(state, serverNowMs())
    for (let index = 0; index < videoSlots.length; index += 1) {
      const video = videoSlots[index]
      const assignment = assignments[index]
      const asset = runtime.resolveAsset(payload.backgroundAssets, assignment.assetId)
      if (assignment.shouldLoad) setVideoAsset(video, asset)
      video.dataset.backgroundRole = assignment.role
      const transitionTargetActive = state.transition?.toAssetId === assignment.assetId
      const transportStatus =
        assignment.role === 'active' || transitionTargetActive ? state.playbackStatus : 'paused'
      if (assignment.shouldSeek) {
        const targetPositionMs = assignment.role === 'active' ? positionMs : 0
        syncVideoPlayback(video, asset, targetPositionMs, transportStatus)
      } else {
        syncVideoTransport(video, asset, transportStatus)
      }
    }
    lastBackgroundRevision = state.revision
    lastBackgroundSwitchRevision = state.switchRevision
  }

  function updateBackgroundFrame(nowMs) {
    const state = payload.background
    backgroundLayer.classList.toggle('is-visible', payload.visible && state.visible)
    if (state.transition) {
      const transitionProgress = runtime.backgroundTransitionProgressAt(state, nowMs)
      for (const video of videoSlots) {
        if (video.dataset.assetId === state.transition.fromAssetId) {
          setStyle(video, 'opacity', String(1 - transitionProgress))
          if (transitionProgress >= 1 && !video.paused) {
            video.pause()
          }
        } else if (video.dataset.assetId === state.transition.toAssetId) {
          setStyle(video, 'opacity', String(transitionProgress))
        } else {
          setStyle(video, 'opacity', '0')
        }
      }
    } else {
      for (const video of videoSlots) {
        setStyle(
          video,
          'opacity',
          state.activeAssetId && video.dataset.assetId === state.activeAssetId ? '1' : '0'
        )
      }
    }
  }

  function updateMapMediaFrame(nowMs) {
    for (const visual of mapMediaVisuals) {
      const frame = runtime.findMapMediaFrame(
        payload.mapMedia,
        visual.dataset.mapMediaMapId,
        visual.dataset.mapMediaPurpose
      )
      if (!frame) continue
      const frameFileKey = `${frame.current.url}|${frame.preload?.url ?? ''}`
      if (visual.dataset.mapMediaFrameKey !== frameFileKey) {
        if (syncMapMediaVisualFiles(visual, frame)) {
          visual.dataset.mapMediaFrameKey = frameFileKey
        } else {
          delete visual.dataset.mapMediaFrameKey
        }
      }
      const images = visual.mapMediaImages ?? []
      const currentImage = images.find((image) => image.classList.contains('is-current'))
      const preloadImage = images.find((image) => image.classList.contains('is-preload'))
      const currentReady = currentImage?.dataset.mapMediaReady === 'true'
      const currentMotion = runtime.mapMediaMotionAt(frame, nowMs, reducedMotionQuery.matches)
      const preloadMotion = runtime.mapMediaMotionAt(frame, nowMs, true)
      const preloadReady =
        frame.preload &&
        preloadImage &&
        preloadImage.dataset.mapMediaFileUrl === frame.preload.url &&
        preloadImage.dataset.mapMediaReady === 'true'
      if (currentReady && preloadReady) {
        const opacities = runtime.mapMediaOpacitiesAt(frame, nowMs)
        setStyle(currentImage, 'opacity', String(opacities.current))
        setStyle(preloadImage, 'opacity', String(opacities.preload))
      } else {
        if (currentImage && currentReady) setStyle(currentImage, 'opacity', '1')
        if (preloadImage) setStyle(preloadImage, 'opacity', '0')
      }
      if (currentImage) {
        setStyle(
          currentImage,
          'transform',
          `translate3d(${currentMotion.translateX}%, ${currentMotion.translateY}%, 0) scale(${currentMotion.scale})`
        )
      }
      if (preloadImage) {
        setStyle(
          preloadImage,
          'transform',
          `translate3d(${preloadMotion.translateX}%, ${preloadMotion.translateY}%, 0) scale(${preloadMotion.scale})`
        )
      }
    }
  }

  async function requestOutputState(reason) {
    try {
      const response = await window.fetch(outputStateUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      applyPayload(await response.json())
    } catch {
      setConnectionMessage(
        reason === 'map-media-frame-end'
          ? '地图素材刷新失败，保留预载最终画面'
          : '无法读取本地赛间播出状态',
        true
      )
    }
  }

  function requestDueMapMediaFrames(nowMs) {
    if (outputMode !== 'formal') return
    const dueFrameEnds = runtime.dueMapMediaFrameEnds(
      payload.mapMedia,
      requestedMapMediaFrameEnds,
      nowMs
    )
    for (const frameEndAtMs of dueFrameEnds) {
      requestedMapMediaFrameEnds.add(frameEndAtMs)
      void requestOutputState('map-media-frame-end')
    }
  }

  function updateClock(nowMs) {
    const remainingMs = runtime.playbackClockRemainingMs(payload.clock, nowMs)
    const elapsedMs = Math.max(0, payload.clock.totalDurationMs - (remainingMs ?? 0))
    const text = runtime.formatDuration(remainingMs)
    for (const clock of clockOutputs) {
      if (clock.textContent !== text) clock.textContent = text
    }
    if (activePageId && payload.layout.pages[activePageId]) {
      const pageLayout = payload.layout.pages[activePageId]
      for (const componentNode of componentOutputs) {
        const componentId = componentNode.dataset.componentId
        const configured = Boolean(pageLayout.components[componentId])
        const windows = pageLayout.componentWindows[componentId]
        let active
        if (activePageId === 'bp' && payload.pageData?.page === 'bp') {
          active = runtime.bpComponentWindowActive(
            windows,
            elapsedMs,
            payload.pageData.playbackStarted
          )
        } else {
          active = runtime.componentWindowActive(windows, elapsedMs, payload.clock.totalDurationMs)
        }
        setStyle(componentNode, 'display', configured && active ? 'flex' : 'none')
      }
    }
    if (activePageId === 'standby') {
      const countdownComponent = componentOutputById.get('startCountdown')
      const promptComponent = componentOutputById.get('standbyPrompt')
      const knownDuration = payload.clock.totalDurationMs > 0
      if (countdownComponent) {
        const layout = payload.layout.pages.standby.components.startCountdown
        if (!knownDuration || !layout) setStyle(countdownComponent, 'display', 'none')
      }
      if (promptComponent) {
        const layout = payload.layout.pages.standby.components.standbyPrompt
        if (!layout) setStyle(promptComponent, 'display', 'none')
      }
    }
  }

  function updateInternalPageAnimation(frame, reducedMotion) {
    for (const output of enterAnimationOutputs) {
      const { node } = output
      const progress = runtime.internalEnterProgress(
        activePageId,
        output.group,
        output.index,
        output.total,
        frame,
        reducedMotion
      )
      setStyle(node, 'opacity', String(progress))
      setStyle(node, 'transform', `translate3d(0, ${(1 - progress) * 16}px, 0)`)
      for (const mark of output.eventMarks) {
        const { wordmark, icon } = mark
        const wordmarkProgress = reducedMotion ? 1 : easeOutCubic(progress / 0.72)
        const iconProgress = reducedMotion ? 1 : easeOutCubic((progress - 0.12) / 0.72)
        if (wordmark) {
          setStyle(wordmark, 'opacity', String(wordmarkProgress))
          setStyle(wordmark, 'transform', `translate3d(${(1 - wordmarkProgress) * 72}px, 0, 0)`)
        }
        if (icon) {
          setStyle(icon, 'opacity', String(iconProgress))
          setStyle(
            icon,
            'transform',
            `translate3d(${(1 - iconProgress) * 128}px, 0, 0) scale(${0.9 + iconProgress * 0.1})`
          )
        }
      }
    }
  }

  function updateTransition(nowMs) {
    const frame = runtime.transitionFrameAt(effectiveTransition, payload.transitionTimings, nowMs)
    const reducedMotion = reducedMotionQuery.matches
    const exiting = frame.phase === 'page_exit' || frame.phase === 'brand_exit'
    const invalidAnimationFallback =
      payload.visible &&
      payload.pageData &&
      frame.phase === 'hidden' &&
      effectiveTransition &&
      effectiveTransition.pageId === payload.pageData.page &&
      effectiveTransition.exitStartedAtMs === null
    const pageVisual = runtime.pageTransitionVisual(frame, reducedMotion, invalidAnimationFallback)
    const pageOpacity = payload.visible ? pageVisual.opacity : 0
    setStyle(pageLayer, 'opacity', String(pageOpacity))
    setStyle(pageLayer, 'transform', `translate3d(0, ${pageVisual.translateY}px, 0)`)
    pageLayer.classList.toggle('is-ready', pageOpacity > 0)
    pageLayer.classList.toggle('is-exiting', payload.visible && !reducedMotion && exiting)
    updateInternalPageAnimation(frame, reducedMotion)
    if (!payload.visible || frame.phase === 'hidden') {
      pageLayer.classList.remove('is-ready', 'is-exiting')
    }

    const remainingMs = runtime.playbackClockRemainingMs(payload.clock, nowMs)
    const elapsedMs = Math.max(0, payload.clock.totalDurationMs - (remainingMs ?? 0))
    const timelineTransition = activePageId
      ? runtime.activeTimelineTransition(payload.layout.pages[activePageId]?.transitions, elapsedMs)
      : null
    const backgroundSwitchActive =
      payload.visible &&
      payload.background.visible &&
      payload.background.transition !== null &&
      !reducedMotion
    if ((timelineTransition || backgroundSwitchActive) && payload.visible && !reducedMotion) {
      const progress = timelineTransition
        ? clampUnit((elapsedMs - timelineTransition.startOffsetMs) / timelineTransition.durationMs)
        : runtime.backgroundTransitionProgressAt(payload.background, nowMs)
      brandLayer.classList.add('is-active')
      brandLayer.dataset.mode = 'background-switch'
      brandLayer.dataset.phase = 'background-switch'
      setStyle(brandLayer, '--phase-progress', String(progress))
      updateTransitionBrandAssembly(progress)
      return
    }

    brandLayer.dataset.mode = 'page'
    if (brandVectorHook) setStyle(brandVectorHook, 'opacity', '')
    const brandActive =
      payload.visible &&
      !reducedMotion &&
      (frame.phase === 'brand_cover' ||
        frame.phase === 'background_reveal' ||
        frame.phase === 'page_enter' ||
        frame.phase === 'page_exit' ||
        frame.phase === 'brand_exit')
    brandLayer.classList.toggle('is-active', brandActive)
    brandLayer.dataset.phase = frame.phase
    setStyle(brandLayer, '--phase-progress', String(frame.progress))
    let leftOffset = -100
    let rightOffset = 100
    const coverProgress = easeInOutCubic(frame.progress)
    if (frame.phase === 'brand_cover' || frame.phase === 'page_exit') {
      leftOffset = -100 + coverProgress * 100
      rightOffset = 100 - coverProgress * 100
    } else if (frame.phase === 'background_reveal' || frame.phase === 'brand_exit') {
      leftOffset = -coverProgress * 100
      rightOffset = coverProgress * 100
    }
    setStyle(leftBrandCover, 'transform', `translate3d(${leftOffset}%, 0, 0)`)
    setStyle(rightBrandCover, 'transform', `translate3d(${rightOffset}%, 0, 0)`)
  }

  function tick() {
    if (payload) {
      try {
        const nowMs = serverNowMs()
        updateBackgroundFrame(nowMs)
        updateMapMediaFrame(nowMs)
        requestDueMapMediaFrames(nowMs)
        updateTransition(nowMs)
        if (nowMs - lastClockUpdateAtMs >= CLOCK_UPDATE_INTERVAL_MS) {
          updateClock(nowMs)
          lastClockUpdateAtMs = nowMs
        }
        updateUtilityReplay(nowMs)
      } catch {
        pageLayer.classList.add('is-ready')
        pageLayer.classList.remove('is-exiting')
        setStyle(pageLayer, 'opacity', '1')
        setStyle(pageLayer, 'transform', 'translate3d(0, 0, 0)')
        brandLayer.classList.remove('is-active')
        setConnectionMessage('动画状态异常，已保留最终文字画面', true)
      }
    }
    animationFrameId = window.requestAnimationFrame(tick)
  }

  function applyPayload(nextPayload) {
    if (!runtime.isOutputPayload(nextPayload)) {
      setConnectionMessage('收到的赛间播出数据不符合输入合同', true)
      return
    }
    const strictRevisionAccepted = runtime.shouldAcceptPayload(payload, nextPayload)
    const sameRevision = payload && payload.payloadRevision === nextPayload.payloadRevision
    const previewDraftRefresh = outputMode === 'preview' && sameRevision && !strictRevisionAccepted
    if (!strictRevisionAccepted && !previewDraftRefresh) return
    if (sameRevision && strictRevisionAccepted) return
    const previousPayload = payload
    const nextPlayRevision = nextPayload.playRevision
    const nextPageSignature = runtime.pageRenderSignature(nextPayload)

    effectiveTransition = runtime.transitionStateForPayload(
      previousPayload ? previousPayload.playRevision : null,
      effectiveTransition,
      nextPlayRevision,
      nextPayload.transition
    )
    payload = nextPayload
    receivedAtPerformanceMs = performance.now()
    if (nextPageSignature !== renderedPageSignature) {
      renderPage()
      renderedPageSignature = nextPageSignature
    }
    if (
      lastBackgroundRevision !== nextPayload.background.revision ||
      lastBackgroundSwitchRevision !== nextPayload.background.switchRevision
    ) {
      configureBackground()
    }
    setConnectionMessage('', false)
  }

  for (const video of videoSlots) {
    video.addEventListener('error', () => video.classList.add('is-failed'))
  }

  window.addEventListener('resize', resizeStage)
  reducedMotionQuery.addEventListener('change', () => {
    if (payload) updateTransition(serverNowMs())
  })

  resizeStage()
  void loadTransitionBrand()
  if (outputMode === 'formal') {
    if (typeof window.io === 'function') {
      const socket = window.io()
      socket.on(runtime.SOCKET_EVENT, (nextPayload) => applyPayload(nextPayload))
      socket.on('connect', () => setConnectionMessage('', false))
      socket.on('disconnect', () => setConnectionMessage('本地服务连接中断，保留最后一帧', true))
    } else {
      setConnectionMessage('等待本地服务连接', true)
    }
    void requestOutputState('initial')
  } else if (outputMode === 'preview') {
    const parentOrigin = new URLSearchParams(window.location.search).get('parentOrigin')
    if (!parentOrigin || window.parent === window) {
      setConnectionMessage('预览入口缺少有效的 parentOrigin', true)
    } else {
      window.addEventListener('message', (event) => {
        const message = event.data
        if (
          event.source === window.parent &&
          event.origin === parentOrigin &&
          message &&
          message.type === runtime.PREVIEW_MESSAGE
        ) {
          applyPayload(message.payload)
        }
      })
      setConnectionMessage('等待管理端预览数据', true)
    }
  } else {
    setConnectionMessage('未知输出模式', true)
  }
  if (animationFrameId === null) tick()
})(window, document)
