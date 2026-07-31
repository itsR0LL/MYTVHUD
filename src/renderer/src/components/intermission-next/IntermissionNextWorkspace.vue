<template>
  <section class="intermission-workspace" aria-label="赛间播出设置">
    <nav class="workspace-tabs" role="tablist" aria-label="赛间管理工作区">
      <button
        id="workspace-flow-tab"
        type="button"
        class="workspace-tab"
        role="tab"
        :aria-selected="activeSection === 'flow'"
        aria-controls="workspace-flow-panel"
        :tabindex="activeSection === 'flow' ? 0 : -1"
        @click="selectSection('flow')"
        @keydown.left.prevent="selectSection('layout')"
        @keydown.right.prevent="selectSection('layout')"
      >
        <Workflow aria-hidden="true" />
        <strong>页面播放流程</strong>
      </button>
      <button
        id="workspace-layout-tab"
        type="button"
        class="workspace-tab"
        role="tab"
        :aria-selected="activeSection === 'layout'"
        aria-controls="workspace-layout-panel"
        :tabindex="activeSection === 'layout' ? 0 : -1"
        @click="selectSection('layout')"
        @keydown.left.prevent="selectSection('flow')"
        @keydown.right.prevent="selectSection('flow')"
      >
        <PanelsTopLeft aria-hidden="true" />
        <strong>页面设置</strong>
      </button>
    </nav>

    <div class="broadcast-console-grid">
      <div class="output-monitor">
        <slot name="monitor" />
      </div>
      <div class="director-controls">
        <slot name="director-controls" />
      </div>
    </div>

    <div
      v-show="activeSection === 'flow'"
      id="workspace-flow-panel"
      role="tabpanel"
      aria-labelledby="workspace-flow-tab"
      :aria-hidden="activeSection !== 'flow'"
      class="workspace-panel"
    >
      <BroadcastPageFlowTemplateEditor
        :templates="templates"
        :lifecycle-durations="lifecycleDurations"
        :busy="templateBusy"
        @save="emit('saveTemplate', $event)"
      />
      <div v-if="$slots['flow-controls']" class="flow-controls">
        <slot name="flow-controls" />
      </div>
    </div>

    <div
      v-show="activeSection === 'layout'"
      id="workspace-layout-panel"
      role="tabpanel"
      aria-labelledby="workspace-layout-tab"
      :aria-hidden="activeSection !== 'layout'"
      class="workspace-panel layout-workspace"
    >
      <IntermissionNextLayoutEditor
        :layout="layout"
        :busy="layoutBusy"
        :page-durations="pageDurations"
        :preview-src="previewSrc"
        :preview-payload="previewPayload"
        @save="emit('saveLayout', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { PanelsTopLeft, Workflow } from 'lucide-vue-next'
import { computed } from 'vue'
import { BP_BROADCAST_TIMELINE_DURATION_MS } from '../../../../shared/bp'
import type { BroadcastProgramType } from '../../../../shared/broadcast-flow'
import type {
  BroadcastPageFlowTemplatesV3,
  BroadcastPageLifecycleDuration
} from '../../../../shared/broadcast-page-flow-next/page-flow'
import type { IntermissionNextLayoutState } from '../../../../shared/intermission-next'
import type { IntermissionNextOutputPayloadV1 } from '../../../../shared/intermission-output-next/output'
import BroadcastPageFlowTemplateEditor from './BroadcastPageFlowTemplateEditor.vue'
import IntermissionNextLayoutEditor from './IntermissionNextLayoutEditor.vue'

type IntermissionNextWorkspaceSection = 'flow' | 'layout'

const props = defineProps<{
  activeSection: IntermissionNextWorkspaceSection
  templates: BroadcastPageFlowTemplatesV3 | null
  lifecycleDurations: Record<BroadcastProgramType, BroadcastPageLifecycleDuration>
  layout: IntermissionNextLayoutState | null
  previewSrc: string
  previewPayload: IntermissionNextOutputPayloadV1
  templateBusy: boolean
  layoutBusy: boolean
}>()

const pageDurations = computed(() => ({
  warmup: 10 * 60 * 1000,
  bp: BP_BROADCAST_TIMELINE_DURATION_MS,
  map_break: props.templates?.templates.map_break.defaultTotalDurationMs ?? 0,
  series_end: props.templates?.templates.series_end.defaultTotalDurationMs ?? 0,
  standby: props.templates?.templates.standby.defaultTotalDurationMs ?? 0
}))

const emit = defineEmits<{
  'update:activeSection': [section: IntermissionNextWorkspaceSection]
  saveTemplate: [templates: BroadcastPageFlowTemplatesV3]
  saveLayout: [layout: IntermissionNextLayoutState]
}>()

function selectSection(section: IntermissionNextWorkspaceSection): void {
  emit('update:activeSection', section)
}
</script>

<style scoped lang="scss">
.intermission-workspace {
  --workspace-accent: #38bdf8;
  display: grid;
  gap: 1rem;
  min-width: 0;
  color: var(--foreground);
}

.workspace-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  padding: 0.35rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: color-mix(in srgb, var(--card) 90%, transparent);
}

.workspace-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  min-height: 3.5rem;
  padding: 0.65rem 0.85rem;
  border: 1px solid transparent;
  border-radius: 0.55rem;
  color: var(--muted-foreground);
  background: transparent;
  cursor: pointer;
  outline: none;
  transition:
    color 150ms ease,
    border-color 150ms ease,
    background-color 150ms ease;
}

.workspace-tab > svg {
  width: 1.05rem;
  height: 1.05rem;
  flex: 0 0 auto;
}

.workspace-tab strong {
  color: currentcolor;
  font-size: 0.82rem;
}

.workspace-tab[aria-selected='true'] {
  border-color: color-mix(in srgb, var(--workspace-accent) 44%, var(--border));
  color: var(--foreground);
  background: color-mix(in srgb, var(--workspace-accent) 11%, var(--card));
}

.workspace-tab:focus-visible {
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 45%, transparent);
}

.workspace-panel,
.layout-workspace {
  display: grid;
  gap: 1rem;
  min-width: 0;
}

.broadcast-console-grid {
  display: grid;
  min-width: 0;
  align-items: stretch;
  grid-template-columns: minmax(0, 1.55fr) minmax(19rem, 0.75fr);
  gap: 1rem;
}

.output-monitor,
.director-controls {
  min-width: 0;
}

.flow-controls {
  min-width: 0;
}

@media (max-width: 720px) {
  .workspace-tabs {
    grid-template-columns: 1fr;
  }

  .workspace-tab {
    justify-content: flex-start;
  }

  .broadcast-console-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .intermission-workspace :deep(*) {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
