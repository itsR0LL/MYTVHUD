<template>
  <section v-if="payload.match" class="match-corrections">
    <div class="correction-card">
      <h2 class="mb-3 font-semibold">{{ t('intermission.nextMap.title') }}</h2>
      <div class="rounded-md border bg-muted/20 px-3 py-2 text-sm font-semibold">
        {{ automaticNextMapLabel }}
      </div>
      <p class="mt-2 text-xs text-muted-foreground">
        下一张地图由完整 BP、已结束地图和系列赛比分自动计算。
      </p>
      <p v-if="seriesFinished" class="mt-2 text-xs text-muted-foreground">
        {{ t('intermission.nextMap.seriesFinished') }}
      </p>
    </div>

    <div class="correction-card">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="font-semibold">{{ t('intermission.score.title') }}</h2>
          <p class="text-xs text-muted-foreground">{{ t('intermission.score.desc') }}</p>
        </div>
        <Switch v-model="overrideEnabled" :disabled="busy" />
      </div>
      <div v-if="overrideEnabled" class="mt-3 grid grid-cols-2 gap-2">
        <label class="space-y-1">
          <span class="text-xs text-muted-foreground">{{ teamName(payload.match.team_a) }}</span>
          <Input v-model="overrideTeamA" type="number" :min="0" :max="winLimit" />
        </label>
        <label class="space-y-1">
          <span class="text-xs text-muted-foreground">{{ teamName(payload.match.team_b) }}</span>
          <Input v-model="overrideTeamB" type="number" :min="0" :max="winLimit" />
        </label>
      </div>
      <Button class="mt-3 w-full" variant="outline" :disabled="busy" @click="saveScoreOverride">
        {{ t('intermission.score.save') }}
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { BP_MAPS, type BPMapId, type BPTeam } from '../../../../shared/bp'
import {
  seriesWinLimit,
  type IntermissionPayload,
  type IntermissionStateUpdate
} from '../../../../shared/intermission'

const props = defineProps<{ payload: IntermissionPayload; busy: boolean }>()
const emit = defineEmits<{
  updateState: [update: IntermissionStateUpdate]
}>()
const { t } = useI18n()

const overrideEnabled = ref(false)
const overrideTeamA = ref(0)
const overrideTeamB = ref(0)
const winLimit = computed(() =>
  props.payload.match ? seriesWinLimit(props.payload.match.type) : 1
)
const seriesFinished = computed(
  () =>
    props.payload.seriesScore.teamA >= winLimit.value ||
    props.payload.seriesScore.teamB >= winLimit.value
)
const automaticNextMapId = computed(
  () => props.payload.runtime.preparedProgram?.snapshot.nextMapId ?? ''
)
const automaticNextMapLabel = computed(() =>
  automaticNextMapId.value
    ? mapDisplayName(automaticNextMapId.value)
    : seriesFinished.value
      ? '系列赛已经结束'
      : '等待当前地图结束'
)

function teamName(team: BPTeam): string {
  return team.name || team.name_ingame
}

function mapDisplayName(mapId: BPMapId): string {
  return BP_MAPS.find((map) => map.id === mapId)?.displayName ?? mapId
}

function saveScoreOverride(): void {
  emit('updateState', {
    scoreOverride: {
      enabled: overrideEnabled.value,
      teamA: Math.max(0, Math.floor(Number(overrideTeamA.value) || 0)),
      teamB: Math.max(0, Math.floor(Number(overrideTeamB.value) || 0))
    }
  })
}

watch(
  () => props.payload.state.scoreOverride,
  (override) => {
    overrideEnabled.value = override.enabled
    overrideTeamA.value = override.teamA
    overrideTeamB.value = override.teamB
  },
  { immediate: true, deep: true }
)
</script>

<style scoped lang="scss">
.match-corrections {
  display: grid;
  align-items: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.correction-card {
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

@media (max-width: 820px) {
  .match-corrections {
    grid-template-columns: 1fr;
  }
}
</style>
