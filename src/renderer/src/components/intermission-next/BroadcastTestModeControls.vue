<template>
  <section class="test-mode-controls" aria-labelledby="test-mode-title">
    <header>
      <div>
        <h2 id="test-mode-title">无比赛测试</h2>
        <p>使用内存测试数据推送完整页面；不写入比赛、BP 或 GSI 数据。</p>
      </div>
      <label class="test-mode-switch">
        <span>{{ state.enabled ? '已启用' : '已关闭' }}</span>
        <Switch
          :model-value="state.enabled"
          :disabled="busy"
          @update:model-value="emit('enabled', Boolean($event))"
        />
      </label>
    </header>

    <div v-if="state.enabled" class="test-stage-list" aria-label="选择测试页面">
      <Button
        v-for="stage in visibleStages"
        :key="stage"
        size="sm"
        :variant="state.stage === stage ? 'default' : 'outline'"
        :disabled="busy"
        @click="emit('stage', stage)"
      >
        {{ broadcastDirectorStageLabel(stage) }}
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  BROADCAST_DIRECTOR_VISIBLE_STAGES,
  broadcastDirectorStageLabel,
  type BroadcastDirectorStage
} from '../../../../shared/broadcast-director'
import type { IntermissionTestModeStateV1 } from '../../../../shared/intermission-test-mode'

defineProps<{
  state: IntermissionTestModeStateV1
  busy: boolean
}>()

const emit = defineEmits<{
  enabled: [enabled: boolean]
  stage: [stage: BroadcastDirectorStage]
}>()

const visibleStages = BROADCAST_DIRECTOR_VISIBLE_STAGES
</script>

<style scoped lang="scss">
.test-mode-controls {
  display: grid;
  align-content: start;
  gap: 0.85rem;
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
}

.test-mode-controls header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.test-mode-controls h2 {
  font-size: 0.9rem;
  font-weight: 700;
}

.test-mode-controls p {
  margin-top: 0.25rem;
  color: var(--muted-foreground);
  font-size: 0.72rem;
  line-height: 1.45;
}

.test-mode-switch {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
}

.test-stage-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
