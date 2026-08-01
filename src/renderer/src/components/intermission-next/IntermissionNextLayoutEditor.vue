<template>
  <section class="page-settings" aria-labelledby="page-settings-title">
    <header class="settings-header">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="page-settings-title" class="text-base font-semibold">页面设置</h2>
          <span v-if="isCurrentPageDirty" class="draft-badge">当前页面未保存</span>
        </div>
        <p class="mt-1 text-sm text-muted-foreground">
          为每个页面添加需要的系统组件，并分别保存布局和显示时间。
        </p>
      </div>
      <div class="header-actions">
        <Button
          variant="outline"
          :disabled="busy || !isCurrentPageDirty"
          @click="discardCurrentPage"
        >
          <Undo2 aria-hidden="true" />撤销当前页
        </Button>
        <Button
          :disabled="busy || !isCurrentPageDirty || timelineHasErrors"
          @click="saveCurrentPage"
        >
          <Save aria-hidden="true" />保存当前页面
        </Button>
      </div>
    </header>

    <nav class="page-tabs" aria-label="选择页面">
      <button
        v-for="pageId in pageIds"
        :key="pageId"
        type="button"
        class="page-tab"
        :data-active="selectedPage === pageId"
        :disabled="isCurrentPageDirty && selectedPage !== pageId"
        :title="isCurrentPageDirty && selectedPage !== pageId ? '请先保存或撤销当前页面的修改' : ''"
        @click="selectPage(pageId)"
      >
        {{ pageLabel(pageId) }}
      </button>
    </nav>

    <div class="settings-grid">
      <div class="canvas-column">
        <div class="canvas-toolbar">
          <div>
            <strong>{{ pageLabel(selectedPage) }}</strong>
            <span>{{ formatTime(cursorMs) }} / {{ formatTime(pageDurationMs) }}</span>
          </div>
          <label class="cursor-control">
            <span>预览时间</span>
            <input
              :value="cursorMs"
              type="range"
              min="0"
              :max="pageDurationMs"
              step="100"
              @input="setCursorFromInput"
            />
          </label>
        </div>

        <div class="canvas-shell">
          <div ref="canvasElement" class="layout-canvas">
            <IntermissionNextPreviewFrame
              class="canvas-preview"
              :src="previewSrc"
              :payload="editorPreviewPayload"
            />
            <div class="safe-area" aria-hidden="true"><span>安全区</span></div>
            <div class="center-line center-line-x" aria-hidden="true"></div>
            <div class="center-line center-line-y" aria-hidden="true"></div>
            <div
              v-if="alignmentGuides.x !== null"
              class="snap-guide snap-guide-x"
              :style="{ left: `${(alignmentGuides.x / canvasWidth) * 100}%` }"
              aria-hidden="true"
            ></div>
            <div
              v-if="alignmentGuides.y !== null"
              class="snap-guide snap-guide-y"
              :style="{ top: `${(alignmentGuides.y / canvasHeight) * 100}%` }"
              aria-hidden="true"
            ></div>

            <div
              v-for="definition in canvasDefinitions"
              :key="definition.id"
              class="selection-box"
              :class="{ 'is-selected': selectedComponentId === definition.id }"
              :style="selectionStyle(definition.id)"
              role="button"
              tabindex="0"
              :aria-label="definition.label"
              @click="selectComponent(definition.id)"
              @keydown.enter.prevent="selectComponent(definition.id)"
              @keydown.space.prevent="selectComponent(definition.id)"
              @pointerdown="startMove($event, definition.id)"
            >
              <span class="selection-label">{{ definition.label }}</span>
              <template v-if="selectedComponentId === definition.id">
                <button
                  v-for="handle in resizeHandles"
                  :key="handle"
                  type="button"
                  class="resize-handle"
                  :data-handle="handle"
                  :aria-label="`${definition.label}缩放`"
                  @pointerdown.stop.prevent="startResize($event, definition.id, handle)"
                ></button>
              </template>
            </div>
          </div>
        </div>

        <section class="timeline-panel" aria-labelledby="timeline-title">
          <header class="timeline-header">
            <div>
              <h3 id="timeline-title" class="text-sm font-semibold">页面时间轴</h3>
              <p class="text-xs text-muted-foreground">
                点击轨道可移动预览时间。页内定时转场固定播放
                {{ transitionDurationLabel }}。
              </p>
            </div>
            <span>{{ formatTime(pageDurationMs) }}</span>
          </header>

          <div class="timeline-ruler" @pointerdown="seekTimeline">
            <span>00:00</span>
            <span>{{ formatTime(Math.round(pageDurationMs / 2)) }}</span>
            <span>{{ formatTime(pageDurationMs) }}</span>
            <i :style="{ left: timelineLeft(cursorMs) }"></i>
          </div>

          <div v-if="timelineRows.length === 0" class="timeline-empty">当前页面尚未添加组件。</div>
          <div v-else class="timeline-rows">
            <div v-for="row in timelineRows" :key="row.key" class="timeline-row">
              <button type="button" class="timeline-row-label" @click="selectTimelineRow(row)">
                {{ row.label }}
              </button>
              <div class="timeline-track" @pointerdown="seekTimeline">
                <span
                  v-for="clip in row.clips"
                  :key="clip.id"
                  class="timeline-clip"
                  :data-kind="row.kind"
                  :style="clipStyle(clip.startOffsetMs, clip.endOffsetMs)"
                  :title="`${formatTime(clip.startOffsetMs)} - ${formatTime(clip.endOffsetMs)}`"
                ></span>
                <i :style="{ left: timelineLeft(cursorMs) }"></i>
              </div>
            </div>
          </div>
          <p v-if="timelineError" class="timeline-error" role="alert">
            {{ timelineError }}
          </p>
        </section>
      </div>

      <aside class="inspector" aria-label="组件管理">
        <section class="inspector-section">
          <div class="section-heading">
            <div>
              <h3 class="text-sm font-semibold">组件管理</h3>
              <p class="text-xs text-muted-foreground">只显示已经添加到当前页面的组件。</p>
            </div>
            <Button size="sm" @click="catalogOpen = !catalogOpen">
              <Plus aria-hidden="true" />添加组件
            </Button>
          </div>

          <div v-if="catalogOpen" class="component-catalog">
            <button
              v-for="definition in componentDefinitions"
              :key="definition.id"
              type="button"
              :disabled="
                definition.required ||
                (definition.kind === 'transition'
                  ? !canAddTransitionAtCursor
                  : isComponentAdded(definition.id))
              "
              @click="addDefinition(definition.id)"
            >
              <span>{{ definition.label }}</span>
              <small v-if="definition.required">固定内容</small>
              <small v-else-if="definition.kind === 'transition'">{{
                transitionCatalogHint
              }}</small>
              <small v-else-if="isComponentAdded(definition.id)">已添加</small>
              <Plus v-else aria-hidden="true" />
            </button>
          </div>

          <div
            v-if="addedDefinitions.length === 0 && currentPage.transitions.length === 0"
            class="component-empty"
          >
            当前页面没有组件。
          </div>
          <div v-else class="component-list">
            <button
              v-for="definition in addedDefinitions"
              :key="definition.id"
              type="button"
              :data-selected="selectedComponentId === definition.id"
              @click="selectComponent(definition.id)"
            >
              <span>{{ definition.label }}</span>
              <small v-if="definition.required">固定显示</small>
              <small v-else>{{ activeAtCursor(definition.id) ? '当前显示' : '当前未显示' }}</small>
            </button>
            <button
              v-for="transition in currentPage.transitions"
              :key="transition.id"
              type="button"
              :data-selected="selectedTransitionId === transition.id"
              @click="selectTransition(transition.id)"
            >
              <span>页内定时转场</span>
              <small
                >{{ formatTime(transition.startOffsetMs) }} · 固定
                {{ transitionDurationLabel }}</small
              >
            </button>
          </div>
        </section>

        <section v-if="selectedDefinition && selectedLayout" class="inspector-section">
          <div class="section-heading">
            <h3 class="text-sm font-semibold">{{ selectedDefinition.label }}</h3>
            <Button
              v-if="!selectedDefinition.required"
              size="icon"
              variant="destructive"
              title="删除组件"
              @click="removeSelectedComponent"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>

          <p v-if="selectedDefinition.required" class="fixed-component-note">
            此内容属于 BP 页面的固定全屏展示，不允许移动、缩放、修改时间或删除。
          </p>

          <div v-if="selectedDefinition.canvasEditable !== false" class="frame-grid">
            <label v-for="field in frameFields" :key="field.key">
              <span>{{ field.label }}</span>
              <Input
                type="number"
                :model-value="roundedSelectedLayout[field.key]"
                @update:model-value="updateFrameField(field.key, $event)"
              />
            </label>
          </div>

          <div v-if="selectedDefinition.canvasEditable !== false" class="toggle-row">
            <div>
              <strong>锁定宽高比</strong>
              <p>缩放时保持组件设计比例。</p>
            </div>
            <Switch
              :model-value="selectedLayout.aspectRatioLocked"
              @update:model-value="setAspectRatioLocked(Boolean($event))"
            />
          </div>

          <div
            v-if="!selectedDefinition.required && selectedDefinition.kind === 'utility_replay'"
            class="utility-window"
          >
            <label>
              <span>开始（分钟）</span>
              <Input
                type="number"
                min="0"
                :max="utilityStartMaximumMinutes"
                step="1"
                inputmode="decimal"
                :model-value="millisecondsToMinutes(selectedWindows[0]?.startOffsetMs ?? 0)"
                @update:model-value="updateUtilityStart"
              />
            </label>
            <span>固定播放 2 分钟</span>
          </div>

          <div
            v-if="!selectedDefinition.required && selectedDefinition.kind !== 'utility_replay'"
            class="window-heading"
          >
            <strong>显示时间</strong>
            <Button size="sm" variant="outline" @click="addSelectedWindow">
              <Plus aria-hidden="true" />添加时间片段
            </Button>
          </div>
          <p
            v-if="!selectedDefinition.required && selectedDefinition.kind !== 'utility_replay'"
            class="time-input-help"
          >
            可直接输入分钟；输入框箭头每次调整 1 分钟。
          </p>
          <div
            v-if="!selectedDefinition.required && selectedDefinition.kind !== 'utility_replay'"
            class="window-list"
          >
            <article v-for="window in selectedWindows" :key="window.id" class="window-card">
              <label>
                <span>开始（分钟）</span>
                <Input
                  type="number"
                  min="0"
                  :max="pageDurationMinutes"
                  step="1"
                  inputmode="decimal"
                  :model-value="millisecondsToMinutes(window.startOffsetMs)"
                  @update:model-value="updateWindowStart(window.id, $event)"
                />
              </label>
              <label>
                <span>结束（分钟）</span>
                <Input
                  type="number"
                  min="0"
                  :max="pageDurationMinutes"
                  step="1"
                  inputmode="decimal"
                  :disabled="window.endOffsetMs === null"
                  :model-value="millisecondsToMinutes(window.endOffsetMs ?? pageDurationMs)"
                  @update:model-value="updateWindowEnd(window.id, $event)"
                />
              </label>
              <label class="until-end-control">
                <Switch
                  :model-value="window.endOffsetMs === null"
                  @update:model-value="setWindowUntilEnd(window.id, Boolean($event))"
                />
                <span>持续到页面结束</span>
              </label>
              <Button
                size="icon"
                variant="ghost"
                title="删除时间片段"
                @click="removeWindow(window.id)"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </article>
          </div>

          <Button
            v-if="!selectedDefinition.required && selectedDefinition.canvasEditable !== false"
            variant="outline"
            class="w-full"
            @click="restoreSelectedComponent"
          >
            <RotateCcw aria-hidden="true" />恢复组件默认尺寸
          </Button>
        </section>

        <section v-if="selectedTransition" class="inspector-section">
          <div class="section-heading">
            <h3 class="text-sm font-semibold">页内定时转场</h3>
            <Button
              size="icon"
              variant="destructive"
              title="删除页内定时转场"
              @click="removeTransition(selectedTransition.id)"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
          <p class="fixed-component-note">
            此组件按页面时间轴播放，与切换页面时自动执行的转场互不替代。播出时长固定，不可调整。
          </p>
          <article class="transition-row">
            <label>
              <span>开始（分钟）</span>
              <Input
                type="number"
                min="0.001"
                step="1"
                inputmode="decimal"
                :max="transitionStartMaximumMinutes"
                :model-value="millisecondsToMinutes(selectedTransition.startOffsetMs)"
                @update:model-value="updateTransitionStart(selectedTransition.id, $event)"
              />
            </label>
            <label>
              <span>播出时长</span>
              <Input :model-value="transitionDurationLabel" disabled />
            </label>
          </article>
        </section>

        <section class="inspector-section">
          <Button variant="outline" class="w-full" @click="clearCurrentPage">
            <RotateCcw aria-hidden="true" />清空当前页面
          </Button>
        </section>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Plus, RotateCcw, Save, Trash2, Undo2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  INTERMISSION_NEXT_CANVAS_HEIGHT,
  INTERMISSION_NEXT_CANVAS_WIDTH,
  INTERMISSION_NEXT_PAGE_IDS,
  INTERMISSION_NEXT_RESIZE_HANDLES,
  INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS,
  addIntermissionNextComponent,
  createDefaultIntermissionNextLayoutState,
  getIntermissionNextComponentDefinition,
  getIntermissionNextComponentDefinitions,
  removeIntermissionNextComponent,
  removeIntermissionNextTransition,
  resetIntermissionNextComponent,
  resetIntermissionNextPage,
  resizeIntermissionNextComponent,
  setIntermissionNextComponentAspectRatioLocked,
  setIntermissionNextComponentFrame,
  setIntermissionNextComponentPosition,
  setIntermissionNextComponentWindows,
  setIntermissionNextTransitionStart,
  snapIntermissionNextComponentPosition,
  type IntermissionNextComponentWindow,
  type IntermissionNextLayoutState,
  type IntermissionNextPageId,
  type IntermissionNextResizeHandle,
  type IntermissionNextTransitionComponent
} from '../../../../shared/intermission-next'
import type { IntermissionNextOutputPayloadV1 } from '../../../../shared/intermission-output-next/output'
import { UTILITY_REPLAY_TOTAL_DURATION_MS } from '../../../../shared/utility-replay'
import {
  cloneIntermissionNextLayoutState,
  findIntermissionNextAlignmentGuides,
  intermissionNextCanvasPoint,
  intermissionNextSelectionStyle,
  type IntermissionNextAlignmentGuides,
  type IntermissionNextCanvasPoint
} from './editor-helpers'
import { createEditorPreviewPayload } from './editor-preview-data'
import IntermissionNextPreviewFrame from './IntermissionNextPreviewFrame.vue'

type FrameField = 'x' | 'y' | 'width' | 'height'
type TimelineClip = { id: string; startOffsetMs: number; endOffsetMs: number }
type TimelineRow = {
  key: string
  label: string
  kind: 'component' | 'transition'
  componentId?: string
  transitionId?: string
  clips: TimelineClip[]
}
type Interaction = {
  kind: 'move' | 'resize'
  componentId: string
  startPoint: IntermissionNextCanvasPoint
  startState: IntermissionNextLayoutState
  handle?: IntermissionNextResizeHandle
}

const props = withDefaults(
  defineProps<{
    layout?: IntermissionNextLayoutState | null
    busy?: boolean
    pageDurations: Record<IntermissionNextPageId, number>
    previewSrc: string
    previewPayload: IntermissionNextOutputPayloadV1
  }>(),
  { layout: null, busy: false }
)
const emit = defineEmits<{ save: [layout: IntermissionNextLayoutState] }>()

const pageIds = INTERMISSION_NEXT_PAGE_IDS
const resizeHandles = INTERMISSION_NEXT_RESIZE_HANDLES
const canvasWidth = INTERMISSION_NEXT_CANVAS_WIDTH
const canvasHeight = INTERMISSION_NEXT_CANVAS_HEIGHT
const appliedState = ref(
  cloneIntermissionNextLayoutState(props.layout ?? createDefaultIntermissionNextLayoutState())
)
const draftState = ref(cloneIntermissionNextLayoutState(appliedState.value))
const selectedPage = ref<IntermissionNextPageId>('map_break')
const selectedComponentId = ref<string | null>(null)
const selectedTransitionId = ref<string | null>(null)
const cursorByPage = ref<Record<IntermissionNextPageId, number>>({
  warmup: 0,
  bp: 0,
  map_break: 0,
  series_end: 0,
  standby: 0
})
const catalogOpen = ref(false)
const canvasElement = ref<HTMLElement | null>(null)
const alignmentGuides = ref<IntermissionNextAlignmentGuides>({ x: null, y: null })
let interaction: Interaction | null = null

const frameFields: ReadonlyArray<{ key: FrameField; label: string }> = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: '宽度' },
  { key: 'height', label: '高度' }
]
const currentPage = computed(() => draftState.value.pages[selectedPage.value])
const appliedPage = computed(() => appliedState.value.pages[selectedPage.value])
const pageDurationMs = computed(() => Math.max(1_000, props.pageDurations[selectedPage.value] || 0))
const pageDurationMinutes = computed(() => millisecondsToMinutes(pageDurationMs.value))
const utilityStartMaximumMinutes = computed(() =>
  millisecondsToMinutes(Math.max(0, pageDurationMs.value - UTILITY_REPLAY_TOTAL_DURATION_MS))
)
const cursorMs = computed(() =>
  Math.min(pageDurationMs.value, cursorByPage.value[selectedPage.value])
)
const componentDefinitions = computed(() =>
  getIntermissionNextComponentDefinitions(selectedPage.value)
)
const addedDefinitions = computed(() =>
  componentDefinitions.value.filter(
    (definition) =>
      definition.kind !== 'transition' && Boolean(currentPage.value.components[definition.id])
  )
)
const canvasDefinitions = computed(() =>
  addedDefinitions.value.filter((definition) => definition.canvasEditable !== false)
)
const selectedDefinition = computed(() =>
  selectedComponentId.value
    ? getIntermissionNextComponentDefinition(selectedPage.value, selectedComponentId.value)
    : undefined
)
const selectedLayout = computed(() =>
  selectedComponentId.value
    ? (currentPage.value.components[selectedComponentId.value] ?? null)
    : null
)
const selectedWindows = computed<IntermissionNextComponentWindow[]>(() =>
  selectedComponentId.value
    ? (currentPage.value.componentWindows[selectedComponentId.value] ?? [])
    : []
)
const selectedTransition = computed<IntermissionNextTransitionComponent | null>(() =>
  selectedTransitionId.value
    ? (currentPage.value.transitions.find(
        (transition) => transition.id === selectedTransitionId.value
      ) ?? null)
    : null
)
const transitionDurationLabel = `${(INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS / 1_000).toFixed(1)} 秒`
const transitionStartMaximumMinutes = computed(() => {
  const maximumStartOffsetMs = Math.max(
    0,
    pageDurationMs.value - INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
  )
  return Number((Math.floor(maximumStartOffsetMs / 60) / 1_000).toFixed(3))
})
const canAddTransitionAtCursor = computed(() => {
  if (
    cursorMs.value === 0 ||
    cursorMs.value + INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS > pageDurationMs.value
  )
    return false
  const endOffsetMs = cursorMs.value + INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS
  return !currentPage.value.transitions.some((transition) => {
    const transitionEndOffsetMs = transition.startOffsetMs + transition.durationMs
    return cursorMs.value < transitionEndOffsetMs && endOffsetMs > transition.startOffsetMs
  })
})
const transitionCatalogHint = computed(() => {
  if (cursorMs.value === 0) return '先移动时间轴光标'
  if (cursorMs.value + INTERMISSION_NEXT_TRANSITION_COMPONENT_DURATION_MS > pageDurationMs.value)
    return '剩余时长不足'
  if (!canAddTransitionAtCursor.value) return '此时刻与现有转场重叠'
  return `插入到 ${formatTime(cursorMs.value)}`
})
const roundedSelectedLayout = computed(() => ({
  x: Math.round(selectedLayout.value?.x ?? 0),
  y: Math.round(selectedLayout.value?.y ?? 0),
  width: Math.round(selectedLayout.value?.width ?? 0),
  height: Math.round(selectedLayout.value?.height ?? 0)
}))
const isCurrentPageDirty = computed(
  () => JSON.stringify(currentPage.value) !== JSON.stringify(appliedPage.value)
)
const timelineRows = computed<TimelineRow[]>(() => {
  const rows: TimelineRow[] = currentPage.value.transitions.map((transition) => ({
    key: transition.id,
    label: '页内定时转场',
    kind: 'transition',
    transitionId: transition.id,
    clips: [
      {
        id: transition.id,
        startOffsetMs: transition.startOffsetMs,
        endOffsetMs: transition.startOffsetMs + transition.durationMs
      }
    ]
  }))
  for (const definition of addedDefinitions.value) {
    rows.push({
      key: definition.id,
      label: definition.label,
      kind: 'component',
      componentId: definition.id,
      clips: (currentPage.value.componentWindows[definition.id] ?? []).map((window) => ({
        id: window.id,
        startOffsetMs: window.startOffsetMs,
        endOffsetMs: window.endOffsetMs ?? pageDurationMs.value
      }))
    })
  }
  return rows
})
const timelineError = computed(() => {
  const transitions = currentPage.value.transitions
  if (transitions.some((transition) => transition.startOffsetMs === 0)) {
    return '页内定时转场不能设置在页面开始时，切换页面已自带一次转场。'
  }
  const invalidTransition = transitions.some((transition, index) => {
    const end = transition.startOffsetMs + transition.durationMs
    return (
      end > pageDurationMs.value ||
      transitions.slice(index + 1).some((other) => other.startOffsetMs < end)
    )
  })
  if (invalidTransition) return '页内定时转场超出页面总时长或互相重叠，请调整开始时刻。'
  const invalidWindow = Object.values(currentPage.value.componentWindows).some((windows) =>
    (windows ?? []).some((window) => {
      const end = window.endOffsetMs ?? pageDurationMs.value
      return window.startOffsetMs >= end || end > pageDurationMs.value
    })
  )
  if (invalidWindow) return '组件显示时间超出页面总时长或起止时刻无效，请修正后保存。'
  return ''
})
const timelineHasErrors = computed(() => timelineError.value !== '')
const editorPreviewPayload = computed(() =>
  createEditorPreviewPayload(
    props.previewPayload,
    draftState.value,
    selectedPage.value,
    pageDurationMs.value,
    cursorMs.value
  )
)

function pageLabel(pageId: IntermissionNextPageId): string {
  if (pageId === 'warmup') return '暖场'
  if (pageId === 'bp') return 'BP 展示'
  if (pageId === 'map_break') return '地图间播出'
  if (pageId === 'series_end') return '系列赛结束'
  return '赛事待机'
}
function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
function millisecondsToMinutes(value: number): number {
  return Number((value / 60_000).toFixed(3))
}
function millisecondsFromMinutes(value: string | number): number | null {
  if (typeof value === 'string' && value.trim() === '') return null
  const minutes = Number(value)
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 60_000) : null
}
function replaceDraft(value: unknown): void {
  draftState.value = cloneIntermissionNextLayoutState(value)
}
function isComponentAdded(componentId: string): boolean {
  return Boolean(currentPage.value.components[componentId])
}
function selectPage(pageId: IntermissionNextPageId): void {
  if (isCurrentPageDirty.value && selectedPage.value !== pageId) return
  selectedPage.value = pageId
  selectedComponentId.value = null
  selectedTransitionId.value = null
  catalogOpen.value = false
}
function selectComponent(componentId: string): void {
  selectedComponentId.value = componentId
  selectedTransitionId.value = null
}
function selectTransition(transitionId: string): void {
  selectedComponentId.value = null
  selectedTransitionId.value = transitionId
}
function selectionStyle(componentId: string) {
  return intermissionNextSelectionStyle(currentPage.value.components[componentId]!)
}
function activeAtCursor(componentId: string): boolean {
  return (currentPage.value.componentWindows[componentId] ?? []).some(
    (window) =>
      cursorMs.value >= window.startOffsetMs &&
      cursorMs.value < (window.endOffsetMs ?? pageDurationMs.value)
  )
}
function setCursor(value: number): void {
  cursorByPage.value[selectedPage.value] = Math.min(
    pageDurationMs.value,
    Math.max(0, Math.round(value))
  )
}
function setCursorFromInput(event: Event): void {
  setCursor(Number((event.target as HTMLInputElement).value))
}
function seekTimeline(event: PointerEvent): void {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (rect.width > 0) setCursor(((event.clientX - rect.left) / rect.width) * pageDurationMs.value)
}
function timelineLeft(value: number): string {
  return `${Math.min(100, Math.max(0, (value / pageDurationMs.value) * 100))}%`
}
function clipStyle(start: number, end: number): Record<string, string> {
  return {
    left: timelineLeft(start),
    width: `${Math.max(0.25, ((end - start) / pageDurationMs.value) * 100)}%`
  }
}
function selectTimelineRow(row: TimelineRow): void {
  if (row.componentId) selectComponent(row.componentId)
  if (row.transitionId) selectTransition(row.transitionId)
  if (row.clips[0]) setCursor(row.clips[0].startOffsetMs)
}

function addDefinition(componentId: string): void {
  const definition = getIntermissionNextComponentDefinition(selectedPage.value, componentId)
  if (!definition) return
  if (definition.kind === 'transition' && !canAddTransitionAtCursor.value) return
  const previousTransitionIds = new Set(
    currentPage.value.transitions.map((transition) => transition.id)
  )
  const nextState = addIntermissionNextComponent(
    draftState.value,
    selectedPage.value,
    componentId,
    cursorMs.value
  )
  replaceDraft(nextState)
  if (definition.kind === 'transition') {
    const addedTransition = nextState.pages[selectedPage.value].transitions.find(
      (transition) => !previousTransitionIds.has(transition.id)
    )
    if (addedTransition) selectTransition(addedTransition.id)
  } else {
    selectComponent(componentId)
  }
  catalogOpen.value = false
}
function removeSelectedComponent(): void {
  if (!selectedComponentId.value) return
  replaceDraft(
    removeIntermissionNextComponent(draftState.value, selectedPage.value, selectedComponentId.value)
  )
  selectedComponentId.value = null
}
function clearCurrentPage(): void {
  replaceDraft(resetIntermissionNextPage(draftState.value, selectedPage.value))
  selectedComponentId.value = null
  selectedTransitionId.value = null
}
function discardCurrentPage(): void {
  const applied = cloneIntermissionNextLayoutState(appliedState.value)
  draftState.value = {
    ...draftState.value,
    pages: { ...draftState.value.pages, [selectedPage.value]: applied.pages[selectedPage.value] }
  }
  selectedComponentId.value = null
  selectedTransitionId.value = null
}
function saveCurrentPage(): void {
  const current = cloneIntermissionNextLayoutState(draftState.value)
  emit(
    'save',
    cloneIntermissionNextLayoutState({
      ...appliedState.value,
      pages: {
        ...appliedState.value.pages,
        [selectedPage.value]: current.pages[selectedPage.value]
      }
    })
  )
}
function restoreSelectedComponent(): void {
  if (selectedComponentId.value)
    replaceDraft(
      resetIntermissionNextComponent(
        draftState.value,
        selectedPage.value,
        selectedComponentId.value
      )
    )
}
function setAspectRatioLocked(value: boolean): void {
  if (selectedComponentId.value)
    replaceDraft(
      setIntermissionNextComponentAspectRatioLocked(
        draftState.value,
        selectedPage.value,
        selectedComponentId.value,
        value
      )
    )
}
function updateFrameField(field: FrameField, inputValue: string | number): void {
  if (!selectedComponentId.value) return
  const value = Number(inputValue)
  if (!Number.isFinite(value)) return
  replaceDraft(
    setIntermissionNextComponentFrame(
      draftState.value,
      selectedPage.value,
      selectedComponentId.value,
      { [field]: value }
    )
  )
}

function setSelectedWindows(windows: IntermissionNextComponentWindow[]): void {
  if (selectedComponentId.value)
    replaceDraft(
      setIntermissionNextComponentWindows(
        draftState.value,
        selectedPage.value,
        selectedComponentId.value,
        windows
      )
    )
}
function addSelectedWindow(): void {
  if (!selectedComponentId.value) return
  let index = 1
  while (
    selectedWindows.value.some(
      (window) => window.id === `${selectedComponentId.value}-window-${index}`
    )
  )
    index += 1
  setSelectedWindows([
    ...selectedWindows.value,
    {
      id: `${selectedComponentId.value}-window-${index}`,
      startOffsetMs: cursorMs.value,
      endOffsetMs: null
    }
  ])
}
function updateUtilityStart(inputValue: string | number): void {
  if (!selectedComponentId.value || selectedDefinition.value?.kind !== 'utility_replay') return
  const startOffsetMs = millisecondsFromMinutes(inputValue)
  if (startOffsetMs === null) return
  const existing = selectedWindows.value[0]
  setSelectedWindows([
    {
      id: existing?.id ?? `${selectedComponentId.value}-window-1`,
      startOffsetMs,
      endOffsetMs: startOffsetMs + UTILITY_REPLAY_TOTAL_DURATION_MS
    }
  ])
}
function updateWindowStart(id: string, inputValue: string | number): void {
  const value = millisecondsFromMinutes(inputValue)
  if (value === null) return
  setSelectedWindows(
    selectedWindows.value.map((window) =>
      window.id === id ? { ...window, startOffsetMs: value } : window
    )
  )
}
function updateWindowEnd(id: string, inputValue: string | number): void {
  const value = millisecondsFromMinutes(inputValue)
  if (value === null) return
  setSelectedWindows(
    selectedWindows.value.map((window) =>
      window.id === id ? { ...window, endOffsetMs: value } : window
    )
  )
}
function setWindowUntilEnd(id: string, untilEnd: boolean): void {
  setSelectedWindows(
    selectedWindows.value.map((window) =>
      window.id === id ? { ...window, endOffsetMs: untilEnd ? null : pageDurationMs.value } : window
    )
  )
}
function removeWindow(id: string): void {
  setSelectedWindows(selectedWindows.value.filter((window) => window.id !== id))
}
function updateTransitionStart(id: string, inputValue: string | number): void {
  const startOffsetMs = millisecondsFromMinutes(inputValue)
  if (startOffsetMs === null || startOffsetMs === 0) return
  replaceDraft(
    setIntermissionNextTransitionStart(draftState.value, selectedPage.value, id, startOffsetMs)
  )
  setCursor(startOffsetMs)
}
function removeTransition(id: string): void {
  replaceDraft(removeIntermissionNextTransition(draftState.value, selectedPage.value, id))
  if (selectedTransitionId.value === id) selectedTransitionId.value = null
}

function canvasPoint(event: PointerEvent): IntermissionNextCanvasPoint | null {
  const rect = canvasElement.value?.getBoundingClientRect()
  return rect ? intermissionNextCanvasPoint(event.clientX, event.clientY, rect) : null
}
function startMove(event: PointerEvent, componentId: string): void {
  if (event.button !== 0) return
  const point = canvasPoint(event)
  if (!point) return
  selectComponent(componentId)
  interaction = {
    kind: 'move',
    componentId,
    startPoint: point,
    startState: cloneIntermissionNextLayoutState(draftState.value)
  }
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopInteraction, { once: true })
}
function startResize(
  event: PointerEvent,
  componentId: string,
  handle: IntermissionNextResizeHandle
): void {
  const point = canvasPoint(event)
  if (!point) return
  interaction = {
    kind: 'resize',
    componentId,
    handle,
    startPoint: point,
    startState: cloneIntermissionNextLayoutState(draftState.value)
  }
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', stopInteraction, { once: true })
}
function handlePointerMove(event: PointerEvent): void {
  if (!interaction) return
  const point = canvasPoint(event)
  if (!point) return
  const deltaX = point.x - interaction.startPoint.x
  const deltaY = point.y - interaction.startPoint.y
  if (interaction.kind === 'resize' && interaction.handle) {
    replaceDraft(
      resizeIntermissionNextComponent(
        interaction.startState,
        selectedPage.value,
        interaction.componentId,
        interaction.handle,
        deltaX,
        deltaY
      )
    )
    return
  }
  const original =
    interaction.startState.pages[selectedPage.value].components[interaction.componentId]
  if (!original) return
  const moved = setIntermissionNextComponentPosition(
    interaction.startState,
    selectedPage.value,
    interaction.componentId,
    original.x + deltaX,
    original.y + deltaY
  )
  const snapped = snapIntermissionNextComponentPosition(
    moved,
    selectedPage.value,
    interaction.componentId,
    original.x + deltaX,
    original.y + deltaY
  )
  replaceDraft(snapped)
  alignmentGuides.value = findIntermissionNextAlignmentGuides(
    snapped,
    selectedPage.value,
    interaction.componentId,
    { x: true, y: true }
  )
}
function stopInteraction(): void {
  interaction = null
  alignmentGuides.value = { x: null, y: null }
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', stopInteraction)
}

watch(
  () => props.layout,
  (value) => {
    const incoming = cloneIntermissionNextLayoutState(
      value ?? createDefaultIntermissionNextLayoutState()
    )
    if (!isCurrentPageDirty.value) draftState.value = cloneIntermissionNextLayoutState(incoming)
    appliedState.value = incoming
  },
  { deep: true }
)
watch(pageDurationMs, (duration) => setCursor(Math.min(cursorMs.value, duration)))
onBeforeUnmount(stopInteraction)
</script>

<style scoped lang="scss">
.page-settings {
  display: grid;
  gap: 1rem;
  min-width: 0;
  color: var(--foreground);
}
.settings-header,
.canvas-toolbar,
.timeline-panel,
.inspector {
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--card);
}
.settings-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
}
.header-actions,
.section-heading,
.window-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.draft-badge {
  padding: 0.2rem 0.5rem;
  border: 1px solid #f59e0b77;
  border-radius: 999px;
  color: #f59e0b;
  font-size: 0.7rem;
}
.page-tabs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.5rem;
}
.page-tab {
  min-height: 2.75rem;
  border: 1px solid var(--border);
  border-radius: 0.55rem;
  background: var(--card);
  color: var(--muted-foreground);
  cursor: pointer;
}
.page-tab[data-active='true'] {
  border-color: #38bdf8;
  color: var(--foreground);
  background: color-mix(in srgb, #38bdf8 10%, var(--card));
}
.page-tab:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  align-items: start;
  gap: 1rem;
}
.canvas-column {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}
.canvas-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
}
.canvas-toolbar > div {
  display: flex;
  gap: 0.75rem;
}
.canvas-toolbar span {
  color: var(--muted-foreground);
  font-size: 0.75rem;
}
.cursor-control {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 280px;
}
.cursor-control input {
  flex: 1;
  accent-color: #38bdf8;
}
.canvas-shell {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: #03070d;
}
.layout-canvas {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}
.canvas-preview {
  position: absolute;
  inset: 0;
}
.canvas-preview :deep(.preview-shell) {
  height: 100%;
  border: 0;
  border-radius: 0;
}
.safe-area {
  position: absolute;
  z-index: 20;
  left: 3.125%;
  top: 5.555%;
  width: 93.75%;
  height: 88.889%;
  border: 1px dashed #fbbf2466;
  pointer-events: none;
}
.safe-area span {
  position: absolute;
  top: 0;
  left: 0;
  padding: 2px 5px;
  color: #fbbf24;
  background: #03070daa;
  font-size: 9px;
}
.center-line,
.snap-guide {
  position: absolute;
  z-index: 21;
  pointer-events: none;
  background: #38bdf855;
}
.center-line-x,
.snap-guide-x {
  top: 0;
  bottom: 0;
  width: 1px;
  left: 50%;
}
.center-line-y,
.snap-guide-y {
  left: 0;
  right: 0;
  height: 1px;
  top: 50%;
}
.snap-guide {
  background: #22d3ee;
}
.selection-box {
  position: absolute;
  z-index: 30;
  padding: 0;
  border: 1px dashed #94a3b8aa;
  background: transparent;
  cursor: move;
}
.selection-box.is-selected {
  border: 2px solid #38bdf8;
  box-shadow: 0 0 0 1px #020617;
}
.selection-label {
  position: absolute;
  top: -21px;
  left: -1px;
  padding: 3px 6px;
  color: #e0f2fe;
  background: #0369a1;
  font-size: 10px;
  white-space: nowrap;
}
.resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  padding: 0;
  border: 1px solid #e0f2fe;
  background: #0ea5e9;
}
.resize-handle[data-handle='north'] {
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  cursor: n-resize;
}
.resize-handle[data-handle='south'] {
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  cursor: s-resize;
}
.resize-handle[data-handle='east'] {
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  cursor: e-resize;
}
.resize-handle[data-handle='west'] {
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  cursor: w-resize;
}
.resize-handle[data-handle='north_east'] {
  top: -6px;
  right: -6px;
  cursor: ne-resize;
}
.resize-handle[data-handle='north_west'] {
  top: -6px;
  left: -6px;
  cursor: nw-resize;
}
.resize-handle[data-handle='south_east'] {
  right: -6px;
  bottom: -6px;
  cursor: se-resize;
}
.resize-handle[data-handle='south_west'] {
  left: -6px;
  bottom: -6px;
  cursor: sw-resize;
}
.timeline-panel {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
}
.timeline-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
.timeline-ruler {
  position: relative;
  display: flex;
  justify-content: space-between;
  height: 28px;
  border-bottom: 1px solid var(--border);
  cursor: crosshair;
}
.timeline-ruler span {
  color: var(--muted-foreground);
  font-size: 10px;
}
.timeline-ruler i,
.timeline-track i {
  position: absolute;
  z-index: 4;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #f43f5e;
  pointer-events: none;
}
.timeline-rows {
  display: grid;
  gap: 0.4rem;
}
.timeline-row {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  gap: 0.5rem;
  align-items: center;
}
.timeline-row-label {
  overflow: hidden;
  border: 0;
  color: var(--foreground);
  background: transparent;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.timeline-track {
  position: relative;
  height: 30px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  background: #02061766;
  cursor: crosshair;
}
.timeline-clip {
  position: absolute;
  top: 4px;
  bottom: 4px;
  min-width: 3px;
  border-radius: 0.25rem;
  background: #0ea5e9;
}
.timeline-clip[data-kind='transition'] {
  background: #f43f5e;
}
.timeline-empty,
.component-empty {
  padding: 1rem;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  color: var(--muted-foreground);
  text-align: center;
  font-size: 0.8rem;
}
.timeline-error {
  color: #f87171;
  font-size: 0.75rem;
}
.time-input-help {
  color: var(--muted-foreground);
  font-size: 0.72rem;
  line-height: 1.5;
}
.fixed-component-note {
  padding: 0.75rem;
  border: 1px solid color-mix(in srgb, #38bdf8 35%, var(--border));
  border-radius: 0.5rem;
  color: var(--muted-foreground);
  background: color-mix(in srgb, #38bdf8 7%, var(--card));
  font-size: 0.78rem;
  line-height: 1.55;
}
.inspector {
  display: grid;
  gap: 1rem;
  padding: 1rem;
}
.inspector-section {
  display: grid;
  gap: 0.75rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
.inspector-section:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.component-catalog,
.component-list,
.window-list {
  display: grid;
  gap: 0.45rem;
}
.utility-window {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 0.65rem;
}
.utility-window > label {
  display: grid;
  gap: 0.35rem;
}
.utility-window > label > span,
.utility-window > span {
  color: var(--muted-foreground);
  font-size: 0.72rem;
}
.utility-window > span {
  padding-bottom: 0.55rem;
}
.component-catalog button,
.component-list button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 42px;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 0.45rem;
  color: var(--foreground);
  background: color-mix(in srgb, var(--card) 92%, white 2%);
  cursor: pointer;
}
.component-catalog button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.component-list button[data-selected='true'] {
  border-color: #38bdf8;
  background: color-mix(in srgb, #38bdf8 10%, var(--card));
}
.component-catalog small,
.component-list small {
  color: var(--muted-foreground);
}
.frame-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.55rem;
}
.frame-grid label,
.window-card label,
.transition-row label {
  display: grid;
  gap: 0.25rem;
}
.frame-grid span,
.window-card span,
.transition-row span {
  color: var(--muted-foreground);
  font-size: 0.7rem;
}
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.toggle-row p {
  color: var(--muted-foreground);
  font-size: 0.7rem;
}
.window-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  padding: 0.65rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
}
.until-end-control {
  display: flex !important;
  grid-column: 1 / -1;
  align-items: center;
  gap: 0.5rem;
}
.transition-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: end;
  gap: 0.5rem;
}
@media (max-width: 1180px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .page-settings * {
    transition-duration: 0.01ms !important;
  }
}
</style>
