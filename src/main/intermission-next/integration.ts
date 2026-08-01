import { join } from 'node:path'
import type { IpcMain } from 'electron'
import type { IntermissionNextOutputPayloadV1 } from '../../shared/intermission-output-next/output'
import type { IntermissionNextRouteApplication } from './routes'
import { databaseService } from '../database/database'
import { getBroadcastRuntimeState } from '../intermission/broadcast-flow'
import { getBroadcastDirectorSnapshot } from '../intermission/broadcast-director'
import { getBPPayload } from '../bp/bp'
import { getMapUtilityReplay } from '../gsi/utility-replay'
import {
  createBundledBackgroundFileRegistry,
  createBundledGlobalBackgroundAssets
} from '../intermission-background-next/bundled-assets'
import { createVerifiedIntermissionNextMapMediaProvider } from './map-media'
import { INTERMISSION_NEXT_SOCKET_EVENT, registerIntermissionNextRoutes } from './routes'
import { IntermissionNextStateCoordinator, type IntermissionNextCoordinatorResult } from './state'
import {
  advanceIntermissionTestStage,
  applyIntermissionTestMode,
  getIntermissionTestModeState,
  hideIntermissionTestOutput,
  setIntermissionTestModeEnabled,
  setIntermissionTestStage
} from './test-mode'

const INTERMISSION_NEXT_TRANSITION_TIMINGS = {
  brandCoverMs: 600,
  backgroundRevealMs: 450,
  pageEnterMs: 450,
  pageExitMs: 350,
  brandExitMs: 1_000
} as const

const INTERMISSION_NEXT_MAP_MEDIA_REVISION = 1
const INTERMISSION_NEXT_MAP_ROTATION_INTERVAL_MS = 10_000
const INTERMISSION_NEXT_MAP_CROSSFADE_DURATION_MS = 1_500
type IntermissionNextSocketPublisher = (
  eventName: typeof INTERMISSION_NEXT_SOCKET_EVENT,
  payload: IntermissionNextOutputPayloadV1
) => void

let coordinatorPromise: Promise<IntermissionNextStateCoordinator> | null = null
let outputRoutesRegistered = false
let socketPublisher: IntermissionNextSocketPublisher | null = null

function outputDirectory(): string {
  return join(__dirname, 'intermission-next/file')
}

function brandDirectory(): string {
  return join(__dirname, 'intermission-next/assets/brand')
}

function mapDirectory(): string {
  return join(__dirname, 'intermission-next/assets/maps')
}

function backgroundDirectory(): string {
  return join(__dirname, 'intermission-next/assets/backgrounds')
}

function readyPayload(result: IntermissionNextCoordinatorResult): IntermissionNextOutputPayloadV1 {
  if (result.status === 'ready') return result.payload
  throw new Error(result.issues.join('；'))
}

async function createCoordinator(): Promise<IntermissionNextStateCoordinator> {
  const mapAssetDirectory = mapDirectory()
  const mapMediaProvider = await createVerifiedIntermissionNextMapMediaProvider({
    manifestFilePath: join(mapAssetDirectory, 'manifest.json'),
    assetRootPath: mapAssetDirectory,
    mediaRevision: INTERMISSION_NEXT_MAP_MEDIA_REVISION,
    startedAtMs: Date.now(),
    rotationIntervalMs: INTERMISSION_NEXT_MAP_ROTATION_INTERVAL_MS,
    crossfadeDurationMs: INTERMISSION_NEXT_MAP_CROSSFADE_DURATION_MS
  })
  const coordinator = new IntermissionNextStateCoordinator({
    settings: {
      get: (key) => databaseService.settings.get(key),
      set: (key, value) => databaseService.settings.set(key, value)
    },
    additional: {
      get: (key) => databaseService.additional.get(key),
      set: (key, value) => databaseService.additional.set(key, value)
    },
    runtimeProvider: {
      getRuntime: () => getBroadcastRuntimeState()
    },
    directorProvider: {
      getDirector: () => getBroadcastDirectorSnapshot()
    },
    bpProvider: {
      getBPPayload: () => getBPPayload()
    },
    backgroundAssetsProvider: {
      getBackgroundAssets: async () => createBundledGlobalBackgroundAssets()
    },
    scoreTimelinesProvider: {
      getScoreTimelines: async () => ({})
    },
    mapMediaProvider,
    utilityReplayProvider: {
      getUtilityReplay: (matchId, mapId) => getMapUtilityReplay(matchId, mapId)
    },
    publisher: {
      publish: (payload) => {
        socketPublisher?.(INTERMISSION_NEXT_SOCKET_EVENT, applyIntermissionTestMode(payload))
      }
    },
    clock: {
      nowMs: () => Date.now()
    },
    highlightRule: 'none',
    transitionTimings: INTERMISSION_NEXT_TRANSITION_TIMINGS
  })
  await coordinator.initialize()
  return coordinator
}

function getCoordinator(): Promise<IntermissionNextStateCoordinator> {
  coordinatorPromise ??= createCoordinator().catch((error: unknown) => {
    coordinatorPromise = null
    throw error
  })
  return coordinatorPromise
}

export async function initializeIntermissionNextOutput(
  application: IntermissionNextRouteApplication,
  publisher: IntermissionNextSocketPublisher
): Promise<void> {
  socketPublisher = publisher
  await getCoordinator()
  if (outputRoutesRegistered) return
  registerIntermissionNextRoutes(application, {
    outputDirectory: outputDirectory(),
    brandDirectory: brandDirectory(),
    mapDirectory: mapDirectory(),
    stateProvider: async () => readyPayload(await getIntermissionNextState()),
    backgroundFileRegistry: createBundledBackgroundFileRegistry(backgroundDirectory())
  })
  outputRoutesRegistered = true
}

export async function getIntermissionNextState(): Promise<IntermissionNextCoordinatorResult> {
  const result = await (await getCoordinator()).refreshRuntime(false)
  return result.status === 'ready'
    ? { ...result, payload: applyIntermissionTestMode(result.payload) }
    : result
}

export async function publishIntermissionNextSnapshot(): Promise<void> {
  await (await getCoordinator()).refreshRuntime()
}

export function registerIntermissionNextIPC(ipc: IpcMain): void {
  ipc.handle('intermission-next:get-state', () => getIntermissionNextState())
  ipc.handle('intermission-next:update-layout', async (_event, value: unknown) =>
    (await getCoordinator()).setLayout(value)
  )
  ipc.handle('intermission-next:update-page-flow-templates', async (_event, value: unknown) =>
    (await getCoordinator()).setPageFlowTemplates(value)
  )
  ipc.handle('intermission-next:test-mode-get', () => getIntermissionTestModeState())
  ipc.handle('intermission-next:test-mode-enabled', async (_event, enabled: boolean) => {
    if (enabled) {
      const director = await getBroadcastDirectorSnapshot()
      if (director.runtime.stage !== 'hidden') {
        throw new Error('正式播出仍在显示，请先隐藏推流后再启用无比赛测试')
      }
    }
    const state = setIntermissionTestModeEnabled(enabled)
    await publishIntermissionNextSnapshot()
    return state
  })
  ipc.handle('intermission-next:test-mode-stage', async (_event, stage: unknown) => {
    const state = setIntermissionTestStage(stage)
    await publishIntermissionNextSnapshot()
    return state
  })
  ipc.handle('intermission-next:test-mode-advance', async () => {
    const state = advanceIntermissionTestStage()
    await publishIntermissionNextSnapshot()
    return state
  })
  ipc.handle('intermission-next:test-mode-hide', async () => {
    const state = hideIntermissionTestOutput()
    await publishIntermissionNextSnapshot()
    return state
  })
}
