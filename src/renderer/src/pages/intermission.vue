<template>
  <div class="intermission-page app-scrollbar-hidden">
    <header class="output-header">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-xl font-semibold">{{ t('intermission.title') }}</h1>
          <span class="status-pill" :data-visible="readyNextState?.payload.visible === true">
            {{
              readyNextState?.payload.visible
                ? t('intermission.output.visible')
                : t('intermission.output.hidden')
            }}
          </span>
        </div>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <code class="output-url">{{ outputUrl }}</code>
          <Button size="sm" variant="outline" @click="copyOutputUrl">
            <Copy />{{ t('intermission.output.copy') }}
          </Button>
          <Button size="sm" variant="outline" @click="openOutput">
            <ExternalLink />{{ t('intermission.output.open') }}
          </Button>
        </div>
      </div>
      <div class="global-controls" aria-label="播出总控">
        <Button variant="outline" @click="refreshPage"> <RefreshCw />刷新页面 </Button>
        <Button variant="outline" :disabled="directorBusy" @click="restoreWarmup">
          <RotateCcw />恢复暖场
        </Button>
        <Button
          variant="destructive"
          :disabled="directorBusy || currentDirectorStage === 'hidden'"
          @click="hideDirector"
        >
          <EyeOff />隐藏推流
        </Button>
      </div>
    </header>

    <div v-if="loading" class="flex min-h-80 items-center justify-center text-muted-foreground">
      {{ t('intermission.loading') }}
    </div>

    <section
      v-else-if="nextState?.status === 'unconfigured'"
      class="configuration-error"
      role="alert"
    >
      <TriangleAlert aria-hidden="true" />
      <div>
        <h2 class="font-semibold">赛间播出尚未完成配置</h2>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li v-for="issue in nextState.issues" :key="issue">{{ issue }}</li>
        </ul>
      </div>
    </section>

    <IntermissionNextWorkspace
      v-else-if="readyNextState"
      :active-section="activeSection"
      :templates="readyNextState.snapshot.pageFlowTemplates"
      :lifecycle-durations="lifecycleDurations"
      :layout="readyNextState.snapshot.layout"
      :preview-src="previewUrl"
      :preview-payload="readyNextState.payload"
      :template-busy="nextBusy"
      :layout-busy="nextBusy"
      @update:active-section="setActiveSection"
      @save-template="savePageFlowTemplates"
      @save-layout="saveNextLayout"
    >
      <template #monitor>
        <section class="output-monitor-card" aria-labelledby="output-monitor-title">
          <header>
            <h2 id="output-monitor-title">OBS 预览</h2>
            <span>{{ directorStageLabel }}</span>
          </header>
          <IntermissionNextPreviewFrame :src="previewUrl" :payload="readyNextState.payload" />
        </section>
      </template>

      <template #director-controls>
        <BroadcastDirectorControls
          :snapshot="readyNextState.payload.director"
          :background="readyNextState.snapshot.persistedRuntime.background"
          :background-assets="readyNextState.payload.backgroundAssets"
          :busy="directorBusy"
          @advance="advanceDirector"
          @play-bp="playBPAnimation"
          @jump="jumpDirector"
        />
      </template>

      <template #flow-controls>
        <div v-if="payload" class="flow-control-stack">
          <BroadcastSnapshotSelector
            :payload="payload"
            :busy="controlBusy"
            @prepare="prepareMapReport"
          />
          <IntermissionMatchOverview :payload="payload" />
          <IntermissionMatchCorrections
            :payload="payload"
            :busy="controlBusy"
            @update-state="handleStateUpdate"
          />
          <BroadcastTestModeControls
            :state="testModeState"
            :busy="directorBusy"
            @enabled="setTestModeEnabled"
            @stage="setTestStage"
          />
        </div>
      </template>
    </IntermissionNextWorkspace>

    <section v-else class="configuration-error" role="alert">
      <TriangleAlert aria-hidden="true" />
      <div>
        <h2 class="font-semibold">无法读取赛间播出状态</h2>
        <p class="mt-1 text-sm">请点击刷新；若仍失败，请查看开发终端中的精确错误。</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Copy, ExternalLink, EyeOff, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import BroadcastDirectorControls from '@/components/intermission-next/BroadcastDirectorControls.vue'
import BroadcastSnapshotSelector from '@/components/intermission-next/BroadcastSnapshotSelector.vue'
import BroadcastTestModeControls from '@/components/intermission-next/BroadcastTestModeControls.vue'
import IntermissionMatchCorrections from '@/components/intermission-next/IntermissionMatchCorrections.vue'
import IntermissionMatchOverview from '@/components/intermission-next/IntermissionMatchOverview.vue'
import IntermissionNextPreviewFrame from '@/components/intermission-next/IntermissionNextPreviewFrame.vue'
import IntermissionNextWorkspace from '@/components/intermission-next/IntermissionNextWorkspace.vue'
import type { BPMapId } from '../../../shared/bp'
import type { BroadcastProgramType, BroadcastRuntimeV1 } from '../../../shared/broadcast-flow'
import {
  broadcastDirectorStageLabel,
  type BroadcastDirectorJumpRequest,
  type BroadcastDirectorSnapshot
} from '../../../shared/broadcast-director'
import type {
  BroadcastPageFlowTemplatesV3,
  BroadcastPageLifecycleDuration
} from '../../../shared/broadcast-page-flow-next/page-flow'
import type { IntermissionNextLayoutState } from '../../../shared/intermission-next'
import type { IntermissionPayload, IntermissionStateUpdate } from '../../../shared/intermission'
import type { IntermissionNextCoordinatorResult } from '../../../main/intermission-next/state'
import {
  createDefaultIntermissionTestModeState,
  type IntermissionTestModeStateV1
} from '../../../shared/intermission-test-mode'

type WorkspaceSection = 'flow' | 'layout'
type ReadyIntermissionNextState = Extract<IntermissionNextCoordinatorResult, { status: 'ready' }>

const outputUrl = 'http://localhost:5031/intermission-next'
const previewUrl = `${outputUrl}/preview`
const { t } = useI18n()
const payload = ref<IntermissionPayload | null>(null)
const nextState = ref<IntermissionNextCoordinatorResult | null>(null)
const testModeState = ref(createDefaultIntermissionTestModeState())
const loading = ref(true)
const refreshing = ref(false)
const controlBusy = ref(false)
const directorBusy = ref(false)
const nextBusy = ref(false)
const activeSection = ref<WorkspaceSection>('flow')
let mounted = false
let deadlineRefresh: number | null = null
let payloadRefreshInterval: number | null = null
let loadAllPromise: Promise<void> | null = null
const INTERMISSION_REQUEST_TIMEOUT_MS = 8000

const readyNextState = computed<ReadyIntermissionNextState | null>(() =>
  nextState.value?.status === 'ready' ? nextState.value : null
)
const directorStageLabel = computed(() =>
  readyNextState.value
    ? broadcastDirectorStageLabel(readyNextState.value.payload.director.runtime.stage)
    : '等待状态'
)
const currentDirectorStage = computed(
  () => readyNextState.value?.payload.director.runtime.stage ?? 'hidden'
)
const lifecycleDurations = computed<Record<BroadcastProgramType, BroadcastPageLifecycleDuration>>(
  () => {
    const timings = readyNextState.value
      ? readyNextState.value.payload.transitionTimings
      : {
          brandCoverMs: 0,
          backgroundRevealMs: 0,
          pageEnterMs: 0,
          pageExitMs: 0,
          brandExitMs: 0
        }
    const duration = {
      enterDurationMs: timings.brandCoverMs + timings.backgroundRevealMs + timings.pageEnterMs,
      exitDurationMs: timings.pageExitMs + timings.brandExitMs
    }
    return {
      map_break: { ...duration },
      series_end: { ...duration },
      standby: { ...duration }
    }
  }
)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function setActiveSection(section: WorkspaceSection): void {
  activeSection.value = section
}

function withRequestTimeout<T>(request: Promise<T>): Promise<T> {
  let timeoutId: number | null = null
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(t('intermission.toast.requestTimedOut')))
    }, INTERMISSION_REQUEST_TIMEOUT_MS)
  })
  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== null) window.clearTimeout(timeoutId)
  })
}

function setPayload(nextPayload: IntermissionPayload): void {
  if (
    payload.value &&
    (nextPayload.state.revision < payload.value.state.revision ||
      nextPayload.runtime.revision < payload.value.runtime.revision)
  ) {
    return
  }
  payload.value = nextPayload
  if (deadlineRefresh !== null) window.clearTimeout(deadlineRefresh)
  const runtime = nextPayload.runtime
  if (runtime.playbackStatus === 'playing' && runtime.deadlineAtMs !== null) {
    const delay = Math.max(0, runtime.deadlineAtMs - nextPayload.serverNowMs) + 150
    deadlineRefresh = window.setTimeout(() => void loadAll(false), delay)
  }
}

function loadAll(showError = true): Promise<void> {
  if (loadAllPromise) return loadAllPromise
  refreshing.value = true
  loadAllPromise = (async () => {
    try {
      const [adminPayload, currentNextState, currentTestModeState] = await withRequestTimeout(
        Promise.all([
          window.api.getIntermissionState(),
          window.api.getIntermissionNextState(),
          window.api.getIntermissionTestModeState()
        ])
      )
      setPayload(adminPayload)
      nextState.value = currentNextState
      testModeState.value = currentTestModeState
    } catch (error: unknown) {
      if (showError) {
        toast.error(t('intermission.toast.loadFailed'), { description: errorMessage(error) })
      }
    }
  })().finally(() => {
    refreshing.value = false
    loading.value = false
    loadAllPromise = null
  })
  return loadAllPromise
}

async function runBroadcastOperation(
  operation: () => Promise<BroadcastRuntimeV1>,
  successMessage?: string
): Promise<void> {
  if (controlBusy.value) return
  controlBusy.value = true
  try {
    await withRequestTimeout(operation())
    await loadAll(false)
    if (successMessage) toast.success(successMessage, { duration: 1800 })
  } catch (error: unknown) {
    toast.error(t('intermission.toast.updateFailed'), {
      description: errorMessage(error),
      duration: 4000
    })
  } finally {
    controlBusy.value = false
  }
}

async function runNextOperation(
  operation: () => Promise<IntermissionNextCoordinatorResult>,
  successMessage?: string
): Promise<void> {
  if (nextBusy.value) return
  nextBusy.value = true
  try {
    nextState.value = await withRequestTimeout(operation())
    if (successMessage) toast.success(successMessage, { duration: 1800 })
  } catch (error: unknown) {
    toast.error(t('intermission.toast.updateFailed'), {
      description: errorMessage(error),
      duration: 4000
    })
  } finally {
    nextBusy.value = false
  }
}

async function runDirectorOperation(
  operation: () => Promise<BroadcastDirectorSnapshot>,
  successMessage?: string
): Promise<void> {
  if (directorBusy.value) return
  directorBusy.value = true
  try {
    await withRequestTimeout(operation())
    await loadAll(false)
    if (successMessage) toast.success(successMessage, { duration: 1800 })
  } catch (error: unknown) {
    toast.error(t('intermission.toast.updateFailed'), {
      description: errorMessage(error),
      duration: 4000
    })
  } finally {
    directorBusy.value = false
  }
}

function handleStateUpdate(update: IntermissionStateUpdate): void {
  if (controlBusy.value) return
  controlBusy.value = true
  void withRequestTimeout(window.api.updateIntermissionState(update))
    .then((nextPayload) => {
      setPayload(nextPayload)
      return window.api.getIntermissionNextState()
    })
    .then((currentNextState) => {
      nextState.value = currentNextState
    })
    .catch((error: unknown) => {
      toast.error(t('intermission.toast.updateFailed'), {
        description: errorMessage(error),
        duration: 4000
      })
    })
    .finally(() => {
      controlBusy.value = false
    })
}

function prepareMapReport(mapId: BPMapId): void {
  void runBroadcastOperation(
    () => window.api.prepareBroadcastMapReport(mapId),
    '所选地图战报已设为准备页面'
  )
}

function advanceDirector(): void {
  if (testModeState.value.enabled) {
    void runTestOperation(() => window.api.advanceIntermissionTestStage(), '已转场至下一测试页面')
    return
  }
  void runDirectorOperation(() => window.api.advanceBroadcastDirector(), '已转场至下一阶段')
}

function playBPAnimation(): void {
  if (testModeState.value.enabled) {
    void runTestOperation(() => window.api.setIntermissionTestStage('bp'), 'BP 动画已重新播放')
    return
  }
  void runDirectorOperation(
    () => window.api.playBroadcastDirectorBP(),
    readyNextState.value?.payload.director.bpPlaybackStarted
      ? 'BP 动画已重新播放'
      : 'BP 动画已开始播放'
  )
}

function jumpDirector(request: BroadcastDirectorJumpRequest): void {
  const target = readyNextState.value?.payload.director.jumpTargets.find(
    (item) => item.id === request.targetId
  )
  if (!target || !target.available) return
  if (!window.confirm(`确认跳转至“${target.label}”吗？当前播出内容将立即转场。`)) return
  if (testModeState.value.enabled) {
    void runTestOperation(
      () => window.api.setIntermissionTestStage(target.stage),
      `已跳转至${target.label}`
    )
    return
  }
  void runDirectorOperation(
    () => window.api.jumpBroadcastDirector(request),
    `已跳转至${target.label}`
  )
}

function restoreWarmup(): void {
  if (
    !window.confirm('确认恢复到初始暖场吗？当前推流页面会立即切换，比赛、BP 和布局数据不会删除。')
  ) {
    return
  }
  if (testModeState.value.enabled) {
    void runTestOperation(() => window.api.setIntermissionTestStage('warmup'), '已恢复测试暖场')
    return
  }
  void runDirectorOperation(() => window.api.restoreBroadcastDirectorWarmup(), '已恢复暖场')
}

function refreshPage(): void {
  window.location.reload()
}

function hideDirector(): void {
  if (testModeState.value.enabled) {
    void runTestOperation(() => window.api.hideIntermissionTestOutput(), '测试推流已隐藏')
    return
  }
  void runDirectorOperation(() => window.api.hideUnifiedBroadcast(), '推流内容已隐藏')
}

async function runTestOperation(
  operation: () => Promise<IntermissionTestModeStateV1>,
  successMessage?: string
): Promise<void> {
  if (directorBusy.value) return
  directorBusy.value = true
  try {
    testModeState.value = await withRequestTimeout(operation())
    await loadAll(false)
    if (successMessage) toast.success(successMessage, { duration: 1800 })
  } catch (error: unknown) {
    toast.error(t('intermission.toast.updateFailed'), {
      description: errorMessage(error),
      duration: 4000
    })
  } finally {
    directorBusy.value = false
  }
}

function setTestModeEnabled(enabled: boolean): void {
  void runTestOperation(
    () => window.api.setIntermissionTestModeEnabled(enabled),
    enabled ? '无比赛测试已启用' : '无比赛测试已关闭'
  )
}

function setTestStage(stage: BroadcastDirectorSnapshot['runtime']['stage']): void {
  void runTestOperation(() => window.api.setIntermissionTestStage(stage))
}

function savePageFlowTemplates(value: BroadcastPageFlowTemplatesV3): void {
  void runNextOperation(
    () => window.api.updateIntermissionNextPageFlowTemplates(value),
    '页面流程模板已保存'
  )
}

function saveNextLayout(value: IntermissionNextLayoutState): void {
  void runNextOperation(() => window.api.updateIntermissionNextLayout(value), '当前页面设置已保存')
}

async function copyOutputUrl(): Promise<void> {
  try {
    await navigator.clipboard.writeText(outputUrl)
    toast.success(t('intermission.toast.urlCopied'), { duration: 1800 })
  } catch (error: unknown) {
    toast.error(t('intermission.toast.copyFailed'), { description: errorMessage(error) })
  }
}

function openOutput(): void {
  window.open(outputUrl, '_blank', 'noopener,noreferrer')
}

function startPayloadRefresh(): void {
  if (payloadRefreshInterval === null) {
    payloadRefreshInterval = window.setInterval(() => void loadAll(false), 1000)
  }
}

function clearPageTimers(): void {
  if (deadlineRefresh !== null) window.clearTimeout(deadlineRefresh)
  deadlineRefresh = null
  if (payloadRefreshInterval !== null) window.clearInterval(payloadRefreshInterval)
  payloadRefreshInterval = null
}

onMounted(async () => {
  mounted = true
  await loadAll()
  startPayloadRefresh()
})

onActivated(() => {
  if (mounted) {
    void loadAll(false)
    startPayloadRefresh()
  }
})

onDeactivated(clearPageTimers)
onBeforeUnmount(clearPageTimers)
</script>

<style scoped lang="scss">
.intermission-page {
  min-height: 100%;
  padding: 1rem 1rem 3rem;
  overflow-y: auto;
}

.output-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
}

.output-url {
  max-width: 28rem;
  overflow: hidden;
  padding: 0.4rem 0.65rem;
  border-radius: var(--radius);
  color: var(--muted-foreground);
  background: var(--muted);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  color: var(--muted-foreground);
  background: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
}

.status-pill[data-visible='true'] {
  color: #dcfce7;
  background: #15803d;
}

.configuration-error {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, #f59e0b 42%, var(--border));
  border-radius: 0.75rem;
  color: color-mix(in srgb, #f59e0b 82%, var(--foreground));
  background: color-mix(in srgb, #f59e0b 8%, var(--card));
}

.configuration-error > svg {
  width: 1.2rem;
  height: 1.2rem;
  margin-top: 0.1rem;
  flex: 0 0 auto;
}

.flow-control-stack {
  display: grid;
  align-items: start;
  gap: 1rem;
}

.global-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
}

.output-monitor-card {
  display: grid;
  gap: 0.65rem;
  min-width: 0;
  height: 100%;
  padding: 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
}

.output-monitor-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.output-monitor-card h2 {
  font-size: 0.85rem;
  font-weight: 700;
}

.output-monitor-card header span {
  color: var(--muted-foreground);
  font-size: 0.72rem;
}
</style>
