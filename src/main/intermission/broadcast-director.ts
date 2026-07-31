import type { IpcMain } from 'electron'
import {
  BROADCAST_DIRECTOR_RUNTIME_KEY,
  createDefaultBroadcastDirectorRuntime,
  normalizeBroadcastDirectorRuntime,
  resolveBroadcastDirectorAdvance,
  type BroadcastDirectorRuntimeV1,
  type BroadcastDirectorJumpRequest,
  type BroadcastDirectorJumpTarget,
  type BroadcastDirectorSnapshot,
  type BroadcastDirectorStage,
  type BroadcastDirectorVisibleStage
} from '../../shared/broadcast-director'
import type { BroadcastProgram, BroadcastRuntimeV1 } from '../../shared/broadcast-flow'
import {
  BROADCAST_PAGE_FLOW_TEMPLATES_KEY,
  normalizeBroadcastPageFlowTemplates
} from '../../shared/broadcast-page-flow-next/page-flow'
import { BP_MAPS, isBPSequenceComplete, type BPMapId, type BPPayload } from '../../shared/bp'
import { getBPPayload, hideBPOutput, saveBPState } from '../bp/bp'
import { databaseService } from '../database/database'
import {
  getBroadcastRuntimeState,
  hideBroadcastOutput,
  prepareBroadcastMapReport,
  replayBroadcastProgram,
  showBroadcastOutput,
  startPreparedBroadcastProgram
} from './broadcast-flow'

let liveRuntime = createDefaultBroadcastDirectorRuntime()
let initialized = false
let initializePromise: Promise<void> | null = null
let mutationQueue: Promise<void> = Promise.resolve()
let publishDirector: (() => void) | null = null

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation)
  mutationQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

async function persistRuntime(): Promise<void> {
  await databaseService.additional.set(BROADCAST_DIRECTOR_RUNTIME_KEY, liveRuntime)
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return
  if (!initializePromise) {
    initializePromise = (async () => {
      const stored = await databaseService.additional.get(BROADCAST_DIRECTOR_RUNTIME_KEY)
      liveRuntime = normalizeBroadcastDirectorRuntime(stored)
      if (liveRuntime.stage !== 'hidden') {
        liveRuntime = {
          ...liveRuntime,
          stage: 'hidden',
          hiddenReason: 'manual',
          resumeStage: liveRuntime.stage,
          stageStartedAtMs: Date.now(),
          revision: liveRuntime.revision + 1
        }
      }
      await persistRuntime()
      initialized = true
    })().finally(() => {
      initializePromise = null
    })
  }
  await initializePromise
}

async function decisionContext() {
  const [bpPayload, broadcastRuntime] = await Promise.all([
    getBPPayload(),
    getBroadcastRuntimeState()
  ])
  return {
    bpPayload,
    broadcastRuntime,
    decision: {
      bpReady:
        bpPayload.match !== null &&
        isBPSequenceComplete(bpPayload.state.sequence, bpPayload.match.type),
      preparedProgramId: broadcastRuntime.preparedProgram?.id ?? null,
      preparedProgramType: broadcastRuntime.preparedProgram?.type ?? null
    }
  }
}

function programMatchesCurrentMatch(
  program: BroadcastProgram | null,
  bpPayload: BPPayload
): program is BroadcastProgram {
  return (
    program !== null &&
    bpPayload.match !== null &&
    String(program.sourceMatchId) === String(bpPayload.match.id)
  )
}

function mapName(mapId: BPMapId): string {
  return BP_MAPS.find((map) => map.id === mapId)?.displayName ?? mapId
}

function unavailableTarget(
  id: string,
  stage: BroadcastDirectorStage,
  sourceMapId: BPMapId | '',
  label: string,
  reason: string
): BroadcastDirectorJumpTarget {
  return { id, stage, sourceMapId, label, available: false, reason }
}

function availableTarget(
  id: string,
  stage: BroadcastDirectorStage,
  sourceMapId: BPMapId | '',
  label: string
): BroadcastDirectorJumpTarget {
  return { id, stage, sourceMapId, label, available: true, reason: '' }
}

function buildJumpTargets(
  bpPayload: BPPayload,
  broadcastRuntime: BroadcastRuntimeV1
): BroadcastDirectorJumpTarget[] {
  const bpReady =
    bpPayload.match !== null && isBPSequenceComplete(bpPayload.state.sequence, bpPayload.match.type)
  const preparedProgram = programMatchesCurrentMatch(broadcastRuntime.preparedProgram, bpPayload)
    ? broadcastRuntime.preparedProgram
    : null
  const onAirProgram = programMatchesCurrentMatch(broadcastRuntime.onAirProgram, bpPayload)
    ? broadcastRuntime.onAirProgram
    : null
  const snapshotProgram = preparedProgram ?? onAirProgram
  const targets: BroadcastDirectorJumpTarget[] = [
    availableTarget('warmup', 'warmup', '', '暖场'),
    bpReady
      ? availableTarget('bp', 'bp', '', 'BP 展示')
      : unavailableTarget('bp', 'bp', '', 'BP 展示', '当前比赛尚未保存完整 BP')
  ]

  if (bpReady) {
    const selectedMaps = bpPayload.state.sequence.filter(
      (item) => item.action === 'pick' || item.action === 'decider'
    )
    selectedMaps.forEach((item, index) => {
      const mapNumber = index + 1
      targets.push(
        availableTarget(
          `gameplay:${mapNumber}:${item.map}`,
          'hidden',
          item.map,
          `图 ${mapNumber} 比赛画面 · ${mapName(item.map)}`
        )
      )
      const mapBreakId = `map-break:${mapNumber}:${item.map}`
      const mapBreakLabel = `图 ${mapNumber} 地图间播出 · ${mapName(item.map)}`
      if (snapshotProgram?.snapshot.mapSnapshots[item.map]) {
        targets.push(availableTarget(mapBreakId, 'map_break', item.map, mapBreakLabel))
      } else {
        targets.push(
          unavailableTarget(
            mapBreakId,
            'map_break',
            item.map,
            mapBreakLabel,
            `等待图 ${mapNumber} 的最终数据快照`
          )
        )
      }
    })
  }

  const seriesEndAvailable =
    preparedProgram?.type === 'series_end' || onAirProgram?.type === 'series_end'
  targets.push(
    seriesEndAvailable
      ? availableTarget('series-end', 'series_end', '', '系列赛结束')
      : unavailableTarget('series-end', 'series_end', '', '系列赛结束', '等待系列赛结束节目生成')
  )

  const standbyAvailable = onAirProgram?.snapshot.seriesEnded === true
  targets.push(
    standbyAvailable
      ? availableTarget('standby', 'standby', '', '赛事待机')
      : unavailableTarget('standby', 'standby', '', '赛事待机', '等待系列赛结束数据')
  )
  return targets
}

function transitionTo(
  stage: BroadcastDirectorStage,
  options: {
    hiddenReason?: BroadcastDirectorRuntimeV1['hiddenReason']
    resumeStage?: BroadcastDirectorVisibleStage | null
    consumedProgramId?: string | null
  } = {}
): void {
  liveRuntime = {
    ...liveRuntime,
    stage,
    hiddenReason: options.hiddenReason ?? liveRuntime.hiddenReason,
    resumeStage: options.resumeStage === undefined ? liveRuntime.resumeStage : options.resumeStage,
    consumedProgramId:
      options.consumedProgramId === undefined
        ? liveRuntime.consumedProgramId
        : options.consumedProgramId,
    stageStartedAtMs: Date.now(),
    revision: liveRuntime.revision + 1
  }
}

async function reconcileAutomaticStandby(): Promise<boolean> {
  if (liveRuntime.stage !== 'series_end') return false
  const broadcastRuntime = await getBroadcastRuntimeState()
  if (broadcastRuntime.playbackStatus !== 'finished') return false
  transitionTo('standby', { hiddenReason: 'idle', resumeStage: null })
  await persistRuntime()
  return true
}

async function snapshot(): Promise<BroadcastDirectorSnapshot> {
  await reconcileAutomaticStandby()
  const { bpPayload, broadcastRuntime, decision } = await decisionContext()
  return {
    runtime: normalizeBroadcastDirectorRuntime(liveRuntime),
    next: resolveBroadcastDirectorAdvance(liveRuntime, decision),
    ...decision,
    bpPlaybackStarted: bpPayload.state.playbackStarted,
    jumpTargets: buildJumpTargets(bpPayload, broadcastRuntime)
  }
}

async function defaultProgramDuration(type: 'map_break' | 'series_end'): Promise<number> {
  const templates = normalizeBroadcastPageFlowTemplates(
    await databaseService.settings.get(BROADCAST_PAGE_FLOW_TEMPLATES_KEY)
  )
  const template = templates.templates[type]
  if (!template.enabled) throw new Error(`${type} 页面尚未在页面播放流程中启用`)
  if (template.defaultTotalDurationMs <= 0) throw new Error(`${type} 页面尚未设置播放时间`)
  return template.defaultTotalDurationMs
}

async function prepareBP(): Promise<void> {
  const payload = await getBPPayload()
  if (!payload.match || !isBPSequenceComplete(payload.state.sequence, payload.match.type)) {
    throw new Error('当前比赛尚未保存完整 BP')
  }
  await saveBPState({
    ...payload.state,
    visible: true,
    playbackStarted: false
  })
}

async function showBP(): Promise<void> {
  const payload = await getBPPayload()
  if (!payload.match || !isBPSequenceComplete(payload.state.sequence, payload.match.type)) {
    throw new Error('当前比赛尚未保存完整 BP')
  }
  await saveBPState({
    ...payload.state,
    visible: true,
    playbackStarted: true,
    revision: payload.state.revision + 1
  })
}

async function showProgram(stage: 'map_break' | 'series_end'): Promise<string> {
  const runtime = await getBroadcastRuntimeState()
  if (!runtime.preparedProgram || runtime.preparedProgram.type !== stage) {
    throw new Error('已准备节目与导演台下一阶段不一致')
  }
  const durationMs = await defaultProgramDuration(stage)
  await startPreparedBroadcastProgram(durationMs)
  return runtime.preparedProgram.id
}

async function resumeVisibleStage(stage: BroadcastDirectorVisibleStage): Promise<void> {
  if (stage === 'warmup') return
  if (stage === 'bp') {
    const payload = await getBPPayload()
    await saveBPState({ ...payload.state, visible: true })
    return
  }
  await showBroadcastOutput()
}

export async function initializeBroadcastDirectorRuntime(): Promise<void> {
  await ensureInitialized()
}

export async function getBroadcastDirectorSnapshot(): Promise<BroadcastDirectorSnapshot> {
  await mutationQueue
  await ensureInitialized()
  return snapshot()
}

export async function advanceBroadcastDirector(): Promise<BroadcastDirectorSnapshot> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    await reconcileAutomaticStandby()
    const { decision } = await decisionContext()
    const next = resolveBroadcastDirectorAdvance(liveRuntime, decision)
    if (!next.allowed || next.targetStage === null) throw new Error(next.reason)

    const previousStage = liveRuntime.stage
    const targetStage = next.targetStage
    if (previousStage === 'hidden' && liveRuntime.hiddenReason === 'manual') {
      await resumeVisibleStage(targetStage as BroadcastDirectorVisibleStage)
      transitionTo(targetStage, { hiddenReason: 'idle', resumeStage: null })
    } else if (targetStage === 'warmup') {
      await Promise.all([hideBPOutput(), hideBroadcastOutput()])
      transitionTo('warmup', { hiddenReason: 'idle', resumeStage: null })
    } else if (targetStage === 'bp') {
      await hideBroadcastOutput()
      await prepareBP()
      transitionTo('bp', { hiddenReason: 'idle', resumeStage: null })
    } else if (targetStage === 'hidden') {
      if (previousStage === 'bp') await hideBPOutput()
      if (previousStage === 'map_break') await hideBroadcastOutput()
      transitionTo('hidden', { hiddenReason: 'gameplay', resumeStage: null })
    } else if (targetStage === 'map_break' || targetStage === 'series_end') {
      const consumedProgramId = await showProgram(targetStage)
      transitionTo(targetStage, {
        hiddenReason: 'idle',
        resumeStage: null,
        consumedProgramId
      })
    } else {
      throw new Error('当前阶段不能通过手动下一段直接进入赛事待机')
    }

    await persistRuntime()
    publishDirector?.()
    return snapshot()
  })
}

export async function playBroadcastDirectorBP(): Promise<BroadcastDirectorSnapshot> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    if (liveRuntime.stage !== 'bp') throw new Error('只有 BP 展示阶段可以播放 BP 动画')
    await showBP()
    publishDirector?.()
    return snapshot()
  })
}

export async function restoreBroadcastDirectorWarmup(): Promise<BroadcastDirectorSnapshot> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    await Promise.all([hideBPOutput(), hideBroadcastOutput()])
    transitionTo('warmup', {
      hiddenReason: 'idle',
      resumeStage: null,
      consumedProgramId: null
    })
    await persistRuntime()
    publishDirector?.()
    return snapshot()
  })
}

export async function jumpBroadcastDirector(
  request: BroadcastDirectorJumpRequest
): Promise<BroadcastDirectorSnapshot> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    if (!request || typeof request.targetId !== 'string') {
      throw new Error('阶段跳转请求缺少目标阶段')
    }
    const { bpPayload, broadcastRuntime } = await decisionContext()
    const target = buildJumpTargets(bpPayload, broadcastRuntime).find(
      (item) => item.id === request.targetId
    )
    if (!target) throw new Error('阶段跳转目标不存在')
    if (!target.available) throw new Error(target.reason)

    if (target.stage === 'warmup') {
      await Promise.all([hideBPOutput(), hideBroadcastOutput()])
      transitionTo('warmup', {
        hiddenReason: 'idle',
        resumeStage: null,
        consumedProgramId: null
      })
    } else if (target.stage === 'bp') {
      await hideBroadcastOutput()
      await prepareBP()
      transitionTo('bp', { hiddenReason: 'idle', resumeStage: null })
    } else if (target.stage === 'hidden') {
      await Promise.all([hideBPOutput(), hideBroadcastOutput()])
      transitionTo('hidden', { hiddenReason: 'gameplay', resumeStage: null })
    } else if (target.stage === 'map_break') {
      if (!target.sourceMapId) throw new Error('地图间播出阶段缺少地图数据来源')
      await hideBPOutput()
      await prepareBroadcastMapReport(target.sourceMapId)
      const consumedProgramId = await showProgram('map_break')
      transitionTo('map_break', {
        hiddenReason: 'idle',
        resumeStage: null,
        consumedProgramId
      })
    } else if (target.stage === 'series_end') {
      await hideBPOutput()
      const currentRuntime = await getBroadcastRuntimeState()
      let consumedProgramId: string
      if (
        currentRuntime.preparedProgram?.type === 'series_end' &&
        bpPayload.match &&
        String(currentRuntime.preparedProgram.sourceMatchId) === String(bpPayload.match.id)
      ) {
        consumedProgramId = await showProgram('series_end')
      } else if (
        currentRuntime.onAirProgram?.type === 'series_end' &&
        bpPayload.match &&
        String(currentRuntime.onAirProgram.sourceMatchId) === String(bpPayload.match.id)
      ) {
        await replayBroadcastProgram()
        consumedProgramId = currentRuntime.onAirProgram.id
      } else {
        throw new Error('当前没有可播放的系列赛结束节目')
      }
      transitionTo('series_end', {
        hiddenReason: 'idle',
        resumeStage: null,
        consumedProgramId
      })
    } else if (target.stage === 'standby') {
      await hideBPOutput()
      await showBroadcastOutput()
      transitionTo('standby', { hiddenReason: 'idle', resumeStage: null })
    }

    await persistRuntime()
    publishDirector?.()
    return snapshot()
  })
}

export async function hideUnifiedBroadcastOutput(): Promise<BroadcastDirectorSnapshot> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    if (liveRuntime.stage === 'hidden') return snapshot()
    const resumeStage = liveRuntime.stage
    await Promise.all([hideBPOutput(), hideBroadcastOutput()])
    transitionTo('hidden', { hiddenReason: 'manual', resumeStage })
    await persistRuntime()
    publishDirector?.()
    return snapshot()
  })
}

export async function resetBroadcastDirectorRuntime(): Promise<BroadcastDirectorSnapshot> {
  return enqueueMutation(async () => {
    await ensureInitialized()
    await Promise.all([hideBPOutput(), hideBroadcastOutput()])
    liveRuntime = createDefaultBroadcastDirectorRuntime()
    await persistRuntime()
    publishDirector?.()
    return snapshot()
  })
}

export function setBroadcastDirectorPublisher(publisher: () => void): void {
  publishDirector = publisher
}

export function registerBroadcastDirectorIPC(ipc: IpcMain): void {
  ipc.handle('broadcast-director:advance', () => advanceBroadcastDirector())
  ipc.handle('broadcast-director:hide', () => hideUnifiedBroadcastOutput())
  ipc.handle('broadcast-director:play-bp', () => playBroadcastDirectorBP())
  ipc.handle('broadcast-director:restore-warmup', () => restoreBroadcastDirectorWarmup())
  ipc.handle('broadcast-director:jump', (_event, request: BroadcastDirectorJumpRequest) =>
    jumpBroadcastDirector(request)
  )
}
