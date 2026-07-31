<template>
  <section class="director-console" aria-labelledby="director-console-title">
    <header class="console-header">
      <div class="min-w-0">
        <h2 id="director-console-title">播出控制</h2>
        <p>{{ stageDescription }}</p>
      </div>
      <span class="stage-badge" :data-visible="snapshot.runtime.stage !== 'hidden'">
        {{ broadcastDirectorStageLabel(snapshot.runtime.stage) }}
      </span>
    </header>

    <dl class="console-status">
      <div>
        <dt>下一操作</dt>
        <dd>{{ snapshot.next.actionLabel }}</dd>
      </div>
      <div>
        <dt>背景</dt>
        <dd>{{ activeBackgroundName }}</dd>
      </div>
      <div>
        <dt>BP</dt>
        <dd>{{ snapshot.bpReady ? '已就绪' : '未就绪' }}</dd>
      </div>
    </dl>

    <p v-if="!snapshot.next.allowed" class="blocking-reason" role="status">
      {{ snapshot.next.reason }}
    </p>

    <div class="console-actions">
      <Button
        class="primary-action"
        :disabled="busy || !snapshot.next.allowed"
        @click="emit('advance')"
      >
        <StepForward aria-hidden="true" />
        {{ snapshot.next.actionLabel }}
      </Button>
      <Button
        v-if="snapshot.runtime.stage === 'bp'"
        variant="outline"
        :disabled="busy || !snapshot.bpReady"
        @click="emit('playBp')"
      >
        <RotateCcw v-if="snapshot.bpPlaybackStarted" aria-hidden="true" />
        <Play v-else aria-hidden="true" />
        {{ snapshot.bpPlaybackStarted ? '重新播放 BP 动画' : '播放 BP 动画' }}
      </Button>
    </div>

    <div class="stage-jump">
      <div>
        <strong>阶段跳转</strong>
        <span>仅开放已经具备实际数据的播出阶段</span>
      </div>
      <div class="stage-jump-actions">
        <Select v-model="selectedTargetId" :disabled="busy">
          <SelectTrigger aria-label="选择要跳转的播出阶段">
            <SelectValue placeholder="选择阶段" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="target in snapshot.jumpTargets"
              :key="target.id"
              :value="target.id"
              :disabled="!target.available"
            >
              {{ target.available ? target.label : `${target.label} · ${target.reason}` }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          :disabled="busy || !selectedJumpTarget?.available"
          @click="selectedJumpTarget && emit('jump', { targetId: selectedJumpTarget.id })"
        >
          <Route aria-hidden="true" />
          跳转
        </Button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Play, RotateCcw, Route, StepForward } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  broadcastDirectorStageLabel,
  type BroadcastDirectorJumpRequest,
  type BroadcastDirectorSnapshot
} from '../../../../shared/broadcast-director'
import type { GlobalBackgroundAssetV1 } from '../../../../shared/intermission-background-next/assets'
import type { GlobalBackgroundStateV1 } from '../../../../shared/intermission-background-next/background-state'

const props = defineProps<{
  snapshot: BroadcastDirectorSnapshot
  background: GlobalBackgroundStateV1
  backgroundAssets: GlobalBackgroundAssetV1[]
  busy: boolean
}>()

const emit = defineEmits<{
  advance: []
  playBp: []
  jump: [request: BroadcastDirectorJumpRequest]
}>()
const selectedTargetId = ref('')

const selectedJumpTarget = computed(() =>
  props.snapshot.jumpTargets.find((target) => target.id === selectedTargetId.value)
)

const activeBackgroundName = computed(() => {
  if (!props.background.visible) return '透明'
  const asset = props.backgroundAssets.find((entry) => entry.id === props.background.activeAssetId)
  return asset?.displayName ?? '等待背景素材'
})

const stageDescription = computed(() => {
  const stage = props.snapshot.runtime.stage
  if (stage === 'hidden') {
    return props.snapshot.runtime.hiddenReason === 'gameplay'
      ? 'OBS 当前由比赛场景接管，等待下一份冻结数据。'
      : '统一浏览器源当前保持透明。'
  }
  if (stage === 'warmup') return '暖场内容可在比赛和 BP 创建前手动播出。'
  if (stage === 'bp') {
    return props.snapshot.bpPlaybackStarted
      ? 'BP 动画已经开始，可重新播放或转场进入比赛阶段。'
      : 'BP 页面已经就绪，等待导播播放七步动画。'
  }
  if (stage === 'map_break') return '正在播放刚结束地图的数据页面。'
  if (stage === 'series_end') return '正在播放完整系列赛总结。'
  return '系列赛已经结束，由导播决定何时进入下一场暖场。'
})

watch(
  () => props.snapshot.jumpTargets,
  (targets) => {
    if (!targets.some((target) => target.id === selectedTargetId.value && target.available)) {
      selectedTargetId.value = ''
    }
  },
  { deep: true }
)
</script>

<style scoped lang="scss">
.director-console {
  display: grid;
  align-content: start;
  gap: 0.9rem;
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
}

.console-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.console-header h2 {
  font-size: 0.95rem;
  font-weight: 700;
}

.console-header p {
  margin-top: 0.3rem;
  color: var(--muted-foreground);
  font-size: 0.75rem;
  line-height: 1.45;
}

.stage-badge {
  flex: 0 0 auto;
  border-radius: 999px;
  padding: 0.28rem 0.58rem;
  color: var(--muted-foreground);
  background: var(--muted);
  font-size: 0.7rem;
  font-weight: 700;
}

.stage-badge[data-visible='true'] {
  color: #d8f5ff;
  background: color-mix(in srgb, #38bdf8 24%, var(--card));
}

.console-status {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.console-status > div {
  min-width: 0;
  padding: 0.65rem;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) - 2px);
  background: color-mix(in srgb, var(--muted) 22%, transparent);
}

.console-status dt {
  color: var(--muted-foreground);
  font-size: 0.68rem;
}

.console-status dd {
  overflow: hidden;
  margin-top: 0.2rem;
  font-size: 0.77rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blocking-reason {
  min-height: 2.35rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid color-mix(in srgb, #f59e0b 38%, var(--border));
  border-radius: calc(var(--radius) - 2px);
  color: color-mix(in srgb, #f59e0b 76%, var(--foreground));
  background: color-mix(in srgb, #f59e0b 8%, transparent);
  font-size: 0.72rem;
  line-height: 1.45;
}

.console-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.6rem;
}

.primary-action {
  min-width: 0;
}

.stage-jump {
  display: grid;
  gap: 0.65rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--border);
}

.stage-jump > div:first-child {
  display: grid;
  gap: 0.2rem;

  strong {
    font-size: 0.82rem;
  }

  span {
    color: var(--muted-foreground);
    font-size: 0.7rem;
  }
}

.stage-jump-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.55rem;
}

@media (max-width: 960px) {
  .console-status {
    grid-template-columns: 1fr;
  }
}
</style>
