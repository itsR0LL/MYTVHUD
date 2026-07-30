<template>
  <section class="rounded-lg border bg-card p-4 shadow-sm">
    <div class="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 class="font-semibold">{{ t('intermission.timer.title') }}</h2>
        <p class="text-xs text-muted-foreground">
          {{ t(`intermission.timer.status.${timer.status}`) }}
        </p>
      </div>
      <strong class="timer-value" :class="{ urgent: remainingSeconds <= 59 }">
        {{ displayTime }}
      </strong>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label class="space-y-1">
        <span class="text-xs text-muted-foreground">{{ t('intermission.timer.minutes') }}</span>
        <Input
          v-model="minutes"
          type="number"
          :min="0"
          :max="99"
          :disabled="busy || !durationEditable"
        />
      </label>
      <label class="space-y-1">
        <span class="text-xs text-muted-foreground">{{ t('intermission.timer.seconds') }}</span>
        <Input
          v-model="seconds"
          type="number"
          :min="0"
          :max="59"
          :disabled="busy || !durationEditable"
        />
      </label>
    </div>

    <div class="mt-3 grid grid-cols-6 gap-1.5">
      <Button
        v-for="preset in presets"
        :key="preset"
        size="sm"
        variant="outline"
        :disabled="busy || !durationEditable"
        @click="setPreset(preset)"
      >
        {{ preset }}m
      </Button>
    </div>

    <div class="mt-3 grid grid-cols-2 gap-2">
      <Button
        v-if="timer.status === 'idle' || timer.status === 'finished'"
        :disabled="busy || configuredDurationMs < INTERMISSION_MIN_DURATION_MS"
        @click="send({ type: 'start', durationMs: configuredDurationMs })"
      >
        {{ t('intermission.timer.start') }}
      </Button>
      <Button
        v-else-if="timer.status === 'running'"
        :disabled="busy"
        @click="send({ type: 'pause' })"
      >
        {{ t('intermission.timer.pause') }}
      </Button>
      <Button v-else :disabled="busy" @click="send({ type: 'resume' })">
        {{ t('intermission.timer.resume') }}
      </Button>
      <Button
        variant="outline"
        :disabled="busy || timer.status === 'idle'"
        @click="send({ type: 'reset' })"
      >
        {{ t('intermission.timer.reset') }}
      </Button>
      <Button
        variant="outline"
        :disabled="busy || (timer.status !== 'running' && timer.status !== 'paused')"
        @click="send({ type: 'adjust', deltaMs: -30000 })"
      >
        -30s
      </Button>
      <Button
        variant="outline"
        :disabled="busy || (timer.status !== 'running' && timer.status !== 'paused')"
        @click="send({ type: 'adjust', deltaMs: 30000 })"
      >
        +30s
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  INTERMISSION_MAX_DURATION_MS,
  INTERMISSION_MIN_DURATION_MS,
  type IntermissionTimer,
  type IntermissionTimerCommand
} from '../../../../shared/intermission'

const props = defineProps<{
  timer: IntermissionTimer
  serverNowMs: number
  busy: boolean
}>()
const emit = defineEmits<{ command: [command: IntermissionTimerCommand] }>()
const { t } = useI18n()

const presets = [1, 3, 5, 8, 10, 15]
const minutes = ref(8)
const seconds = ref(0)
const nowMs = ref(Date.now())
let clockOffsetMs = props.serverNowMs - Date.now()
const interval = window.setInterval(() => {
  nowMs.value = Date.now()
}, 100)

const configuredDurationMs = computed(() => {
  const minuteValue = Math.max(0, Math.floor(Number(minutes.value) || 0))
  const secondValue = Math.min(59, Math.max(0, Math.floor(Number(seconds.value) || 0)))
  return Math.min(INTERMISSION_MAX_DURATION_MS, (minuteValue * 60 + secondValue) * 1000)
})
const durationEditable = computed(
  () => props.timer.status === 'idle' || props.timer.status === 'finished'
)
const remainingMs = computed(() => {
  if (props.timer.status === 'running' && props.timer.deadlineAtMs !== null) {
    return Math.max(0, props.timer.deadlineAtMs - (nowMs.value + clockOffsetMs))
  }
  return Math.max(0, props.timer.remainingMs)
})
const remainingSeconds = computed(() => Math.ceil(remainingMs.value / 1000))
const displayTime = computed(() => {
  const displayMinutes = Math.floor(remainingSeconds.value / 60)
  const displaySeconds = remainingSeconds.value % 60
  return `${String(displayMinutes).padStart(2, '0')}:${String(displaySeconds).padStart(2, '0')}`
})

function syncInputs(durationMs: number): void {
  const totalSeconds = Math.floor(durationMs / 1000)
  minutes.value = Math.floor(totalSeconds / 60)
  seconds.value = totalSeconds % 60
}

function setPreset(value: number): void {
  minutes.value = value
  seconds.value = 0
}

function send(command: IntermissionTimerCommand): void {
  emit('command', command)
}

watch(
  () => [props.timer.durationMs, props.timer.status] as const,
  ([durationMs, status]) => {
    if (status === 'idle' || status === 'finished') syncInputs(durationMs)
  },
  { immediate: true }
)

watch(
  () => props.serverNowMs,
  (serverNowMs) => {
    clockOffsetMs = serverNowMs - Date.now()
  }
)

onBeforeUnmount(() => window.clearInterval(interval))
</script>

<style scoped lang="scss">
.timer-value {
  min-width: 7ch;
  color: var(--foreground);
  font-size: 1.7rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-align: right;

  &.urgent {
    color: var(--color-amber-500);
  }
}
</style>
