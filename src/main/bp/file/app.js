const MAPS = {
  de_ancient: {
    name: 'Ancient',
    chineseName: '远古遗迹',
    wideImage: '/bp/maps/wide/de_ancient.png',
    bo5Image: '/bp/maps/bo5/ancient.png',
    icon: '/bp/maps/icons/de_ancient.png'
  },
  de_anubis: {
    name: 'Anubis',
    chineseName: '阿努比斯',
    wideImage: '/bp/maps/wide/de_anubis.png',
    bo5Image: '/bp/maps/bo5/anubis.png',
    icon: '/bp/maps/icons/de_anubis.png'
  },
  de_dust2: {
    name: 'Dust2',
    chineseName: '炙热沙城2',
    wideImage: '/bp/maps/wide/de_dust2.png',
    bo5Image: '/bp/maps/bo5/dust2.png',
    icon: '/bp/maps/icons/de_dust2.png'
  },
  de_inferno: {
    name: 'Inferno',
    chineseName: '炼狱小镇',
    wideImage: '/bp/maps/wide/de_inferno.png',
    bo5Image: '/bp/maps/bo5/inferno.png',
    icon: '/bp/maps/icons/de_inferno.png'
  },
  de_mirage: {
    name: 'Mirage',
    chineseName: '荒漠迷城',
    wideImage: '/bp/maps/wide/de_mirage.png',
    bo5Image: '/bp/maps/bo5/mirage.png',
    icon: '/bp/maps/icons/de_mirage.png'
  },
  de_nuke: {
    name: 'Nuke',
    chineseName: '核子危机',
    wideImage: '/bp/maps/wide/de_nuke.png',
    bo5Image: '/bp/maps/bo5/nuke.png',
    icon: '/bp/maps/icons/de_nuke.png'
  },
  de_overpass: {
    name: 'Overpass',
    chineseName: '死亡游乐园',
    wideImage: '/bp/maps/wide/de_overpass.png',
    bo5Image: '/bp/maps/bo5/overpass.png',
    icon: '/bp/maps/icons/de_overpass.png'
  },
  de_vertigo: {
    name: 'Vertigo',
    chineseName: '殒命大厦',
    wideImage: '/bp/maps/wide/de_vertigo.png',
    bo5Image: '/bp/maps/bo5/vertigo.png',
    icon: '/bp/maps/icons/de_vertigo.png'
  },
  de_cache: {
    name: 'Cache',
    chineseName: '死城之谜',
    wideImage: '/bp/maps/wide/de_cache.png',
    bo5Image: '/bp/maps/bo5/cache.png',
    icon: '/bp/maps/icons/de_cache.png'
  },
  de_train: {
    name: 'Train',
    chineseName: '列车停放站',
    wideImage: '/bp/maps/wide/de_train.png',
    bo5Image: '/bp/maps/bo5/train.png',
    icon: '/bp/maps/icons/de_train.png'
  }
}

const PREVIEW_ACTIONS = {
  BO1: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider'],
  BO3: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'],
  BO5: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider']
}

const PREVIEW_MAPS = [
  'de_dust2',
  'de_mirage',
  'de_ancient',
  'de_inferno',
  'de_nuke',
  'de_anubis',
  'de_overpass'
]

const ACTION_LABELS = {
  ban: '禁用',
  pick: '选用',
  decider: '决胜图'
}

const BP_TITLE = 'BAN & PICK'
const CARD_INTERVAL = 850
const CARD_ANIMATION_DURATION = 1200
const WIDE_MAP_RATIO = 16 / 9
const SERIES_FINALE_HOLD = 1300
const SERIES_FINALE_DURATION = 1500
const SERIES_EXIT_DURATION = 700

let mountedRoot = null
let stage = null
let title = null
let cards = null
let masthead = null
let matchup = null
let teamA = null
let teamB = null
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

let lastRevision = -1
let lastPlaybackStarted = false
let revealTimers = []
let lastPayloadSignature = ''

function teamName(team, fallback) {
  if (!team) return fallback
  return team.name || team.name_ingame || fallback
}

function renderMatchup(match) {
  const teamAName = teamName(match?.team_a, '战队 A')
  const teamBName = teamName(match?.team_b, '战队 B')
  teamA.textContent = teamAName
  teamB.textContent = teamBName
  teamA.setAttribute('aria-label', teamAName)
  teamB.setAttribute('aria-label', teamBName)
  matchup.setAttribute('aria-label', `${teamAName} 对阵 ${teamBName}`)
}

function mapImage(map, matchType) {
  return matchType === 'BO5' ? map.bo5Image : map.wideImage
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function createFinalLayouts(matchType, count) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const safeTop = masthead.getBoundingClientRect().bottom + 48
  const safeBottom = 48
  const availableHeight = Math.max(1, viewportHeight - safeTop - safeBottom)

  if (matchType === 'BO1') {
    const width = Math.min(1120, viewportWidth * 0.72, availableHeight * WIDE_MAP_RATIO)
    const height = width / WIDE_MAP_RATIO
    return [
      {
        left: (viewportWidth - width) / 2,
        top: Math.max(safeTop, (viewportHeight - height) / 2),
        width,
        height
      }
    ]
  }

  const gap = clamp(viewportWidth * 0.014, 18, 28)
  const horizontalPadding = clamp(viewportWidth * 0.047, 56, 90)
  let width = Math.min(540, (viewportWidth - horizontalPadding * 2 - gap * (count - 1)) / count)
  let height = width / WIDE_MAP_RATIO

  if (height > availableHeight) {
    height = availableHeight
    width = height * WIDE_MAP_RATIO
  }

  const groupWidth = width * count + gap * (count - 1)
  const left = (viewportWidth - groupWidth) / 2
  const top = Math.max(safeTop, (viewportHeight - height) / 2)

  return Array.from({ length: count }, (_, index) => ({
    left: left + index * (width + gap),
    top,
    width,
    height
  }))
}

function setFinalCardLayout(card, layout) {
  card.style.setProperty('--bp-final-left', `${layout.left}px`)
  card.style.setProperty('--bp-final-top', `${layout.top}px`)
  card.style.setProperty('--bp-final-width', `${layout.width}px`)
  card.style.setProperty('--bp-final-height', `${layout.height}px`)
  card.style.setProperty('--bp-final-map-font', `${clamp(layout.height * 0.0766, 22, 50)}px`)
  card.style.setProperty('--bp-final-team-font', `${clamp(layout.height * 0.0405, 14, 26)}px`)
  card.style.setProperty('--bp-final-action-font', `${clamp(layout.height * 0.0495, 16, 32)}px`)
  card.style.setProperty('--bp-final-side-font', `${clamp(layout.height * 0.0383, 13, 24)}px`)
  card.classList.add('is-series-final-card')
}

function hideEliminatedCards(eliminatedCards, shouldAnimate) {
  eliminatedCards.forEach((card) => {
    card.classList.add('is-series-eliminated')
    card.setAttribute('aria-hidden', 'true')

    if (!shouldAnimate) {
      card.style.visibility = 'hidden'
      return
    }

    const animation = card.animate(
      [
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        { opacity: 0, transform: 'translate3d(0, 18px, 0) scale(0.86)' }
      ],
      {
        duration: SERIES_EXIT_DURATION,
        easing: 'cubic-bezier(0.4, 0, 1, 1)',
        fill: 'forwards'
      }
    )
    animation.addEventListener('finish', () => {
      card.style.visibility = 'hidden'
      animation.cancel()
    })
  })
}

function animateFinalCard(card, initialRect, layout, shouldAnimate) {
  setFinalCardLayout(card, layout)

  if (!shouldAnimate) {
    card.style.clipPath = 'none'
    card.style.transform = 'translate3d(0, 0, 0) scale(1)'
    return
  }

  const scale = initialRect.height / layout.height
  const visibleRatio = initialRect.width / (layout.width * scale)
  const horizontalInset = clamp((1 - visibleRatio) / 2, 0, 0.5)
  const offsetX = initialRect.left - layout.left - layout.width * horizontalInset * scale
  const offsetY = initialRect.top - layout.top
  const initialTransform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`
  const initialClip = `inset(0 ${horizontalInset * 100}% 0 ${horizontalInset * 100}%)`
  const animation = card.animate(
    [
      { clipPath: initialClip, transform: initialTransform },
      { clipPath: 'inset(0)', transform: 'translate3d(0, 0, 0) scale(1)' }
    ],
    {
      duration: SERIES_FINALE_DURATION,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards'
    }
  )

  animation.addEventListener('finish', () => {
    card.style.clipPath = 'none'
    card.style.transform = 'translate3d(0, 0, 0) scale(1)'
    card.classList.add('is-series-final-card-complete')
    animation.cancel()
  })
}

function startSeriesFinale(renderedCards, matchType, shouldAnimate) {
  const finalCards = renderedCards.filter((card) => card.dataset.action !== 'ban')
  const expectedFinalCount = matchType === 'BO1' ? 1 : 3
  if (finalCards.length !== expectedFinalCount) {
    console.error(`BP ${matchType} 终局卡片数量无效：${finalCards.length}`)
    return
  }

  const eliminatedCards = renderedCards.filter((card) => card.dataset.action === 'ban')
  const initialRects = finalCards.map((card) => card.getBoundingClientRect())
  const layouts = createFinalLayouts(matchType, finalCards.length)

  stage.classList.add('is-series-final')
  cards.classList.add('is-series-final')
  hideEliminatedCards(eliminatedCards, shouldAnimate)
  finalCards.forEach((card, index) => {
    animateFinalCard(card, initialRects[index], layouts[index], shouldAnimate)
  })

  if (!shouldAnimate) {
    stage.classList.add('is-series-finalized')
    return
  }

  revealTimers.push(
    window.setTimeout(() => stage.classList.add('is-series-finalized'), SERIES_FINALE_DURATION)
  )
}

function scheduleSeriesFinale(renderedCards, state, matchType, shouldAnimate) {
  if (matchType !== 'BO1' && matchType !== 'BO3') return
  if (!state.playbackStarted) return

  if (!shouldAnimate || !state.animationEnabled) {
    revealTimers.push(
      window.setTimeout(() => startSeriesFinale(renderedCards, matchType, false), 0)
    )
    return
  }

  const lastCardIndex = Math.max(0, renderedCards.length - 1)
  const lastSettleTime = 420 + lastCardIndex * CARD_INTERVAL + CARD_ANIMATION_DURATION + 520
  revealTimers.push(
    window.setTimeout(
      () => startSeriesFinale(renderedCards, matchType, true),
      lastSettleTime + SERIES_FINALE_HOLD
    )
  )
}

function actorName(item, match) {
  if (item.actor === 'team_a') return teamName(match?.team_a, '战队 A')
  if (item.actor === 'team_b') return teamName(match?.team_b, '战队 B')
  return ''
}

function createActionContent(item, match, className) {
  const container = document.createElement('div')
  container.className = className

  if (item.action !== 'decider') {
    const team = document.createElement('span')
    team.className = 'bp-action-team'
    team.textContent = actorName(item, match)
    container.append(team)
  }

  const action = document.createElement('span')
  action.className = 'bp-action-word'
  action.textContent = ACTION_LABELS[item.action]
  container.append(action)

  if (className === 'bp-result' && item.action === 'pick' && item.startingSide) {
    const side = document.createElement('span')
    side.className = 'bp-result-side'
    side.textContent = item.startingSide
    container.append(side)
  }

  return container
}

function createCard(item, index, state, matchType, match, shouldAnimate) {
  const map = MAPS[item.map]
  const card = document.createElement('article')
  const willAnimate = shouldAnimate && state.animationEnabled
  card.className = willAnimate ? 'bp-card is-entering' : 'bp-card is-settled'
  card.dataset.action = item.action
  const revealDelay = 420 + index * CARD_INTERVAL
  const nameDuration = Math.min(620, Math.max(260, Math.round(CARD_ANIMATION_DURATION * 0.62)))
  card.style.setProperty('--bp-delay', `${revealDelay}ms`)
  card.style.setProperty('--bp-duration', `${CARD_ANIMATION_DURATION}ms`)
  card.style.setProperty(
    '--bp-name-delay',
    `${revealDelay + Math.min(420, Math.round(CARD_ANIMATION_DURATION * 0.48))}ms`
  )
  card.style.setProperty('--bp-name-duration', `${nameDuration}ms`)
  const actionDescription =
    item.action === 'decider'
      ? '决胜图'
      : `${actorName(item, match)} ${ACTION_LABELS[item.action]}${item.action === 'pick' && item.startingSide ? `，${item.startingSide} 方` : ''}`
  card.setAttribute('aria-label', `${map.name} ${map.chineseName}，${actionDescription}`)

  const actionBar = createActionContent(item, match, 'bp-action-bar')
  const visual = document.createElement('div')
  visual.className = 'bp-card-visual'

  const imageSource = mapImage(map, matchType)
  if (imageSource) {
    const image = document.createElement('img')
    image.className = 'bp-map-image'
    image.src = imageSource
    image.alt = `${map.name} ${map.chineseName}`
    image.decoding = 'async'
    visual.append(image)
  }

  const icon = document.createElement('img')
  icon.className = 'bp-map-icon'
  icon.src = map.icon
  icon.alt = `${map.name} 地图图标`
  icon.decoding = 'async'
  visual.append(icon)

  const mapName = document.createElement('span')
  mapName.className = 'bp-map-name'
  mapName.textContent = map.name
  visual.append(mapName, createActionContent(item, match, 'bp-result'))
  card.append(actionBar, visual)
  return card
}

function render(payload, allowAnimation = true) {
  if (!stage || !title || !cards || !masthead || !matchup || !teamA || !teamB) return
  if (!payload || !payload.state) return

  const payloadSignature = JSON.stringify(payload)
  if (payloadSignature === lastPayloadSignature) return

  const { state, match } = payload
  const matchType = match?.type || ''
  const shouldAnimate =
    allowAnimation &&
    state.visible &&
    state.playbackStarted &&
    (!lastPlaybackStarted || state.revision !== lastRevision) &&
    !reducedMotionQuery.matches

  for (const timer of revealTimers) window.clearTimeout(timer)
  revealTimers = []
  stage.classList.remove('is-series-final', 'is-series-finalized')
  cards.classList.remove('is-series-final')

  title.textContent = BP_TITLE
  stage.dataset.series = matchType
  stage.classList.toggle('is-hidden', !state.visible)
  stage.setAttribute('aria-hidden', String(!state.visible))
  renderMatchup(match)

  const renderedCards = state.playbackStarted
    ? state.sequence.map((item, index) =>
        createCard(item, index, state, matchType, match, shouldAnimate)
      )
    : []
  cards.replaceChildren(...renderedCards)

  if (shouldAnimate && state.animationEnabled) {
    renderedCards.forEach((card, index) => {
      const revealDelay = 420 + index * CARD_INTERVAL
      revealTimers.push(
        window.setTimeout(
          () => card.classList.remove('is-entering'),
          revealDelay + CARD_ANIMATION_DURATION + 120
        )
      )
      revealTimers.push(
        window.setTimeout(
          () => card.classList.add('is-settled'),
          revealDelay + CARD_ANIMATION_DURATION + 520
        )
      )
    })
  }

  scheduleSeriesFinale(renderedCards, state, matchType, shouldAnimate)

  lastPlaybackStarted = state.playbackStarted
  lastRevision = state.revision
  lastPayloadSignature = payloadSignature
}

function createPreviewPayload(matchType) {
  const actions = PREVIEW_ACTIONS[matchType]
  const sequence = PREVIEW_MAPS.map((map, index) => {
    const action = actions[index]
    return {
      map,
      action,
      actor: action === 'decider' ? '' : index % 2 === 0 ? 'team_a' : 'team_b',
      startingSide: action === 'pick' ? (index % 2 === 0 ? 'CT' : 'T') : ''
    }
  })

  return {
    state: {
      version: 1,
      sequence,
      visible: true,
      playbackStarted: true,
      playbackStartedAtMs: 0,
      animationEnabled: true,
      revision: 1
    },
    match: {
      id: 'bp-preview',
      type: matchType,
      team_a: {
        id: 'preview-team-a',
        name: '测试战队 A',
        name_ingame: 'TEAM A'
      },
      team_b: {
        id: 'preview-team-b',
        name: '测试战队 B',
        name_ingame: 'TEAM B'
      }
    }
  }
}

function node(tagName, className, textContent) {
  const result = document.createElement(tagName)
  result.className = className
  if (typeof textContent === 'string') result.textContent = textContent
  return result
}

function destroy() {
  for (const timer of revealTimers) window.clearTimeout(timer)
  revealTimers = []
  stage?.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
  if (mountedRoot) mountedRoot.replaceChildren()
  mountedRoot = null
  stage = null
  title = null
  cards = null
  masthead = null
  matchup = null
  teamA = null
  teamB = null
  lastPayloadSignature = ''
}

function mount(root, payload, options = {}) {
  if (!(root instanceof HTMLElement)) throw new Error('BP 渲染容器无效')
  destroy()

  const nextStage = node('main', 'bp-stage is-hidden')
  nextStage.setAttribute('aria-live', 'polite')
  nextStage.setAttribute('aria-hidden', 'true')
  const shell = node('section', 'bp-shell')
  const nextMasthead = node('header', 'bp-masthead')
  const nextTitle = node('h1', 'bp-title', BP_TITLE)
  const nextMatchup = node('div', 'bp-matchup')
  nextMatchup.setAttribute('aria-label', '比赛双方')
  const nextTeamA = node('span', 'bp-match-team bp-match-team-a', '战队 A')
  const versus = node('strong', 'bp-versus', 'VS')
  const nextTeamB = node('span', 'bp-match-team bp-match-team-b', '战队 B')
  const nextCards = node('section', 'bp-cards')
  nextCards.setAttribute('aria-label', '地图禁选结果')
  nextMatchup.append(nextTeamA, versus, nextTeamB)
  nextMasthead.append(nextTitle, nextMatchup)
  shell.append(nextMasthead, nextCards)
  nextStage.appendChild(shell)
  root.replaceChildren(nextStage)

  mountedRoot = root
  stage = nextStage
  title = nextTitle
  cards = nextCards
  masthead = nextMasthead
  matchup = nextMatchup
  teamA = nextTeamA
  teamB = nextTeamB
  render(payload, options.allowAnimation !== false)
}

window.MYTVHUDBPRenderer = Object.freeze({ mount, destroy, createPreviewPayload })
