const MAP_SHORT_LABELS = {
  de_ancient: 'ANCIENT',
  de_anubis: 'ANUBIS',
  de_dust2: 'DUST2',
  de_inferno: 'INFERNO',
  de_mirage: 'MIRAGE',
  de_nuke: 'NUKE',
  de_overpass: 'OVERPASS',
  de_vertigo: 'VERTIGO',
  de_cache: 'CACHE',
  de_train: 'TRAIN'
}

const PREVIEW_MESSAGES = {
  state: 'intermission-preview-state'
}

const COMPONENT_IDS = ['teamScore', 'mapSeries', 'timerNotice', 'eventLogo']
const COMPONENT_ELEMENTS = {
  teamScore: document.querySelector('#team-score-component'),
  mapSeries: document.querySelector('#map-series-component'),
  timerNotice: document.querySelector('#timer-notice-component'),
  eventLogo: document.querySelector('#event-logo-component')
}

const isEditorMode = new URLSearchParams(window.location.search).get('mode') === 'editor'
const mapList = document.querySelector('#map-list')
const countdown = document.querySelector('.countdown')
const countdownValue = document.querySelector('.countdown-value')
const liveStatus = document.querySelector('#live-status')
let activePayload = null
let clockOffsetMs = 0
let latestRevision = -1
let latestServerNowMs = -1
let previouslyFinished = false
let renderedContentPayload = null

function teamName(team) {
  return team.name || team.name_ingame
}

function mapShortLabel(mapId) {
  return MAP_SHORT_LABELS[mapId] || mapId
}

function setTeamVisual(team, side) {
  const image = document.querySelector(`.team-${side}-logo`)
  const fallback = document.querySelector(`.team-${side}-name`)
  const name = teamName(team)
  const source = typeof team.avatar === 'string' ? team.avatar : ''

  image.alt = source ? `${name} Logo` : ''
  fallback.textContent = name
  if (!source) {
    image.hidden = true
    fallback.hidden = false
    image.removeAttribute('src')
    return
  }

  image.hidden = false
  fallback.hidden = true
  image.onerror = () => {
    image.onerror = null
    image.hidden = true
    fallback.hidden = false
  }
  image.src = source
}

function mapWinner(map, match) {
  if (map.status !== 'finished' || map.ascore === map.bscore) return null
  return map.ascore > map.bscore
    ? { side: 'team-a', team: match.team_a }
    : { side: 'team-b', team: match.team_b }
}

function createMapMarker(map, match, state) {
  const marker = document.createElement('article')
  marker.className = `map-marker is-${map.status}`
  if (map.name === state.nextMapId) marker.classList.add('is-next')

  const image = document.createElement('img')
  image.className = 'map-marker-image'
  image.src = `/intermission/assets/maps/${map.name}.webp`
  image.alt = ''
  image.decoding = 'async'
  image.draggable = false
  image.onerror = () => image.remove()

  const winner = mapWinner(map, match)
  const label = document.createElement('strong')
  label.className = 'map-marker-label'
  if (winner) {
    marker.classList.add(`winner-${winner.side}`)
    label.textContent = teamName(winner.team)
    marker.setAttribute('aria-label', `${mapShortLabel(map.name)}，${label.textContent} 获胜`)
  } else {
    label.textContent = mapShortLabel(map.name)
    marker.setAttribute('aria-label', label.textContent)
  }
  marker.append(image, label)
  return marker
}

function teamContentIsEqual(first, second) {
  return (
    first?.id === second?.id &&
    first?.name === second?.name &&
    first?.name_ingame === second?.name_ingame &&
    first?.avatar === second?.avatar
  )
}

function mapContentIsEqual(first, second) {
  return (
    first?.name === second?.name &&
    first?.ascore === second?.ascore &&
    first?.bscore === second?.bscore &&
    first?.status === second?.status
  )
}

function payloadContentIsEqual(first, second) {
  if (!first || !second || !first.match || !second.match) return false
  const firstMaps = first.match.maps
  const secondMaps = second.match.maps
  return (
    first.state.nextMapId === second.state.nextMapId &&
    first.seriesScore.teamA === second.seriesScore.teamA &&
    first.seriesScore.teamB === second.seriesScore.teamB &&
    first.match.id === second.match.id &&
    first.match.type === second.match.type &&
    teamContentIsEqual(first.match.team_a, second.match.team_a) &&
    teamContentIsEqual(first.match.team_b, second.match.team_b) &&
    firstMaps.length === secondMaps.length &&
    firstMaps.every((map, index) => mapContentIsEqual(map, secondMaps[index]))
  )
}

function renderContent(payload) {
  const { state, match, seriesScore } = payload
  setTeamVisual(match.team_a, 'a')
  setTeamVisual(match.team_b, 'b')
  document.querySelector('.score-a').textContent = String(seriesScore.teamA)
  document.querySelector('.score-b').textContent = String(seriesScore.teamB)
  document.querySelector('.footer-team-a').textContent = teamName(match.team_a)
  document.querySelector('.footer-team-b').textContent = teamName(match.team_b)
  mapList.replaceChildren(...match.maps.map((map) => createMapMarker(map, match, state)))
}

function setComponentsVisible(visible) {
  for (const componentId of COMPONENT_IDS) {
    const element = COMPONENT_ELEMENTS[componentId]
    element.classList.toggle('is-visible', visible)
    element.setAttribute('aria-hidden', visible ? 'false' : 'true')
  }
}

function applyLayout(layout) {
  for (const componentId of COMPONENT_IDS) {
    const componentLayout = layout?.[componentId]
    if (!componentLayout) continue
    COMPONENT_ELEMENTS[componentId].style.transform =
      `translate(${componentLayout.x}px, ${componentLayout.y}px) scale(${componentLayout.scale})`
  }
}

function renderPayload(payload) {
  if (!payload || !payload.state || !payload.match) {
    setComponentsVisible(false)
    activePayload = payload
    renderedContentPayload = null
    return
  }

  activePayload = payload
  clockOffsetMs = Number(payload.serverNowMs) - Date.now()
  const { state } = payload
  applyLayout(state.layout)

  const shouldShow = isEditorMode || (state.visible && Boolean(state.nextMapId))
  setComponentsVisible(shouldShow)
  liveStatus.textContent = shouldShow
    ? `${teamName(payload.match.team_a)} 对阵 ${teamName(payload.match.team_b)}，下一张地图 ${mapShortLabel(state.nextMapId)}`
    : ''

  if (!payloadContentIsEqual(renderedContentPayload, payload)) {
    renderContent(payload)
    renderedContentPayload = payload
  }
  updateCountdown()
}

function remainingMilliseconds() {
  if (!activePayload) return 0
  const timer = activePayload.state.timer
  if (timer.status === 'running' && timer.deadlineAtMs !== null) {
    return Math.max(0, timer.deadlineAtMs - (Date.now() + clockOffsetMs))
  }
  return Math.max(0, timer.remainingMs)
}

function updateCountdown() {
  if (!activePayload) return
  const remainingMs = remainingMilliseconds()
  const displaySeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(displaySeconds / 60)
  const seconds = displaySeconds % 60
  countdownValue.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  countdown.classList.toggle('is-urgent', displaySeconds > 0 && displaySeconds <= 59)
  countdown.classList.toggle('is-finished', displaySeconds === 0)
  if (displaySeconds === 0 && !previouslyFinished) {
    countdown.classList.remove('just-finished')
    void countdown.offsetWidth
    countdown.classList.add('just-finished')
  }
  if (displaySeconds > 0) countdown.classList.remove('just-finished')
  previouslyFinished = displaySeconds === 0
}

function applyNewestPayload(payload) {
  if (!payload || !payload.state) return
  const revision = Number(payload.state.revision)
  const serverNowMs = Number(payload.serverNowMs)
  if (!Number.isInteger(revision) || !Number.isFinite(serverNowMs)) return
  if (revision < latestRevision) return
  if (revision === latestRevision && serverNowMs <= latestServerNowMs) return
  latestRevision = revision
  latestServerNowMs = serverNowMs
  renderPayload(payload)
}

if (isEditorMode) {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return
    let message = event.data
    if (typeof message === 'string') {
      try {
        message = JSON.parse(message)
      } catch {
        return
      }
    }
    if (message?.type === PREVIEW_MESSAGES.state) {
      renderPayload(message.payload)
    }
  })
} else {
  const socket = window.io({ transports: ['websocket', 'polling'] })
  socket.on('intermission-state', applyNewestPayload)

  async function loadIntermissionState() {
    try {
      const response = await fetch('/api/intermission', { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      applyNewestPayload(await response.json())
    } catch (error) {
      console.error('赛间状态加载失败：', error)
    }
  }

  socket.on('connect', () => void loadIntermissionState())
  void loadIntermissionState()
}

window.setInterval(updateCountdown, 100)
