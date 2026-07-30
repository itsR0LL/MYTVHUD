<template>
  <div ref="canvasElement" class="preview-canvas" aria-label="赛间信息条真实页面预览">
    <iframe
      ref="frameElement"
      class="preview-frame"
      src="http://localhost:5031/intermission?mode=editor"
      title="赛间信息条真实页面预览"
      tabindex="-1"
      @load="connectPreview"
    ></iframe>
    <slot :canvas-element="canvasElement" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  INTERMISSION_CANVAS_WIDTH,
  INTERMISSION_PREVIEW_MESSAGES,
  type IntermissionPayload,
  type IntermissionPreviewMessage
} from '../../../../shared/intermission'

const props = defineProps<{ payload: IntermissionPayload | null }>()
const emit = defineEmits<{
  ready: []
}>()

const canvasElement = ref<HTMLElement | null>(null)
const frameElement = ref<HTMLIFrameElement | null>(null)
let resizeObserver: ResizeObserver | null = null

function updateScale(): void {
  const width = canvasElement.value?.clientWidth ?? 0
  if (!frameElement.value || width <= 0) return
  frameElement.value.style.setProperty('--preview-scale', String(width / INTERMISSION_CANVAS_WIDTH))
}

function sendPayload(): void {
  const target = frameElement.value?.contentWindow
  if (!target || !props.payload) return
  const serializablePayload = JSON.parse(JSON.stringify(props.payload)) as IntermissionPayload
  const message: IntermissionPreviewMessage = {
    type: INTERMISSION_PREVIEW_MESSAGES.state,
    payload: serializablePayload
  }
  target.postMessage(JSON.stringify(message), 'http://localhost:5031')
}

function connectPreview(): void {
  emit('ready')
  sendPayload()
}

watch(() => props.payload, sendPayload)

onMounted(() => {
  updateScale()
  resizeObserver = new ResizeObserver(updateScale)
  if (canvasElement.value) resizeObserver.observe(canvasElement.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

defineExpose({ canvasElement })
</script>

<style scoped lang="scss">
.preview-canvas {
  position: relative;
  width: 100%;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px), #05070b;
  background-size: calc(100% / 30) calc(100% / 17);
}

.preview-canvas::before,
.preview-canvas::after {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  background: rgba(56, 189, 248, 0.34);
  content: '';
}

.preview-canvas::before {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
}

.preview-canvas::after {
  top: 50%;
  right: 0;
  left: 0;
  height: 1px;
}

.preview-frame {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  border: 0;
  background: transparent;
  transform: scale(var(--preview-scale, 0.333333));
  transform-origin: 0 0;
  pointer-events: none;
}
</style>
