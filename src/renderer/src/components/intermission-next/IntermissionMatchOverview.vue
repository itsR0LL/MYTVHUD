<template>
  <section v-if="payload.match" class="match-overview">
    <div class="overview-card">
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

    <div class="overview-card">
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
          <div class="rounded-md border bg-muted/30 px-3 py-2 text-center text-xs font-semibold">
            {{ t(`intermission.mapStatus.${map.status}`) }}
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { defineComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { BP_MAPS, type BPMapId, type BPTeam } from '../../../../shared/bp'
import type { IntermissionMatchMap, IntermissionPayload } from '../../../../shared/intermission'

const props = defineProps<{ payload: IntermissionPayload }>()
const { t } = useI18n()

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
  if (String(map.pickby) === String(match.team_a.id)) {
    return t('intermission.maps.pickedBy', { team: teamName(match.team_a) })
  }
  if (String(map.pickby) === String(match.team_b.id)) {
    return t('intermission.maps.pickedBy', { team: teamName(match.team_b) })
  }
  return t('intermission.maps.noPicker')
}
</script>

<style scoped lang="scss">
.match-overview {
  display: grid;
  align-items: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.overview-card {
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

.team-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.65rem;
}

.series-score {
  min-width: 5.5rem;
  font-size: 1.8rem;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  text-align: center;

  span {
    margin: 0 0.45rem;
    color: var(--muted-foreground);
  }
}

@media (max-width: 980px) {
  .match-overview {
    grid-template-columns: 1fr;
  }
}
</style>
