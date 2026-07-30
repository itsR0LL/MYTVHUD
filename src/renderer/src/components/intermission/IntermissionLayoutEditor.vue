<template>
  <section class="space-y-3">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold">{{ t('intermission.layout.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('intermission.layout.desc') }}</p>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2 text-xs">
        <span v-if="isDirty" class="rounded-full bg-amber-500/15 px-2 py-1 text-amber-600">
          {{ t('intermission.layout.unapplied') }}
        </span>
        <span v-if="liveSync" class="rounded-full bg-red-500/15 px-2 py-1 text-red-500">
          {{ t('intermission.layout.syncing') }}
        </span>
        <span
          v-if="liveSync && payload?.state.visible"
          class="rounded-full bg-red-600 px-2 py-1 text-white"
        >
          {{ t('intermission.layout.onAirWarning') }}
        </span>
      </div>
    </div>

    <div class="component-picker" role="group" :aria-label="t('intermission.layout.componentList')">
      <button
        v-for="componentId in componentIds"
        :key="componentId"
        type="button"
        class="component-picker-button"
        :data-active="selectedComponent === componentId"
        :aria-pressed="selectedComponent === componentId"
        @click="selectedComponent = componentId"
      >
        {{ componentName(componentId) }}
      </button>
    </div>

    <IntermissionPreviewFrame :payload="previewPayload">
      <template #default>
        <div class="safe-area" aria-hidden="true"></div>
        <div
          v-for="componentId in componentIds"
          :key="componentId"
          class="selection-box"
          :class="{ 'is-selected': selectedComponent === componentId }"
          :style="selectionStyle(componentId)"
          role="application"
          tabindex="0"
          :aria-label="
            t('intermission.layout.selectionLabel', { name: componentName(componentId) })
          "
          @focus="selectedComponent = componentId"
          @pointerdown="startMove($event, componentId)"
          @keydown="handleSelectionKeydown($event, componentId)"
        >
          <span class="selection-label">{{ componentName(componentId) }}</span>
          <button
            v-if="selectedComponent === componentId"
            class="resize-handle"
            type="button"
            :aria-label="t('intermission.layout.resizeLabel', { name: componentName(componentId) })"
            @pointerdown.stop="startResize($event, componentId)"
          ></button>
        </div>
      </template>
    </IntermissionPreviewFrame>

    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-medium">
        {{
          t('intermission.layout.selectedComponent', {
            name: componentName(selectedComponent)
          })
        }}
      </p>
      <p class="text-xs text-muted-foreground">{{ t('intermission.layout.fixedComponents') }}</p>
    </div>

    <div class="grid gap-3 md:grid-cols-3">
      <label class="space-y-1.5">
        <span class="text-xs font-medium text-muted-foreground">X</span>
        <Input
          :model-value="selectedLayout.x"
          type="number"
          @update:model-value="setCoordinate('x', $event)"
          @keydown.esc.prevent="undoDraft"
        />
      </label>
      <label class="space-y-1.5">
        <span class="text-xs font-medium text-muted-foreground">Y</span>
        <Input
          :model-value="selectedLayout.y"
          type="number"
          @update:model-value="setCoordinate('y', $event)"
          @keydown.esc.prevent="undoDraft"
        />
      </label>
      <label class="space-y-1.5">
        <span class="text-xs font-medium text-muted-foreground">{{
          t('intermission.layout.scale')
        }}</span>
        <Input
          :model-value="Math.round(selectedLayout.scale * 100)"
          type="number"
          :min="INTERMISSION_MIN_SCALE * 100"
          :max="INTERMISSION_MAX_SCALE * 100"
          @update:model-value="setScale"
          @keydown.esc.prevent="undoDraft"
        />
      </label>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <label class="flex items-center gap-2 text-sm">
        <Switch v-model="liveSync" />
        <span>{{ t('intermission.layout.liveSync') }}</span>
      </label>
      <div class="flex flex-wrap justify-end gap-2">
        <Button variant="outline" :disabled="busy || !isDirty" @click="undoDraft">
          {{ t('intermission.layout.undo') }}
        </Button>
        <Button variant="outline" :disabled="busy" @click="resetDraft">
          {{ t('intermission.layout.reset') }}
        </Button>
        <Button :disabled="busy || !isDirty" @click="applyDraft">
          {{ t('intermission.layout.apply') }}
        </Button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import IntermissionPreviewFrame from './IntermissionPreviewFrame.vue'
import {
  createDefaultIntermissionLayout,
  INTERMISSION_CANVAS_HEIGHT,
  INTERMISSION_CANVAS_WIDTH,
  INTERMISSION_COMPONENT_IDS,
  INTERMISSION_COMPONENT_SIZES,
  INTERMISSION_MAX_SCALE,
  INTERMISSION_MIN_SCALE,
  normalizeIntermissionComponentLayout,
  normalizeIntermissionLayout,
  type IntermissionComponentId,
  type IntermissionComponentLayout,
  type IntermissionLayout,
  type IntermissionPayload
} from '../../../../shared/intermission'

const props = defineProps<{
  payload: IntermissionPayload | null
  busy: boolean
}>()
const emit = defineEmits<{
  applyLayout: [layout: IntermissionLayout, silent?: boolean]
}>()
const { t } = useI18n()

const componentIds = INTERMISSION_COMPONENT_IDS
const appliedLayout = reactive<IntermissionLayout>(createDefaultIntermissionLayout())
const draftLayout = reactive<IntermissionLayout>(createDefaultIntermissionLayout())
const selectedComponent = ref<IntermissionComponentId>('teamScore')
const liveSync = ref(false)
const isInteracting = ref(false)
let activeComponent: IntermissionComponentId | null = null
let operation: 'move' | 'resize' | null = null
let pointerId = -1
let pointerStart = { x: 0, y: 0 }
let layoutStart: IntermissionComponentLayout = {
  ...createDefaultIntermissionLayout().teamScore
}
let interactionElement: HTMLElement | null = null
let interactionCanvas: HTMLElement | null = null
let lastLiveSyncAt = 0
let pointerFrame: number | null = null
let queuedPointerPoint: { x: number; y: number } | null = null

const isDirty = computed(() => !sameLayout(appliedLayout, draftLayout))
const selectedLayout = computed(() => draftLayout[selectedComponent.value])
const previewPayload = computed<IntermissionPayload | null>(() => {
  if (!props.payload) return null
  return {
    ...props.payload,
    state: {
      ...props.payload.state,
      visible: true,
      layout: cloneLayout(draftLayout)
    },
    serverNowMs: Date.now()
  }
})

function componentName(componentId: IntermissionComponentId): string {
  return t(`intermission.layout.components.${componentId}`)
}

function cloneLayout(value: IntermissionLayout): IntermissionLayout {
  return Object.fromEntries(
    componentIds.map((componentId) => [componentId, { ...value[componentId] }])
  ) as IntermissionLayout
}

function selectionStyle(componentId: IntermissionComponentId): Record<string, string> {
  const layout = draftLayout[componentId]
  const size = INTERMISSION_COMPONENT_SIZES[componentId]
  return {
    left: `${(layout.x / INTERMISSION_CANVAS_WIDTH) * 100}%`,
    top: `${(layout.y / INTERMISSION_CANVAS_HEIGHT) * 100}%`,
    width: `${((size.width * layout.scale) / INTERMISSION_CANVAS_WIDTH) * 100}%`,
    height: `${((size.height * layout.scale) / INTERMISSION_CANVAS_HEIGHT) * 100}%`
  }
}

function sameLayout(first: IntermissionLayout, second: IntermissionLayout): boolean {
  return componentIds.every((componentId) => {
    const firstComponent = first[componentId]
    const secondComponent = second[componentId]
    return (
      firstComponent.x === secondComponent.x &&
      firstComponent.y === secondComponent.y &&
      firstComponent.scale === secondComponent.scale
    )
  })
}

function replaceComponentLayout(
  target: IntermissionComponentLayout,
  source: IntermissionComponentLayout
): void {
  target.x = source.x
  target.y = source.y
  target.scale = source.scale
}

function replaceLayout(target: IntermissionLayout, source: IntermissionLayout): void {
  for (const componentId of componentIds) {
    replaceComponentLayout(target[componentId], source[componentId])
  }
}

function normalizeAndSet(
  componentId: IntermissionComponentId,
  value: IntermissionComponentLayout
): void {
  replaceComponentLayout(
    draftLayout[componentId],
    normalizeIntermissionComponentLayout(componentId, value)
  )
  publishLiveSync(false)
}

function snapPosition(
  componentId: IntermissionComponentId,
  value: IntermissionComponentLayout
): IntermissionComponentLayout {
  const size = INTERMISSION_COMPONENT_SIZES[componentId]
  const width = size.width * value.scale
  const height = size.height * value.scale
  let x = Math.round(value.x / 8) * 8
  let y = Math.round(value.y / 8) * 8
  const centeredX = (INTERMISSION_CANVAS_WIDTH - width) / 2
  const centeredY = (INTERMISSION_CANVAS_HEIGHT - height) / 2
  if (Math.abs(x - centeredX) <= 12) x = centeredX
  if (Math.abs(y - centeredY) <= 12) y = centeredY
  if (Math.abs(x - 60) <= 12) x = 60
  if (Math.abs(y - 60) <= 12) y = 60
  if (Math.abs(x + width - (INTERMISSION_CANVAS_WIDTH - 60)) <= 12) {
    x = INTERMISSION_CANVAS_WIDTH - 60 - width
  }
  if (Math.abs(y + height - (INTERMISSION_CANVAS_HEIGHT - 60)) <= 12) {
    y = INTERMISSION_CANVAS_HEIGHT - 60 - height
  }
  return normalizeIntermissionComponentLayout(componentId, { ...value, x, y })
}

function canvasPoint(event: PointerEvent): { x: number; y: number } | null {
  if (!interactionCanvas) return null
  const rect = interactionCanvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) * INTERMISSION_CANVAS_WIDTH) / rect.width,
    y: ((event.clientY - rect.top) * INTERMISSION_CANVAS_HEIGHT) / rect.height
  }
}

function beginOperation(
  event: PointerEvent,
  componentId: IntermissionComponentId,
  nextOperation: 'move' | 'resize'
): void {
  interactionElement = event.currentTarget as HTMLElement
  interactionCanvas = interactionElement.closest('.preview-canvas')
  const point = canvasPoint(event)
  if (!point) return
  selectedComponent.value = componentId
  activeComponent = componentId
  operation = nextOperation
  pointerId = event.pointerId
  pointerStart = point
  layoutStart = { ...draftLayout[componentId] }
  isInteracting.value = true
  interactionElement.setPointerCapture(pointerId)
  interactionElement.addEventListener('pointermove', handlePointerMove)
  interactionElement.addEventListener('pointerup', finishOperation)
  interactionElement.addEventListener('pointercancel', cancelOperation)
}

function startMove(event: PointerEvent, componentId: IntermissionComponentId): void {
  if (event.button !== 0) return
  beginOperation(event, componentId, 'move')
}

function startResize(event: PointerEvent, componentId: IntermissionComponentId): void {
  if (event.button !== 0) return
  beginOperation(event, componentId, 'resize')
}

function handlePointerMove(event: PointerEvent): void {
  if (!operation || event.pointerId !== pointerId) return
  const point = canvasPoint(event)
  if (!point) return
  queuedPointerPoint = point
  if (pointerFrame === null) {
    pointerFrame = window.requestAnimationFrame(flushPointerFrame)
  }
}

function applyPointerPoint(point: { x: number; y: number }): void {
  if (!operation || !activeComponent) return
  const deltaX = point.x - pointerStart.x
  const deltaY = point.y - pointerStart.y
  if (operation === 'move') {
    replaceComponentLayout(
      draftLayout[activeComponent],
      snapPosition(activeComponent, {
        ...layoutStart,
        x: layoutStart.x + deltaX,
        y: layoutStart.y + deltaY
      })
    )
  } else {
    const size = INTERMISSION_COMPONENT_SIZES[activeComponent]
    const delta = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY
    const scale = layoutStart.scale + delta / size.width
    replaceComponentLayout(
      draftLayout[activeComponent],
      normalizeIntermissionComponentLayout(activeComponent, { ...layoutStart, scale })
    )
  }
  publishLiveSync(false)
}

function flushPointerFrame(): void {
  pointerFrame = null
  const point = queuedPointerPoint
  queuedPointerPoint = null
  if (point) applyPointerPoint(point)
}

function cancelPointerFrame(): void {
  if (pointerFrame !== null) window.cancelAnimationFrame(pointerFrame)
  pointerFrame = null
  queuedPointerPoint = null
}

function removePointerListeners(): void {
  interactionElement?.removeEventListener('pointermove', handlePointerMove)
  interactionElement?.removeEventListener('pointerup', finishOperation)
  interactionElement?.removeEventListener('pointercancel', cancelOperation)
}

function finishOperation(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return
  if (pointerFrame !== null) window.cancelAnimationFrame(pointerFrame)
  pointerFrame = null
  const point = canvasPoint(event)
  if (point) queuedPointerPoint = point
  if (queuedPointerPoint) flushPointerFrame()
  if (interactionElement?.hasPointerCapture(pointerId)) {
    interactionElement.releasePointerCapture(pointerId)
  }
  removePointerListeners()
  operation = null
  activeComponent = null
  interactionElement = null
  interactionCanvas = null
  isInteracting.value = false
  publishLiveSync(true)
}

function cancelOperation(): void {
  cancelPointerFrame()
  if (activeComponent) {
    replaceComponentLayout(draftLayout[activeComponent], layoutStart)
  }
  removePointerListeners()
  operation = null
  activeComponent = null
  interactionElement = null
  interactionCanvas = null
  isInteracting.value = false
  publishLiveSync(true)
}

function handleSelectionKeydown(event: KeyboardEvent, componentId: IntermissionComponentId): void {
  selectedComponent.value = componentId
  if (event.key === 'Escape' && operation) {
    event.preventDefault()
    cancelOperation()
    return
  }
  const direction: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  }
  const movement = direction[event.key]
  if (!movement) return
  event.preventDefault()
  const step = event.shiftKey ? 8 : 1
  normalizeAndSet(componentId, {
    ...draftLayout[componentId],
    x: draftLayout[componentId].x + movement[0] * step,
    y: draftLayout[componentId].y + movement[1] * step
  })
  publishLiveSync(true)
}

function setCoordinate(key: 'x' | 'y', value: string | number): void {
  const componentId = selectedComponent.value
  normalizeAndSet(componentId, {
    ...draftLayout[componentId],
    [key]: Number(value)
  })
}

function setScale(value: string | number): void {
  const componentId = selectedComponent.value
  normalizeAndSet(componentId, {
    ...draftLayout[componentId],
    scale: Number(value) / 100
  })
}

function undoDraft(): void {
  replaceLayout(draftLayout, appliedLayout)
}

function resetDraft(): void {
  replaceLayout(draftLayout, createDefaultIntermissionLayout())
  publishLiveSync(true)
}

function applyDraft(): void {
  emit('applyLayout', cloneLayout(draftLayout), false)
}

function publishLiveSync(force: boolean): void {
  if (!liveSync.value || sameLayout(draftLayout, appliedLayout)) return
  const now = Date.now()
  if (!force && now - lastLiveSyncAt < 100) return
  lastLiveSyncAt = now
  emit('applyLayout', cloneLayout(draftLayout), true)
}

watch(
  () => props.payload?.state.layout,
  (layout) => {
    if (!layout) return
    const incoming = normalizeIntermissionLayout(layout)
    if (!isDirty.value || sameLayout(incoming, draftLayout)) {
      replaceLayout(draftLayout, incoming)
    }
    replaceLayout(appliedLayout, incoming)
  },
  { immediate: true, deep: true }
)

watch(
  () => liveSync.value,
  (enabled) => {
    if (enabled && isDirty.value) publishLiveSync(true)
  }
)
</script>

<style scoped lang="scss">
.component-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.component-picker-button {
  min-height: 36px;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted-foreground);
  background: var(--background);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background-color 160ms ease;

  &:hover {
    color: var(--foreground);
    background: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid #38bdf8;
    outline-offset: 2px;
  }

  &[data-active='true'] {
    border-color: #38bdf8;
    color: #e0f2fe;
    background: rgba(2, 132, 199, 0.22);
  }
}

.safe-area {
  position: absolute;
  z-index: 3;
  inset: 5.555556% 3.125%;
  border: 1px dashed rgba(251, 191, 36, 0.48);
  pointer-events: none;
}

.selection-box {
  position: absolute;
  z-index: 5;
  border: 1px dashed rgba(148, 163, 184, 0.72);
  outline: none;
  cursor: move;
  touch-action: none;

  &.is-selected {
    z-index: 6;
    border: 2px solid #38bdf8;
    box-shadow: 0 0 0 1px rgba(2, 132, 199, 0.28);
  }

  &:focus-visible {
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.38);
  }
}

.selection-label {
  position: absolute;
  top: -22px;
  left: -1px;
  max-width: 100%;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 3px 3px 0 0;
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.88);
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
}

.selection-box.is-selected .selection-label {
  color: #082f49;
  background: #38bdf8;
}

.resize-handle {
  position: absolute;
  right: -8px;
  bottom: -8px;
  width: 17px;
  height: 17px;
  padding: 0;
  border: 2px solid #e0f2fe;
  border-radius: 3px;
  background: #0284c7;
  cursor: nwse-resize;
  touch-action: none;

  &:focus-visible {
    outline: 3px solid rgba(56, 189, 248, 0.5);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .component-picker-button {
    transition: none;
  }
}
</style>
