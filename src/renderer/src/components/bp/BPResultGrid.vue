<template>
  <section class="bp-result-panel" aria-labelledby="bp-result-title">
    <header class="result-header">
      <h3 id="bp-result-title">BP 结果</h3>
      <span>{{ sequence.length }} / 7</span>
    </header>

    <div v-if="sequence.length === 0" class="result-empty">尚未生成 BP 结果</div>
    <div v-else class="result-rows" aria-live="polite">
      <div class="result-row result-row-primary">
        <BPResultCard
          v-for="(resultItem, resultIndex) in sequence.slice(0, 4)"
          :key="resultItem.map"
          :item="resultItem"
          :index="resultIndex"
        />
      </div>
      <div v-if="sequence.length > 4" class="result-row result-row-secondary">
        <BPResultCard
          v-for="(resultItem, resultIndex) in sequence.slice(4, 7)"
          :key="resultItem.map"
          :item="resultItem"
          :index="resultIndex + 4"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { defineComponent, h, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  BP_MAPS,
  type BPAction,
  type BPMapId,
  type BPSequenceItem,
  type BPTeam,
  type BPTeamSlot
} from '../../../../shared/bp'

const props = defineProps<{
  sequence: BPSequenceItem[]
  teamA: BPTeam | null
  teamB: BPTeam | null
}>()
const { t } = useI18n({ useScope: 'global' })

function mapRecord(mapId: BPMapId): (typeof BP_MAPS)[number] | undefined {
  return BP_MAPS.find((map) => map.id === mapId)
}

function mapDisplayName(mapId: BPMapId): string {
  return mapRecord(mapId)?.displayName ?? mapId
}

function actionName(action: BPAction): string {
  return t(`bp.action.${action}`)
}

function teamDisplayName(team: BPTeam | null, fallback: string): string {
  return team?.name || team?.name_ingame || fallback
}

function actorTeam(item: BPSequenceItem): BPTeam | null {
  if (item.actor === 'team_a') return props.teamA
  if (item.actor === 'team_b') return props.teamB
  return null
}

function oppositeTeamSlot(actor: BPTeamSlot): BPTeamSlot {
  return actor === 'team_a' ? 'team_b' : 'team_a'
}

function teamBySlot(slot: BPTeamSlot): BPTeam | null {
  return slot === 'team_a' ? props.teamA : props.teamB
}

function resultText(item: BPSequenceItem): string {
  if (item.action === 'decider') return t('bp.readOnly.deciderResult')
  const fallback = item.actor === 'team_b' ? t('bp.teamB') : t('bp.teamA')
  return t(`bp.readOnly.${item.action}Result`, {
    team: teamDisplayName(actorTeam(item), fallback)
  })
}

function sideResultText(item: BPSequenceItem): string {
  if (!item.actor || !item.startingSide) return t('bp.readOnly.sidePending')
  const opponentSlot = oppositeTeamSlot(item.actor)
  return t('bp.readOnly.sideResult', {
    team: teamDisplayName(
      teamBySlot(opponentSlot),
      opponentSlot === 'team_a' ? t('bp.teamA') : t('bp.teamB')
    ),
    side: item.startingSide
  })
}

const BPResultCard = defineComponent({
  name: 'BPResultCard',
  props: {
    item: { type: Object as PropType<BPSequenceItem>, required: true },
    index: { type: Number, required: true }
  },
  setup(cardProps) {
    return () => {
      const item = cardProps.item
      const map = mapRecord(item.map)
      return h('article', { class: 'result-card', 'data-action': item.action }, [
        h('header', { class: 'card-header' }, [
          h('span', { class: 'sequence-index' }, String(cardProps.index + 1)),
          h('span', { class: 'action-badge', 'data-action': item.action }, actionName(item.action))
        ]),
        h('div', { class: 'card-art' }, [
          map?.wideImage
            ? h('img', {
                class: 'map-background',
                src: map.wideImage,
                alt: mapDisplayName(item.map),
                width: 1920,
                height: 1080,
                loading: 'lazy',
                decoding: 'async'
              })
            : null,
          map?.image
            ? h('img', {
                class: 'map-icon',
                src: map.image,
                alt: '',
                'aria-hidden': 'true',
                width: 512,
                height: 512,
                loading: 'lazy',
                decoding: 'async'
              })
            : null
        ]),
        h('div', { class: 'card-content' }, [
          h('strong', { class: 'map-name' }, mapDisplayName(item.map)),
          h('span', { class: 'result-text' }, resultText(item)),
          item.action === 'pick' ? h('span', { class: 'side-text' }, sideResultText(item)) : null
        ])
      ])
    }
  }
})
</script>

<style scoped lang="scss">
.bp-result-panel {
  display: grid;
  gap: 0.85rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  h3 {
    font-size: 1rem;
    font-weight: 700;
  }

  span {
    color: var(--muted-foreground);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
}

.result-empty {
  display: flex;
  min-height: 8rem;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--muted-foreground);
  font-size: 0.82rem;
}

.result-rows {
  display: grid;
  gap: 0.75rem;
}

.result-row {
  display: grid;
  gap: 0.75rem;
}

.result-row-primary {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.result-row-secondary {
  width: calc(75% - 0.1875rem);
  margin-inline: auto;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

:deep(.result-card) {
  --result-accent: var(--primary);
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-top: 3px solid var(--result-accent);
  border-radius: var(--radius);
  background: var(--card);
}

:deep(.result-card[data-action='pick']) {
  --result-accent: #16a34a;
}

:deep(.result-card[data-action='decider']) {
  --result-accent: #38bdf8;
}

:deep(.card-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.65rem;
  border-bottom: 1px solid var(--border);
}

:deep(.sequence-index) {
  display: inline-flex;
  width: 1.45rem;
  height: 1.45rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--primary-foreground);
  background: var(--primary);
  font-size: 0.7rem;
  font-weight: 800;
}

:deep(.action-badge) {
  padding: 0.2rem 0.45rem;
  border-radius: 0.25rem;
  color: #fff;
  background: var(--primary);
  font-size: 0.68rem;
  font-weight: 700;
}

:deep(.action-badge[data-action='pick']) {
  background: #15803d;
}

:deep(.action-badge[data-action='decider']) {
  color: #082f49;
  background: #38bdf8;
}

:deep(.card-art) {
  position: relative;
  display: flex;
  height: 7.5rem;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--muted);
}

:deep(.map-background) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

:deep(.map-icon) {
  position: relative;
  z-index: 2;
  width: 3.25rem;
  height: 3.25rem;
  object-fit: contain;
  filter: drop-shadow(0 3px 8px rgb(0 0 0 / 75%));
}

:deep(.card-art::after) {
  position: absolute;
  z-index: 1;
  inset: 0;
  background: linear-gradient(rgb(9 9 11 / 5%), rgb(9 9 11 / 68%));
  content: '';
}

:deep(.card-content) {
  display: flex;
  min-height: 6.75rem;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.7rem;
}

:deep(.map-name) {
  font-size: 0.8rem;
  line-height: 1.3;
}

:deep(.result-text),
:deep(.side-text) {
  color: var(--muted-foreground);
  font-size: 0.72rem;
  line-height: 1.4;
}

:deep(.side-text) {
  margin-top: auto;
  color: var(--foreground);
}

@media (max-width: 960px) {
  .result-row-primary,
  .result-row-secondary {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .result-row-primary,
  .result-row-secondary {
    grid-template-columns: 1fr;
  }
}
</style>
