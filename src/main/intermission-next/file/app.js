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
  const requestedMapMediaFrameEnds = new Set()
  const UTILITY_REPLAY_PAGE_DURATION_MS = 30_000
  const UTILITY_REPLAY_FLASH_DURATION_MS = 250
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
  const TRANSITION_BRAND_URL = '/intermission-next/assets/brand/counter-strike-2-wordmark.svg'
  const TRANSITION_BRAND_PARTS = [
    { id: 'number-2', start: 0 },
    { id: 'strike', start: 0.12 },
    { id: 'counter', start: 0.24 }
  ]
  const brandVectorHook = brandLayer.querySelector('[data-brand-vector-hook]')

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
    } catch {
      brandVectorHook.replaceChildren()
    }
  }

  function clampUnit(value) {
    return Math.max(0, Math.min(1, value))
  }

  function easeOutCubic(value) {
    return 1 - (1 - clampUnit(value)) ** 3
  }

  function updateTransitionBrandAssembly(progress) {
    if (!brandVectorHook) return
    const normalizedProgress = clampUnit(progress)
    const fadeIn = clampUnit(normalizedProgress / 0.12)
    const fadeOut = clampUnit((1 - normalizedProgress) / 0.18)
    const exitProgress = easeOutCubic((normalizedProgress - 0.82) / 0.18)
    brandVectorHook.style.opacity = String(Math.min(fadeIn, fadeOut))

    for (let index = 0; index < TRANSITION_BRAND_PARTS.length; index += 1) {
      const descriptor = TRANSITION_BRAND_PARTS[index]
      const part = brandVectorHook.querySelector(`[data-transition-brand-part="${descriptor.id}"]`)
      if (!part) continue
      const assemblyProgress = easeOutCubic((normalizedProgress - descriptor.start) / 0.5)
      const entryOffset = (1 - assemblyProgress) * (280 + index * 70)
      const exitOffset = exitProgress * 120
      part.style.opacity = String(assemblyProgress)
      part.style.transform = `translateX(${entryOffset - exitOffset}px) scale(${0.94 + assemblyProgress * 0.06})`
      part.style.filter = `blur(${(1 - assemblyProgress) * 5}px)`
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
    stage.style.setProperty('--stage-scale', String(scale))
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
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 360 96')
    svg.setAttribute('aria-hidden', 'true')
    const hook = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    hook.setAttribute('data-event-mark-vector-hook', '')
    svg.appendChild(hook)
    root.appendChild(svg)
    return root
  }

  function createMapMediaImage(file, role, opacity, visual) {
    const image = element('img', `map-media-image is-${role}`)
    image.alt = ''
    image.width = file.width
    image.height = file.height
    image.dataset.mapMediaSource = file.url
    image.src = file.url
    image.style.opacity = String(opacity)
    image.addEventListener('load', () => visual.classList.add('has-loaded-media'))
    image.addEventListener('error', () => {
      const fallbackSource = runtime.nextMapMediaSource(file, image.dataset.mapMediaSource)
      if (fallbackSource) {
        image.dataset.mapMediaSource = fallbackSource
        image.src = fallbackSource
        return
      }
      image.remove()
      const remainingImage = visual.querySelector('.map-media-image')
      if (remainingImage) remainingImage.style.opacity = '1'
      else visual.classList.add('is-text-only')
    })
    return image
  }

  function createMapMediaVisual(frame, mapName, extraClass) {
    const visual = element('div', `map-media-visual${extraClass ? ` ${extraClass}` : ''}`)
    visual.dataset.mapMediaMapId = frame.mapId
    visual.dataset.mapMediaPurpose = frame.purpose
    const images = element('div', 'map-media-images')
    const opacities = runtime.mapMediaOpacitiesAt(frame, serverNowMs())
    images.appendChild(createMapMediaImage(frame.current, 'current', opacities.current, visual))
    if (frame.preload) {
      images.appendChild(createMapMediaImage(frame.preload, 'preload', opacities.preload, visual))
    }
    visual.appendChild(images)
    visual.appendChild(element('div', 'map-media-fallback-text', mapName))
    return visual
  }

  function statValue(value) {
    return value === null || value === undefined ? '—' : String(value)
  }

  function createPlayerTable(team, players, highlightedSteamid, series) {
    const root = element('div', 'team-table')
    root.appendChild(element('div', 'team-table-title', team.name))
    const table = element('table', 'stat-table')
    const head = element('thead')
    const headRow = element('tr')
    const columns = series
      ? [
          ['选手', 'name'],
          ['K', 'kills'],
          ['A', 'assists'],
          ['D', 'deaths'],
          ['MVP', 'mvps'],
          ['得分', 'score'],
          ['地图', 'mapsPlayed']
        ]
      : [
          ['选手', 'name'],
          ['K', 'kills'],
          ['A', 'assists'],
          ['D', 'deaths'],
          ['ADR', 'adr'],
          ['得分', 'score']
        ]
    const columnGroup = element('colgroup')
    const nameColumnWidth = series ? 32 : 38
    const metricColumnWidth = (100 - nameColumnWidth) / (columns.length - 1)
    for (let index = 0; index < columns.length; index += 1) {
      const column = element('col')
      column.style.width = `${index === 0 ? nameColumnWidth : metricColumnWidth}%`
      columnGroup.appendChild(column)
    }
    table.appendChild(columnGroup)
    for (const [label] of columns) headRow.appendChild(element('th', '', label))
    head.appendChild(headRow)
    table.appendChild(head)
    const body = element('tbody')
    for (const player of players) {
      const row = element('tr', player.steamid === highlightedSteamid ? 'is-highlighted' : '')
      for (const [, key] of columns) row.appendChild(element('td', '', statValue(player[key])))
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

  function createMapStrip(data) {
    const strip = element('div', 'map-strip')
    for (const map of data.maps) {
      const card = element('div', `map-strip-card is-${map.status}`)
      card.appendChild(element('div', 'map-strip-name', map.name))
      card.appendChild(element('div', 'map-strip-state', mapStateText(map, data.teamA, data.teamB)))
      strip.appendChild(card)
    }
    return strip
  }

  function createTimeline(data) {
    const box = element('div', 'timeline-box')
    const title = element('div', 'subhead')
    title.appendChild(element('span', '', '真实比分时间线'))
    if (!data.scoreTimelineComplete) {
      title.appendChild(element('span', 'section-note', '回合记录不完整'))
    }
    box.appendChild(title)
    const body = element('div', 'timeline')
    if (data.scoreTimeline.length === 0 || !data.scoreTimelineComplete) {
      append(
        body,
        element(
          'strong',
          'timeline-score is-final',
          `${data.finalScore.teamA}:${data.finalScore.teamB}`
        ),
        element(
          'div',
          'timeline-empty',
          data.scoreTimeline.length === 0
            ? '暂无逐回合比分，保留最终比分展示'
            : '逐回合记录不完整，最终比分仍按已确认数据展示'
        )
      )
    } else {
      const track = element('div', 'timeline-track')
      for (let index = 0; index < data.scoreTimeline.length; index += 1) {
        const point = data.scoreTimeline[index]
        const pointNode = element(
          'div',
          `timeline-point${point.winnerTeamId === data.teamB.id ? ' is-team-b' : ''}`
        )
        markEnter(pointNode, 'scoreTimeline', index, data.scoreTimeline.length)
        append(
          pointNode,
          element('span', 'timeline-score', `${point.teamAScore}:${point.teamBScore}`),
          element('span', 'timeline-dot'),
          element('span', 'timeline-round', `R${point.roundIndex}`)
        )
        track.appendChild(pointNode)
      }
      body.appendChild(track)
    }
    box.appendChild(body)
    return box
  }

  function createMapReport(data, mediaFrame) {
    const root = panel('panel-accent')
    const sourceMap = data.maps.find((map) => map.mapId === data.sourceMapId)
    if (mediaFrame) {
      root.classList.add('has-map-media')
      root.appendChild(
        markEnter(
          createMapMediaVisual(
            mediaFrame,
            sourceMap ? sourceMap.name : data.sourceMapId,
            'map-report-media'
          ),
          'opening'
        )
      )
    }
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
      element('div', 'section-kicker', 'MAP RESULT'),
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
    grid.appendChild(createTimeline(data))
    const statsBox = element('div', 'player-stats-box')
    statsBox.appendChild(element('div', 'subhead', '本图选手数据'))
    const dual = element('div', 'dual-player-stats')
    const teamATable = createPlayerTable(
      data.teamA,
      data.teamAPlayers,
      data.highlightedSteamid,
      false
    )
    const teamBTable = createPlayerTable(
      data.teamB,
      data.teamBPlayers,
      data.highlightedSteamid,
      false
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
    page.appendChild(coreComponent)
    page.appendChild(markEnter(component('bp', 'eventMark', eventMark()), 'opening'))

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
    const currentMapMedia = runtime.findMapMediaFrame(payload.mapMedia, data.sourceMapId, 'hero')
    const mapSequence = markEnter(
      component('map_break', 'mapSequence', createMapStrip(data)),
      'opening'
    )
    const mapReport = component('map_break', 'mapReport', createMapReport(data, currentMapMedia))
    append(page, mapSequence, mapReport)
    const nextMapValue = data.nextMap ? data.nextMap.name : '系列赛已结束'
    const nextMapMedia = data.nextMap
      ? runtime.findMapMediaFrame(payload.mapMedia, data.nextMap.mapId, 'hero')
      : null
    const nextMap = markEnter(
      component('map_break', 'nextMap', compactCard('NEXT MAP', nextMapValue, null, nextMapMedia)),
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
    const copy = element('div')
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
    root.appendChild(element('div', 'winner-trophy', winner ? 'SERIES WINNER' : 'FINAL RESULT'))
    root.appendChild(winner ? teamBlock(winner, true) : element('div'))
    return root
  }

  function createFinalSeriesScore(data) {
    const root = panel()
    const score = element('div', 'final-series-score score')
    append(
      score,
      element('span', '', data.finalSeriesScore.teamA),
      element('span', 'divider', ':'),
      element('span', '', data.finalSeriesScore.teamB)
    )
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
        append(
          row,
          element('div', 'map-result-name', map.name),
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
    const teamATable = createPlayerTable(
      data.teamA,
      data.teamAPlayers,
      data.highlightedSteamid,
      true
    )
    const teamBTable = createPlayerTable(
      data.teamB,
      data.teamBPlayers,
      data.highlightedSteamid,
      true
    )
    markInterleavedRows(teamATable, teamBTable, 'playerRows')
    append(stats, teamATable, teamBTable)
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

  function createEventBrand() {
    const root = element('div', 'event-brand')
    root.appendChild(element('div', 'event-brand-label', '赛事播出待机'))
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 760 160')
    svg.setAttribute('aria-hidden', 'true')
    const hook = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    hook.setAttribute('data-event-brand-vector-hook', '')
    svg.appendChild(hook)
    root.appendChild(svg)
    return root
  }

  function createPreviousResult(data) {
    const root = panel()
    const body = element('div', 'previous-result')
    body.appendChild(element('div', 'section-kicker', 'PREVIOUS SERIES'))
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
      element('div', 'section-kicker', knownDuration ? 'BROADCAST STANDBY' : '赛事待机'),
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
      element('span', 'utility-kicker', 'FIRST 30 SECONDS'),
      element('strong', 'utility-title-value', '')
    )
    const breakClock = element('div', 'utility-break-clock')
    append(
      breakClock,
      element('span', '', 'NEXT MAP IN'),
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
    append(pageClock, element('span', '', 'ROUND OPENING'), element('strong', '', '00:00 / 00:30'))
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
  }

  function setVideoAsset(video, asset) {
    const assetId = asset ? asset.id : ''
    if (video.dataset.assetId === assetId) return false
    video.dataset.assetId = assetId
    video.classList.remove('is-failed')
    if (!asset) {
      video.pause()
      video.removeAttribute('src')
      return true
    }
    video.src = asset.streamUrl
    video.muted = !asset.audioEnabled
    video.loop = asset.seamlessLoop
    video.load()
    return true
  }

  function syncVideoTransport(video, asset, status) {
    if (!asset || video.classList.contains('is-failed')) return
    if (status === 'playing') {
      video.play().catch(() => {
        video.classList.add('is-failed')
      })
    } else {
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
      if (assignment.shouldSeek) {
        const targetPositionMs = assignment.role === 'active' ? positionMs : 0
        syncVideoPlayback(video, asset, targetPositionMs, state.playbackStatus)
      } else {
        syncVideoTransport(video, asset, state.playbackStatus)
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
          video.style.opacity = String(1 - transitionProgress)
        } else if (video.dataset.assetId === state.transition.toAssetId) {
          video.style.opacity = String(transitionProgress)
        } else {
          video.style.opacity = '0'
        }
      }
    } else {
      for (const video of videoSlots) {
        video.style.opacity =
          state.activeAssetId && video.dataset.assetId === state.activeAssetId ? '1' : '0'
      }
    }
  }

  function updateMapMediaFrame(nowMs) {
    for (const visual of pageLayer.querySelectorAll('.map-media-visual')) {
      const frame = runtime.findMapMediaFrame(
        payload.mapMedia,
        visual.dataset.mapMediaMapId,
        visual.dataset.mapMediaPurpose
      )
      if (!frame) continue
      const currentImage = visual.querySelector('.map-media-image.is-current')
      const preloadImage = visual.querySelector('.map-media-image.is-preload')
      if (currentImage && preloadImage) {
        const opacities = runtime.mapMediaOpacitiesAt(frame, nowMs)
        currentImage.style.opacity = String(opacities.current)
        preloadImage.style.opacity = String(opacities.preload)
      } else if (currentImage) {
        currentImage.style.opacity = '1'
      } else if (preloadImage) {
        preloadImage.style.opacity = '1'
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
    for (const clock of pageLayer.querySelectorAll('[data-clock-output]')) clock.textContent = text
    if (activePageId && payload.layout.pages[activePageId]) {
      const pageLayout = payload.layout.pages[activePageId]
      for (const componentNode of pageLayer.querySelectorAll('[data-component-id]')) {
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
        componentNode.style.display = configured && active ? 'flex' : 'none'
      }
    }
    if (activePageId === 'standby') {
      const countdownComponent = pageLayer.querySelector('.component-startCountdown')
      const promptComponent = pageLayer.querySelector('.component-standbyPrompt')
      const knownDuration = payload.clock.totalDurationMs > 0
      if (countdownComponent) {
        const layout = payload.layout.pages.standby.components.startCountdown
        if (!knownDuration || !layout) countdownComponent.style.display = 'none'
      }
      if (promptComponent) {
        const layout = payload.layout.pages.standby.components.standbyPrompt
        if (!layout) promptComponent.style.display = 'none'
      }
    }
  }

  function updateInternalPageAnimation(frame, reducedMotion) {
    for (const node of pageLayer.querySelectorAll('[data-enter-group]')) {
      const progress = runtime.internalEnterProgress(
        activePageId,
        node.dataset.enterGroup,
        Number(node.dataset.enterIndex),
        Number(node.dataset.enterTotal),
        frame,
        reducedMotion
      )
      node.style.opacity = String(progress)
      node.style.transform = `translateY(${(1 - progress) * 16}px)`
      node.style.filter = `blur(${(1 - progress) * 2}px)`
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
    pageLayer.style.opacity = String(pageOpacity)
    pageLayer.style.transform = `translateY(${pageVisual.translateY}px)`
    pageLayer.style.filter = `blur(${pageVisual.blur}px)`
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
      brandLayer.style.setProperty('--phase-progress', String(progress))
      updateTransitionBrandAssembly(progress)
      return
    }

    brandLayer.dataset.mode = 'page'
    if (brandVectorHook) brandVectorHook.style.opacity = ''
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
    brandLayer.style.setProperty('--phase-progress', String(frame.progress))
    const leftCover = brandLayer.querySelector('.brand-cover-left')
    const rightCover = brandLayer.querySelector('.brand-cover-right')
    let leftOffset = -100
    let rightOffset = 100
    if (frame.phase === 'brand_cover' || frame.phase === 'page_exit') {
      leftOffset = -100 + frame.progress * 100
      rightOffset = 100 - frame.progress * 100
    } else if (frame.phase === 'background_reveal' || frame.phase === 'brand_exit') {
      leftOffset = -frame.progress * 100
      rightOffset = frame.progress * 100
    }
    leftCover.style.transform = `translateX(${leftOffset}%)`
    rightCover.style.transform = `translateX(${rightOffset}%)`
  }

  function tick() {
    if (payload) {
      try {
        const nowMs = serverNowMs()
        updateBackgroundFrame(nowMs)
        updateMapMediaFrame(nowMs)
        requestDueMapMediaFrames(nowMs)
        updateTransition(nowMs)
        updateClock(nowMs)
        updateUtilityReplay(nowMs)
      } catch {
        pageLayer.classList.add('is-ready')
        pageLayer.classList.remove('is-exiting')
        pageLayer.style.opacity = '1'
        pageLayer.style.transform = 'translateY(0)'
        pageLayer.style.filter = 'blur(0)'
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
