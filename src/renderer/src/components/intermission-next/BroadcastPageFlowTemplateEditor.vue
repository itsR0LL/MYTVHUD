<template>
  <section class="page-flow-editor" aria-labelledby="page-flow-editor-title">
    <header class="editor-header">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="page-flow-editor-title" class="text-base font-semibold">页面播放流程</h2>
          <span v-if="isDirty" class="draft-badge">未保存修改</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">设置各播出阶段的启用状态和播放时长。</p>
      </div>
      <div class="header-actions">
        <Button variant="outline" :disabled="busy || !isDirty" @click="discardDraft">
          <Undo2 aria-hidden="true" />
          撤销草稿
        </Button>
        <Button :disabled="busy || !isDirty || blockingTypes.length > 0" @click="saveDraft">
          <Save aria-hidden="true" />
          保存模板
        </Button>
      </div>
    </header>

    <div class="page-list">
      <article
        v-for="type in programTypes"
        :key="type"
        class="page-card"
        :data-enabled="pageTemplate(type).enabled"
      >
        <div class="page-card-header">
          <div class="page-identity">
            <span class="page-icon">
              <Map v-if="type === 'map_break'" aria-hidden="true" />
              <Trophy v-else-if="type === 'series_end'" aria-hidden="true" />
              <RadioTower v-else aria-hidden="true" />
            </span>
            <div>
              <h3 class="text-sm font-semibold">{{ broadcastPageLabel(type) }}</h3>
              <p class="mt-1 text-xs text-muted-foreground">
                {{ broadcastPageDescription(type) }}
              </p>
            </div>
          </div>
          <label class="enable-control">
            <span>{{ pageTemplate(type).enabled ? '已启用' : '已停用' }}</span>
            <Switch
              :model-value="pageTemplate(type).enabled"
              :disabled="busy"
              :aria-label="`${broadcastPageLabel(type)}启用`"
              @update:model-value="setEnabled(type, Boolean($event))"
            />
          </label>
        </div>

        <div class="duration-control">
          <label class="control-label" :for="`page-duration-${type}`">
            <Clock3 class="h-4 w-4" aria-hidden="true" />
            播放时长（分钟）
          </label>
          <Input
            :id="`page-duration-${type}`"
            :model-value="durationMinutes(type)"
            type="number"
            :min="0"
            :max="maximumDurationMinutes"
            step="any"
            inputmode="decimal"
            :disabled="busy"
            :aria-describedby="`page-duration-help-${type}`"
            @update:model-value="setDurationMinutes(type, $event)"
          />
          <p :id="`page-duration-help-${type}`" class="text-xs text-muted-foreground">
            启用页面后，播放时长必须覆盖完整的进场、展示和退场。
          </p>
        </div>

        <div v-if="type === 'map_break'" class="preset-section">
          <span class="control-label">地图间快捷时长</span>
          <div class="preset-list">
            <Button
              v-for="durationMs in mapBreakPresets"
              :key="durationMs"
              size="sm"
              :variant="
                pageTemplate(type).defaultTotalDurationMs === durationMs ? 'default' : 'outline'
              "
              :disabled="busy"
              @click="setDuration(type, durationMs)"
            >
              {{ durationMs / 60000 }} 分钟
            </Button>
          </div>
        </div>

        <div
          class="timing-status"
          :data-status="timing(type).status"
          role="status"
          aria-live="polite"
        >
          <CircleOff
            v-if="timing(type).status === 'disabled'"
            class="status-icon"
            aria-hidden="true"
          />
          <AlertTriangle
            v-else-if="timing(type).status === 'invalid' || timing(type).status === 'insufficient'"
            class="status-icon"
            aria-hidden="true"
          />
          <CircleCheck v-else class="status-icon" aria-hidden="true" />
          <p>{{ timingMessage(type) }}</p>
        </div>
      </article>
    </div>

    <div v-if="blockingTypes.length > 0" class="save-warning" role="alert">
      <AlertTriangle aria-hidden="true" />
      <p>
        暂不能保存：请先修正{{
          blockingTypes.map((type) => broadcastPageLabel(type)).join('、')
        }}的总时长。系统不会压缩页面进入或退出动画。
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  CircleCheck,
  CircleOff,
  Clock3,
  Map,
  RadioTower,
  Save,
  Trophy,
  Undo2
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  BROADCAST_MAX_TOTAL_DURATION_MS,
  BROADCAST_PROGRAM_TYPES,
  MAP_BREAK_DURATION_PRESETS_MS,
  type BroadcastProgramType
} from '../../../../shared/broadcast-flow'
import {
  createUnconfiguredBroadcastPageFlowTemplates,
  type BroadcastPageFlowTemplatesV3,
  type BroadcastPageLifecycleDuration
} from '../../../../shared/broadcast-page-flow-next/page-flow'
import {
  broadcastPageDescription,
  broadcastPageFlowTemplatesAreEqual,
  broadcastPageLabel,
  cloneBroadcastPageFlowTemplates,
  evaluateBroadcastPageTiming,
  formatBroadcastPageDuration,
  setBroadcastPageDuration,
  setBroadcastPageEnabled,
  type BroadcastPageTiming
} from './page-flow-editor-helpers'

const props = withDefaults(
  defineProps<{
    templates?: BroadcastPageFlowTemplatesV3 | null
    lifecycleDurations: Record<BroadcastProgramType, BroadcastPageLifecycleDuration>
    busy?: boolean
  }>(),
  {
    templates: null,
    busy: false
  }
)
const emit = defineEmits<{
  save: [templates: BroadcastPageFlowTemplatesV3]
}>()

const programTypes = BROADCAST_PROGRAM_TYPES
const mapBreakPresets = MAP_BREAK_DURATION_PRESETS_MS
const maximumDurationMinutes = BROADCAST_MAX_TOTAL_DURATION_MS / 60_000
const appliedTemplates = ref(
  cloneBroadcastPageFlowTemplates(props.templates ?? createUnconfiguredBroadcastPageFlowTemplates())
)
const draftTemplates = ref(cloneBroadcastPageFlowTemplates(appliedTemplates.value))
const isDirty = computed(
  () => !broadcastPageFlowTemplatesAreEqual(appliedTemplates.value, draftTemplates.value)
)
const timingByType = computed(
  () =>
    Object.fromEntries(
      programTypes.map((type) => [
        type,
        evaluateBroadcastPageTiming(
          draftTemplates.value.templates[type],
          props.lifecycleDurations[type]
        )
      ])
    ) as Record<BroadcastProgramType, BroadcastPageTiming>
)
const blockingTypes = computed(() =>
  programTypes.filter((type) => {
    const status = timingByType.value[type].status
    return status === 'invalid' || status === 'insufficient'
  })
)

function pageTemplate(type: BroadcastProgramType) {
  return draftTemplates.value.templates[type]
}

function durationMinutes(type: BroadcastProgramType): number {
  return Number((pageTemplate(type).defaultTotalDurationMs / 60_000).toFixed(3))
}

function timing(type: BroadcastProgramType): BroadcastPageTiming {
  return timingByType.value[type]
}

function replaceDraft(value: unknown): void {
  draftTemplates.value = cloneBroadcastPageFlowTemplates(value)
}

function setEnabled(type: BroadcastProgramType, enabled: boolean): void {
  replaceDraft(setBroadcastPageEnabled(draftTemplates.value, type, enabled))
}

function setDuration(type: BroadcastProgramType, durationMs: number): void {
  replaceDraft(setBroadcastPageDuration(draftTemplates.value, type, durationMs))
}

function setDurationMinutes(type: BroadcastProgramType, value: string | number): void {
  const minutes = Number(value)
  setDuration(type, Number.isFinite(minutes) ? Math.round(minutes * 60_000) : 0)
}

function timingMessage(type: BroadcastProgramType): string {
  const value = timing(type)
  if (value.status === 'disabled') return '此播出阶段已停用。'
  if (value.status === 'invalid') {
    return `播放时长无效。有效范围为 ${formatBroadcastPageDuration(
      value.minimumAllowedDurationMs
    )}–${formatBroadcastPageDuration(value.maximumAllowedDurationMs)}。`
  }
  if (value.status === 'insufficient') {
    return `当前 ${formatBroadcastPageDuration(
      value.totalDurationMs,
      true
    )}，进入 ${formatBroadcastPageDuration(
      value.enterDurationMs,
      true
    )} + 退出 ${formatBroadcastPageDuration(
      value.exitDurationMs,
      true
    )} 至少需要 ${formatBroadcastPageDuration(
      value.minimumDurationMs,
      true
    )}，还差 ${formatBroadcastPageDuration(value.deficitDurationMs, true)}。系统不会压缩页面动画。`
  }
  return `进入 ${formatBroadcastPageDuration(
    value.enterDurationMs,
    true
  )} · 稳定展示 ${formatBroadcastPageDuration(
    value.holdDurationMs,
    true
  )} · 退出 ${formatBroadcastPageDuration(value.exitDurationMs, true)}。`
}

function discardDraft(): void {
  replaceDraft(appliedTemplates.value)
}

function saveDraft(): void {
  if (blockingTypes.value.length > 0) return
  emit('save', cloneBroadcastPageFlowTemplates(draftTemplates.value))
}

watch(
  () => props.templates,
  (templates) => {
    const incoming = cloneBroadcastPageFlowTemplates(
      templates ?? createUnconfiguredBroadcastPageFlowTemplates()
    )
    if (!isDirty.value || broadcastPageFlowTemplatesAreEqual(incoming, draftTemplates.value)) {
      replaceDraft(incoming)
    }
    appliedTemplates.value = incoming
  },
  { deep: true }
)
</script>

<style scoped lang="scss">
.page-flow-editor {
  --flow-accent: #38bdf8;
  --flow-warning: #f59e0b;
  display: grid;
  gap: 1rem;
  color: var(--foreground);
}

.editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 18%);
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.draft-badge {
  padding: 0.2rem 0.5rem;
  border: 1px solid color-mix(in srgb, var(--flow-warning) 48%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--flow-warning) 14%, transparent);
  color: var(--flow-warning);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.page-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.page-card {
  display: grid;
  align-content: start;
  gap: 1rem;
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--card) 94%, transparent);
  box-shadow: 0 1px 2px rgb(0 0 0 / 14%);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.page-card[data-enabled='true'] {
  border-color: color-mix(in srgb, var(--flow-accent) 42%, var(--border));
  box-shadow:
    0 1px 2px rgb(0 0 0 / 18%),
    inset 0 1px 0 color-mix(in srgb, var(--flow-accent) 12%, transparent);
}

.page-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.page-identity {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  min-width: 0;
}

.page-icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid color-mix(in srgb, var(--flow-accent) 25%, var(--border));
  border-radius: 0.55rem;
  background: color-mix(in srgb, var(--flow-accent) 8%, transparent);
  color: var(--flow-accent);
  flex: 0 0 auto;
}

.page-icon svg {
  width: 1rem;
  height: 1rem;
}

.enable-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
  color: var(--muted-foreground);
  font-size: 0.75rem;
}

.duration-control {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  padding-top: 0.85rem;
  border-top: 1px solid var(--border);
}

.preset-section {
  display: grid;
  gap: 0.5rem;
}

.utility-replay-control {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.8rem;
  border: 1px solid color-mix(in srgb, var(--flow-accent) 24%, var(--border));
  border-radius: 0.55rem;
  background: color-mix(in srgb, var(--flow-accent) 6%, transparent);
}

.utility-replay-control strong {
  font-size: 0.78rem;
}

.utility-replay-control p {
  margin-top: 0.28rem;
  color: var(--muted-foreground);
  font-size: 0.7rem;
  line-height: 1.45;
}

.preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.control-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--muted-foreground);
  font-size: 0.72rem;
  font-weight: 650;
}

.control-label > svg {
  flex: 0 0 auto;
}

.timing-status {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  min-height: 3.4rem;
  padding: 0.7rem;
  border: 1px solid var(--border);
  border-radius: 0.55rem;
  background: color-mix(in srgb, var(--muted) 34%, transparent);
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1.5;
}

.timing-status[data-status='ready'] {
  border-color: color-mix(in srgb, #22c55e 28%, var(--border));
  color: color-mix(in srgb, #86efac 78%, var(--foreground));
}

.timing-status[data-status='invalid'],
.timing-status[data-status='insufficient'] {
  border-color: color-mix(in srgb, var(--flow-warning) 38%, var(--border));
  color: color-mix(in srgb, var(--flow-warning) 82%, var(--foreground));
}

.status-icon {
  width: 1rem;
  height: 1rem;
  margin-top: 0.12rem;
  flex: 0 0 auto;
}

.save-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.8rem 1rem;
  border: 1px solid color-mix(in srgb, var(--flow-warning) 42%, var(--border));
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--flow-warning) 9%, var(--card));
  color: color-mix(in srgb, var(--flow-warning) 82%, var(--foreground));
  font-size: 0.8rem;
}

.save-warning svg {
  width: 1rem;
  height: 1rem;
  margin-top: 0.1rem;
  flex: 0 0 auto;
}

@media (max-width: 1180px) {
  .page-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .editor-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    justify-content: stretch;
  }

  .header-actions > * {
    flex: 1;
  }

  .page-card-header {
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .page-flow-editor :deep(*) {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
