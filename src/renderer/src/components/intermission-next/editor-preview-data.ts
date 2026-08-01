import type {
  IntermissionNextLayoutState,
  IntermissionNextPageId
} from '../../../../shared/intermission-next'
import { isBPSequenceComplete, type BPMapId, type BPSequenceItem } from '../../../../shared/bp'
import type {
  IntermissionPageMap,
  IntermissionPagePlayer,
  IntermissionPageTeam
} from '../../../../shared/intermission-page-data-next/view-model'
import type {
  IntermissionNextOutputPayloadV1,
  IntermissionNextPageData
} from '../../../../shared/intermission-output-next/output'
import type { IntermissionNextMapMediaOutputFrame } from '../../../../shared/intermission-output-next/map-media'

const PREVIEW_MAP_MEDIA_ROTATION_INTERVAL_MS = 10_000
const PREVIEW_MAP_MEDIA_CROSSFADE_DURATION_MS = 1_500

const teamA: IntermissionPageTeam = { id: 'preview-team-a', name: '战队 A', avatar: null }
const teamB: IntermissionPageTeam = { id: 'preview-team-b', name: '战队 B', avatar: null }

const bpSequence: BPSequenceItem[] = [
  { map: 'de_mirage', action: 'ban', actor: 'team_a', startingSide: '' },
  { map: 'de_nuke', action: 'ban', actor: 'team_b', startingSide: '' },
  { map: 'de_ancient', action: 'pick', actor: 'team_a', startingSide: 'CT' },
  { map: 'de_anubis', action: 'pick', actor: 'team_b', startingSide: 'T' },
  { map: 'de_overpass', action: 'ban', actor: 'team_a', startingSide: '' },
  { map: 'de_vertigo', action: 'ban', actor: 'team_b', startingSide: '' },
  { map: 'de_dust2', action: 'decider', actor: '', startingSide: '' }
]

function player(
  steamid: string,
  teamId: string,
  name: string,
  kills: number,
  assists: number,
  deaths: number,
  score: number,
  adr: number,
  headshotRate: number
): IntermissionPagePlayer {
  return {
    steamid,
    teamId,
    name,
    kills,
    assists,
    deaths,
    mvps: 0,
    score,
    headshotRate,
    adr,
    mapsPlayed: 1
  }
}

const teamAPlayers = [
  player('preview-a-1', 'preview-team-a', '选手 A1', 24, 6, 15, 58, 92.4, 58),
  player('preview-a-2', 'preview-team-a', '选手 A2', 21, 4, 17, 49, 84.1, 52),
  player('preview-a-3', 'preview-team-a', '选手 A3', 18, 8, 16, 43, 79.2, 44),
  player('preview-a-4', 'preview-team-a', '选手 A4', 16, 5, 18, 37, 70.5, 63),
  player('preview-a-5', 'preview-team-a', '选手 A5', 13, 7, 19, 32, 66.3, 46)
]
const teamBPlayers = [
  player('preview-b-1', 'preview-team-b', '选手 B1', 22, 5, 18, 51, 88.7, 55),
  player('preview-b-2', 'preview-team-b', '选手 B2', 20, 3, 18, 46, 82.3, 50),
  player('preview-b-3', 'preview-team-b', '选手 B3', 17, 9, 19, 42, 76.9, 41),
  player('preview-b-4', 'preview-team-b', '选手 B4', 14, 6, 20, 34, 68.8, 57),
  player('preview-b-5', 'preview-team-b', '选手 B5', 12, 4, 21, 29, 61.4, 42)
]

const maps: IntermissionPageMap[] = [
  {
    mapId: 'de_ancient',
    name: 'Ancient',
    decider: false,
    pickedByTeamId: 'preview-team-a',
    status: 'finished',
    teamAScore: 13,
    teamBScore: 10
  },
  {
    mapId: 'de_anubis',
    name: 'Anubis',
    decider: false,
    pickedByTeamId: 'preview-team-b',
    status: 'pending',
    teamAScore: null,
    teamBScore: null
  },
  {
    mapId: 'de_dust2',
    name: 'Dust2',
    decider: true,
    pickedByTeamId: null,
    status: 'pending',
    teamAScore: null,
    teamBScore: null
  }
]

function previewMapMediaFile(mapId: BPMapId, purpose: 'hero' | 'sequence', assetIndex: 1 | 2) {
  const directory = purpose === 'hero' ? 'display' : 'component'
  const filename =
    purpose === 'hero' ? `${mapId}_${assetIndex}_png.png` : `${mapId}_${assetIndex}.jpg`
  return {
    url: `/intermission-next/assets/maps/${mapId}/${directory}/${filename}`,
    fallbackUrl: `/intermission-next/assets/maps/${mapId}/fallback.png`,
    width: purpose === 'hero' ? 1920 : 640,
    height: purpose === 'hero' ? 1080 : 360
  }
}

function previewMapMediaFrame(
  mapId: BPMapId,
  purpose: 'hero' | 'sequence',
  nowMs: number,
  cursorMs: number
): IntermissionNextMapMediaOutputFrame {
  const cycleIndex = Math.floor(cursorMs / PREVIEW_MAP_MEDIA_ROTATION_INTERVAL_MS)
  const timeInCycleMs = cursorMs % PREVIEW_MAP_MEDIA_ROTATION_INTERVAL_MS
  const frameStartedAtMs = nowMs - timeInCycleMs
  const frameEndAtMs = frameStartedAtMs + PREVIEW_MAP_MEDIA_ROTATION_INTERVAL_MS
  const currentIndex = cycleIndex % 2 === 0 ? 1 : 2
  const preloadIndex = currentIndex === 1 ? 2 : 1
  const crossfadeStartedAtMs = frameEndAtMs - PREVIEW_MAP_MEDIA_CROSSFADE_DURATION_MS
  return {
    mapId,
    purpose,
    mediaRevision: 1,
    current: previewMapMediaFile(mapId, purpose, currentIndex),
    preload: previewMapMediaFile(mapId, purpose, preloadIndex),
    crossfadeProgress: Math.max(
      0,
      Math.min(
        1,
        (timeInCycleMs -
          (PREVIEW_MAP_MEDIA_ROTATION_INTERVAL_MS - PREVIEW_MAP_MEDIA_CROSSFADE_DURATION_MS)) /
          PREVIEW_MAP_MEDIA_CROSSFADE_DURATION_MS
      )
    ),
    frameStartedAtMs,
    frameEndAtMs,
    crossfadeStartedAtMs,
    crossfadeDurationMs: PREVIEW_MAP_MEDIA_CROSSFADE_DURATION_MS
  }
}

function editorPreviewMapMedia(
  source: IntermissionNextOutputPayloadV1,
  data: IntermissionNextPageData,
  nowMs: number,
  cursorMs: number
): IntermissionNextMapMediaOutputFrame[] {
  const frames =
    source.pageData?.page === data.page && Array.isArray(source.mapMedia)
      ? [...source.mapMedia]
      : []
  if (data.page !== 'map_break' && data.page !== 'series_end') return frames

  const appendMissingFrame = (mapId: BPMapId, purpose: 'hero' | 'sequence') => {
    const exists = frames.some((frame) => frame.mapId === mapId && frame.purpose === purpose)
    if (!exists) frames.push(previewMapMediaFrame(mapId, purpose, nowMs, cursorMs))
  }

  for (const map of data.maps) appendMissingFrame(map.mapId, 'sequence')
  if (data.page === 'map_break') {
    if (data.nextMap) appendMissingFrame(data.nextMap.mapId, 'hero')
  }
  return frames
}

function pageData(pageId: IntermissionNextPageId): IntermissionNextPageData {
  if (pageId === 'warmup') {
    return {
      page: 'warmup',
      matchId: 'editor-preview',
      matchType: 'BO3',
      teamA,
      teamB,
      bpStatus: 'bp_ready',
      prompt: '直播即将开始',
      issues: []
    }
  }
  if (pageId === 'bp') {
    return {
      page: 'bp',
      matchId: 'editor-preview',
      matchType: 'BO3',
      teamA,
      teamB,
      sequence: bpSequence.map((item) => ({ ...item })),
      playbackStarted: true,
      playbackStartedAtMs: 0,
      animationEnabled: false,
      playRevision: 1,
      preview: true,
      issues: []
    }
  }
  if (pageId === 'map_break') {
    return {
      page: 'map_break',
      sourceMatchId: 'editor-preview',
      sourceMapId: 'de_ancient',
      teamA,
      teamB,
      seriesScore: { teamA: 1, teamB: 0 },
      finalScore: { teamA: 13, teamB: 10 },
      maps,
      nextMap: maps[1],
      teamAPlayers,
      teamBPlayers,
      unassignedPlayerCount: 0,
      highlightedSteamid: 'preview-a-1',
      scoreTimeline: Array.from({ length: 23 }, (_, index) => {
        const roundIndex = index + 1
        const teamAScore = Math.min(13, Math.round((roundIndex * 13) / 23))
        const teamBScore = roundIndex - teamAScore
        return {
          roundIndex,
          teamAScore,
          teamBScore,
          winnerTeamId:
            index === 0 || teamAScore > Math.min(13, Math.round(((roundIndex - 1) * 13) / 23))
              ? 'preview-team-a'
              : 'preview-team-b'
        }
      }),
      scoreTimelineComplete: true,
      issues: []
    }
  }
  if (pageId === 'series_end') {
    return {
      page: 'series_end',
      sourceMatchId: 'editor-preview',
      teamA,
      teamB,
      finalSeriesScore: { teamA: 2, teamB: 0 },
      winnerTeamId: 'preview-team-a',
      maps,
      teamAPlayers: teamAPlayers.map((entry) => ({ ...entry, mapsPlayed: 2 })),
      teamBPlayers: teamBPlayers.map((entry) => ({ ...entry, mapsPlayed: 2 })),
      unassignedPlayerCount: 0,
      highlightedSteamid: 'preview-a-1',
      nextMatch: null,
      issues: []
    }
  }
  return {
    page: 'standby',
    sourceMatchId: 'editor-preview',
    previousResult: {
      teamA,
      teamB,
      finalSeriesScore: { teamA: 2, teamB: 0 },
      winnerTeamId: 'preview-team-a'
    },
    nextMatch: null,
    nextMatchStatus: 'not_configured',
    issues: []
  }
}

function primaryContentType(pageId: IntermissionNextPageId) {
  if (pageId === 'map_break') return 'map_report' as const
  if (pageId === 'series_end') return 'series_result' as const
  return 'standby' as const
}

export function createEditorPreviewPayload(
  source: IntermissionNextOutputPayloadV1,
  layout: IntermissionNextLayoutState,
  pageId: IntermissionNextPageId,
  totalDurationMs: number,
  cursorMs: number
): IntermissionNextOutputPayloadV1 {
  const nowMs = Date.now()
  const pageLayout = layout.pages[pageId]
  const transition = pageLayout.transitions.find(
    (entry) => cursorMs >= entry.startOffsetMs && cursorMs < entry.startOffsetMs + entry.durationMs
  )
  const utilityWindows =
    pageId === 'map_break' || pageId === 'series_end'
      ? (layout.pages[pageId].componentWindows.utilityReplay ?? [])
      : []
  const utilityWindow = utilityWindows.find(
    (entry) => cursorMs >= entry.startOffsetMs && cursorMs < (entry.endOffsetMs ?? totalDurationMs)
  )
  const contentType = transition
    ? ('page_transition' as const)
    : utilityWindow
      ? ('map_utility_replay' as const)
      : primaryContentType(pageId)
  const sourcePageData =
    source.pageData?.page === pageId &&
    (source.pageData.page !== 'bp' ||
      isBPSequenceComplete(source.pageData.sequence, source.pageData.matchType))
      ? source.pageData
      : pageData(pageId)
  const previewPageData =
    sourcePageData.page === 'bp'
      ? {
          ...sourcePageData,
          playbackStarted: true,
          playbackStartedAtMs: nowMs - cursorMs,
          animationEnabled: false,
          preview: true
        }
      : sourcePageData
  return {
    ...source,
    payloadRevision: source.payloadRevision + 1,
    serverNowMs: nowMs,
    visible: true,
    pageData: previewPageData,
    mapMedia: editorPreviewMapMedia(source, previewPageData, nowMs, cursorMs),
    layout,
    transition: {
      version: 1,
      pageId,
      playRevision: source.playRevision,
      startedAtMs: nowMs - 10_000,
      exitStartedAtMs: null
    },
    activeSegment: {
      id: `editor-preview-${contentType}`,
      contentType,
      startOffsetMs: transition?.startOffsetMs ?? utilityWindow?.startOffsetMs ?? 0,
      durationMs:
        transition?.durationMs ??
        (utilityWindow
          ? (utilityWindow.endOffsetMs ?? totalDurationMs) - utilityWindow.startOffsetMs
          : totalDurationMs)
    },
    utilityReplay: contentType === 'map_utility_replay' ? source.utilityReplay : null,
    clock: {
      status: 'paused',
      totalDurationMs,
      deadlineAtMs: null,
      pausedRemainingMs: Math.max(0, totalDurationMs - cursorMs)
    }
  }
}
