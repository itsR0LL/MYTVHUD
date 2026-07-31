import type { BroadcastContentType, BroadcastPlaybackStatus } from '../broadcast-flow'
import type { BroadcastDirectorSnapshot } from '../broadcast-director'
import type { GlobalBackgroundAssetV1 } from '../intermission-background-next/assets'
import type { GlobalBackgroundStateV1 } from '../intermission-background-next/background-state'
import type { IntermissionNextLayoutState } from '../intermission-next'
import type {
  BPPageData,
  MapBreakPageData,
  SeriesEndPageData,
  StandbyPageData,
  WarmupPageData
} from '../intermission-page-data-next/view-model'
import type {
  IntermissionNextTransitionStateV1,
  IntermissionNextTransitionTimings
} from '../intermission-transition-next/transition-state'
import type { IntermissionNextMapMediaOutputFrame } from './map-media'
import type { MapUtilityReplay } from '../utility-replay'

export type IntermissionNextPageData =
  | WarmupPageData
  | BPPageData
  | MapBreakPageData
  | SeriesEndPageData
  | StandbyPageData

export interface IntermissionNextPlaybackClock {
  status: BroadcastPlaybackStatus
  totalDurationMs: number
  deadlineAtMs: number | null
  pausedRemainingMs: number | null
}

export interface IntermissionNextActiveSegment {
  id: string
  contentType: BroadcastContentType
  startOffsetMs: number
  durationMs: number
}

export interface IntermissionNextOutputPayloadV1 {
  version: 1
  payloadRevision: number
  playRevision: number
  serverNowMs: number
  director: BroadcastDirectorSnapshot
  visible: boolean
  pageData: IntermissionNextPageData | null
  layout: IntermissionNextLayoutState
  background: GlobalBackgroundStateV1
  backgroundAssets: GlobalBackgroundAssetV1[]
  transition: IntermissionNextTransitionStateV1
  transitionTimings: IntermissionNextTransitionTimings
  mapMedia: IntermissionNextMapMediaOutputFrame[]
  activeSegment: IntermissionNextActiveSegment | null
  utilityReplay: MapUtilityReplay | null
  clock: IntermissionNextPlaybackClock
  issues: string[]
}

export const INTERMISSION_NEXT_SOCKET_EVENT = 'intermission-next-state'
export const INTERMISSION_NEXT_PREVIEW_MESSAGE = 'intermission-next-preview-state'

export interface IntermissionNextPreviewMessageV1 {
  type: typeof INTERMISSION_NEXT_PREVIEW_MESSAGE
  payload: IntermissionNextOutputPayloadV1
}
