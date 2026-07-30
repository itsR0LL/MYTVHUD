<template>
  <section v-if="payload.match" class="space-y-4">
    <div class="rounded-lg border bg-card p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 class="font-semibold">{{ t('intermission.match.title') }}</h2>
        <span class="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
          {{ payload.match.type }}
        </span>
      </div>
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div class="team-summary">
          <TeamLogo :team="payload.match.team_a" />
          <strong class="truncate">{{ teamName(payload.match.team_a) }}</strong>
        </div>
        <div class="series-score">
          {{ payload.seriesScore.teamA }}<span>:</span>{{ payload.seriesScore.teamB }}
        </div>
        <div class="team-summary justify-end text-right">
          <strong class="truncate">{{ teamName(payload.match.team_b) }}</strong>
          <TeamLogo :team="payload.match.team_b" />
        </div>
      </div>
      <p class="mt-3 text-center text-xs text-muted-foreground">
        {{
          payload.state.scoreOverride.enabled
            ? t('intermission.score.manualActive')
            : t('intermission.score.automatic')
        }}
      </p>
    </div>

    <div class="rounded-lg border bg-card p-4 shadow-sm">
      <h2 class="mb-3 font-semibold">{{ t('intermission.maps.title') }}</h2>
      <div class="space-y-2">
        <article
          v-for="map in payload.match.maps"
          :key="map.name"
          class="grid grid-cols-[36px_minmax(0,1fr)_120px] items-center gap-3 rounded-md border p-2.5"
          :class="{
            'border-destructive/60': map.status === 'finished' && map.ascore === map.bscore
          }"
        >
          <img
            class="h-9 w-9 object-contain"
            :src="`http://localhost:5031/bp/maps/icons/${map.name}.png`"
            alt=""
          />
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold">{{ mapDisplayName(map.name) }}</div>
            <div class="truncate text-xs text-muted-foreground">
              {{ mapMeta(map) }} · {{ map.ascore }}:{{ map.bscore }}
            </div>
            <div
              v-if="map.status === 'finished' && map.ascore === map.bscore"
              class="mt-1 text-xs text-destructive"
            >
              {{ t('intermission.maps.finishedTie') }}
            </div>
            <div v-if="map.statusNeedsConfirmation" class="mt-1 text-xs text-amber-600">
              {{ t('intermission.maps.statusNeedsConfirmation') }}
            </div>
          </div>
          <Select
            :model-value="map.status"
            :disabled="busy"
            @update:model-value="updateMapStatus(map.name, String($event))"
          >
            <SelectTrigger class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="status in MATCH_MAP_STATUSES" :key="status" :value="status">
                {{ t(`intermission.mapStatus.${status}`) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </article>
      </div>
    </div>

    <div class="rounded-lg border bg-card p-4 shadow-sm">
      <h2 class="mb-3 font-semibold">{{ t('intermission.nextMap.title') }}</h2>
      <Select
        :model-value="payload.state.nextMapId || '__none__'"
        :disabled="busy || seriesFinished"
        @update:model-value="selectNextMap(String($event))"
      >
        <SelectTrigger class="w-full">
          <SelectValue :placeholder="t('intermission.nextMap.placeholder')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{{ t('intermission.nextMap.none') }}</SelectItem>
          <SelectItem v-for="map in pendingMaps" :key="map.name" :value="map.name">
            {{ mapDisplayName(map.name) }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p v-if="seriesFinished" class="mt-2 text-xs text-muted-foreground">
        {{ t('intermission.nextMap.seriesFinished') }}
      </p>
    </div>

    <div class="rounded-lg border bg-card p-4 shadow-sm">
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
import { computed, defineComponent, h, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { BP_MAPS, type BPMapId, type BPTeam } from '../../../../shared/bp'
import {
  MATCH_MAP_STATUSES,
  seriesWinLimit,
  type IntermissionMatchMap,
  type IntermissionMapStatusUpdate,
  type IntermissionPayload,
  type IntermissionStateUpdate,
  type MatchMapStatus
} from '../../../../shared/intermission'

const props = defineProps<{ payload: IntermissionPayload; busy: boolean }>()
const emit = defineEmits<{
  updateState: [update: IntermissionStateUpdate]
  updateMapStatus: [update: IntermissionMapStatusUpdate]
}>()
const { t } = useI18n()

const overrideEnabled = ref(false)
const overrideTeamA = ref(0)
const overrideTeamB = ref(0)
const pendingMaps = computed(
  () => props.payload.match?.maps.filter((map) => map.status === 'pending') ?? []
)
const winLimit = computed(() =>
  props.payload.match ? seriesWinLimit(props.payload.match.type) : 1
)
const seriesFinished = computed(
  () =>
    props.payload.seriesScore.teamA >= winLimit.value ||
    props.payload.seriesScore.teamB >= winLimit.value
)

const TeamLogo = defineComponent({
  props: { team: { type: Object as () => BPTeam, required: true } },
  setup(componentProps) {
    return () =>
      componentProps.team.avatar
        ? h('img', {
            class: 'h-11 w-11 shrink-0 rounded-md object-contain',
            src: componentProps.team.avatar,
            alt: ''
          })
        : h(
            'span',
            {
              class:
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-bold text-muted-foreground'
            },
            teamName(componentProps.team).slice(0, 2).toUpperCase()
          )
  }
})

function teamName(team: BPTeam): string {
  return team.name || team.name_ingame
}

function mapDisplayName(mapId: BPMapId): string {
  return BP_MAPS.find((map) => map.id === mapId)?.displayName ?? mapId
}

function mapMeta(map: IntermissionMatchMap): string {
  if (map.decider) return t('bp.action.decider')
  const match = props.payload.match
  if (!match || !map.pickby) return t('intermission.maps.noPicker')
  if (String(map.pickby) === String(match.team_a.id))
    return t('intermission.maps.pickedBy', { team: teamName(match.team_a) })
  if (String(map.pickby) === String(match.team_b.id))
    return t('intermission.maps.pickedBy', { team: teamName(match.team_b) })
  return t('intermission.maps.noPicker')
}

function updateMapStatus(mapId: BPMapId, status: string): void {
  if (!MATCH_MAP_STATUSES.includes(status as MatchMapStatus)) return
  emit('updateMapStatus', { mapId, status: status as MatchMapStatus })
}

function selectNextMap(value: string): void {
  emit('updateState', { nextMapId: value === '__none__' ? '' : (value as BPMapId) })
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
.team-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.65rem;
}

.series-score {
  min-width: 5.5rem;
  font-size: 1.8rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  text-align: center;

  span {
    margin: 0 0.45rem;
    color: var(--muted-foreground);
  }
}
</style>
