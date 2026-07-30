<template>
  <div class="intermission-page">
    <header class="output-header">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-xl font-semibold">{{ t('intermission.title') }}</h1>
          <span class="status-pill" :data-visible="payload?.state.visible === true">
            {{
              payload?.state.visible
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
      <div class="flex flex-col items-end gap-2">
        <div class="flex gap-2">
          <Button
            v-if="!payload?.state.visible"
            :disabled="controlBusy || !canShow"
            @click="handleStateUpdate({ visible: true })"
          >
            <Eye />{{ t('intermission.output.show') }}
          </Button>
          <Button
            v-else
            variant="destructive"
            :disabled="controlBusy"
            @click="handleStateUpdate({ visible: false })"
          >
            <EyeOff />{{ t('intermission.output.hide') }}
          </Button>
          <Button variant="outline" :disabled="refreshing" @click="loadPayload">
            <RefreshCw />{{ t('intermission.output.refresh') }}
          </Button>
        </div>
        <p v-if="showDisabledReason" class="max-w-sm text-right text-xs text-destructive">
          {{ showDisabledReason }}
        </p>
      </div>
    </header>

    <div v-if="loading" class="flex min-h-80 items-center justify-center text-muted-foreground">
      {{ t('intermission.loading') }}
    </div>

    <div v-else-if="!payload?.match" class="empty-state">
      <TvMinimalPlay class="h-10 w-10 text-muted-foreground" />
      <h2 class="text-lg font-semibold">{{ t('intermission.noMatch.title') }}</h2>
      <p class="max-w-lg text-center text-sm text-muted-foreground">
        {{ t('intermission.noMatch.desc') }}
      </p>
      <Button variant="outline" @click="router.push('/matchs')">
        {{ t('intermission.noMatch.action') }}
      </Button>
    </div>

    <div v-else class="control-grid">
      <div class="min-w-0 rounded-lg border bg-card p-4 shadow-sm">
        <IntermissionLayoutEditor
          :payload="payload"
          :busy="layoutBusy"
          @apply-layout="handleLayoutUpdate"
        />
      </div>

      <aside class="space-y-4">
        <IntermissionMatchControls
          :payload="payload"
          :busy="controlBusy"
          @update-state="handleStateUpdate"
          @update-map-status="handleMapStatusUpdate"
        />
        <IntermissionTimerControls
          :timer="payload.state.timer"
          :server-now-ms="payload.serverNowMs"
          :busy="controlBusy"
          @command="handleTimerCommand"
        />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Copy, ExternalLink, Eye, EyeOff, RefreshCw, TvMinimalPlay } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import IntermissionLayoutEditor from '@/components/intermission/IntermissionLayoutEditor.vue'
import IntermissionMatchControls from '@/components/intermission/IntermissionMatchControls.vue'
import IntermissionTimerControls from '@/components/intermission/IntermissionTimerControls.vue'
import { normalizeIntermissionLayout } from '../../../shared/intermission'
import type {
  IntermissionLayout,
  IntermissionMapStatusUpdate,
  IntermissionPayload,
  IntermissionStateUpdate,
  IntermissionTimerCommand
} from '../../../shared/intermission'

const outputUrl = 'http://localhost:5031/intermission'
const { t } = useI18n()
const router = useRouter()
const payload = ref<IntermissionPayload | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const controlBusy = ref(false)
const layoutBusy = ref(false)
let mounted = false
let deadlineRefresh: number | null = null
let layoutRequestRunning = false
let pendingLayout: { layout: IntermissionLayout; silent: boolean } | null = null
const INTERMISSION_REQUEST_TIMEOUT_MS = 8000

const canShow = computed(() => Boolean(payload.value?.match && payload.value.state.nextMapId))
const showDisabledReason = computed(() => {
  if (payload.value?.state.visible) return ''
  if (!payload.value?.match) return t('intermission.output.noValidMatch')
  if (!payload.value.state.nextMapId) return t('intermission.output.noNextMap')
  return ''
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  if (payload.value && nextPayload.state.revision < payload.value.state.revision) return
  payload.value = nextPayload
  if (deadlineRefresh !== null) window.clearTimeout(deadlineRefresh)
  const timer = nextPayload.state.timer
  if (timer.status === 'running' && timer.deadlineAtMs !== null) {
    const delay = Math.max(0, timer.deadlineAtMs - nextPayload.serverNowMs) + 150
    deadlineRefresh = window.setTimeout(() => void loadPayload(false), delay)
  }
}

async function loadPayload(showError = true): Promise<void> {
  if (refreshing.value) return
  refreshing.value = true
  try {
    setPayload(await withRequestTimeout(window.api.getIntermissionState()))
  } catch (error: unknown) {
    if (showError)
      toast.error(t('intermission.toast.loadFailed'), { description: errorMessage(error) })
  } finally {
    refreshing.value = false
    loading.value = false
  }
}

async function runOperation(
  operation: () => Promise<IntermissionPayload>,
  successMessage?: string
): Promise<void> {
  if (controlBusy.value) return
  controlBusy.value = true
  try {
    setPayload(await withRequestTimeout(operation()))
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

function handleStateUpdate(update: IntermissionStateUpdate): void {
  void runOperation(() => window.api.updateIntermissionState(update))
}

function handleLayoutUpdate(layout: IntermissionLayout, silent = false): void {
  pendingLayout = {
    layout: normalizeIntermissionLayout(layout),
    silent: (pendingLayout?.silent ?? true) && silent
  }
  void flushLayoutQueue()
}

async function flushLayoutQueue(): Promise<void> {
  if (layoutRequestRunning || !pendingLayout) return
  layoutRequestRunning = true
  layoutBusy.value = true
  try {
    while (pendingLayout) {
      const request = pendingLayout
      pendingLayout = null
      setPayload(
        await withRequestTimeout(window.api.updateIntermissionState({ layout: request.layout }))
      )
      if (!request.silent) {
        toast.success(t('intermission.toast.layoutApplied'), { duration: 1800 })
      }
    }
  } catch (error: unknown) {
    toast.error(t('intermission.toast.updateFailed'), {
      description: errorMessage(error),
      duration: 4000
    })
  } finally {
    layoutRequestRunning = false
    layoutBusy.value = false
    if (pendingLayout) void flushLayoutQueue()
  }
}

function handleMapStatusUpdate(update: IntermissionMapStatusUpdate): void {
  void runOperation(() => window.api.updateIntermissionMapStatus(update))
}

function handleTimerCommand(command: IntermissionTimerCommand): void {
  void runOperation(() => window.api.sendIntermissionTimerCommand(command))
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

onMounted(async () => {
  mounted = true
  await loadPayload()
})

onActivated(() => {
  if (mounted) void loadPayload(false)
})

function clearPageTimers(): void {
  if (deadlineRefresh !== null) window.clearTimeout(deadlineRefresh)
  deadlineRefresh = null
}

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
  max-width: 24rem;
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

  &[data-visible='true'] {
    color: #dcfce7;
    background: #15803d;
  }
}

.control-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(330px, 0.85fr);
  align-items: start;
  gap: 1rem;
}

.empty-state {
  display: flex;
  min-height: 24rem;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.75rem;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--card);
}

@media (max-width: 1180px) {
  .control-grid {
    grid-template-columns: 1fr;
  }
}
</style>
