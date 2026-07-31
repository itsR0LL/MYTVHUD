<template>
  <div class="preview-shell">
    <div ref="viewport" class="preview-viewport">
      <iframe
        ref="frame"
        :src="previewUrl"
        title="赛间播出页面预览"
        class="preview-frame"
        :style="{ transform: `scale(${previewScale})` }"
        @load="publishPreview"
      ></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { IntermissionNextOutputPayloadV1 } from '../../../../shared/intermission-output-next/output'
import { createIntermissionNextPreviewMessage } from './preview-message'

const props = defineProps<{
  src: string
  payload: IntermissionNextOutputPayloadV1
}>()

const frame = ref<HTMLIFrameElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const previewScale = ref(1)
let resizeObserver: ResizeObserver | null = null

const previewUrl = computed(() => {
  const url = new URL(props.src, window.location.href)
  url.searchParams.set('parentOrigin', window.location.origin)
  return url.toString()
})

function targetOrigin(): string {
  return new URL(previewUrl.value).origin
}

function publishPreview(): void {
  const targetWindow = frame.value?.contentWindow
  if (!targetWindow) return
  try {
    targetWindow.postMessage(createIntermissionNextPreviewMessage(props.payload), targetOrigin())
  } catch (error) {
    console.error('发送赛间页面预览失败：', error)
  }
}

watch(
  () => props.payload,
  () => publishPreview(),
  { deep: true }
)

onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    previewScale.value = Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080)
  })
  if (viewport.value) resizeObserver.observe(viewport.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<style scoped lang="scss">
.preview-shell {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--foreground);
  background: var(--card);
}

.preview-viewport {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background:
    linear-gradient(45deg, rgba(148, 163, 184, 0.06) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(148, 163, 184, 0.06) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(148, 163, 184, 0.06) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(148, 163, 184, 0.06) 75%);
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  background-size: 16px 16px;
}

.preview-frame {
  position: absolute;
  width: 1920px;
  height: 1080px;
  border: 0;
  transform-origin: top left;
  pointer-events: none;
}
</style>
