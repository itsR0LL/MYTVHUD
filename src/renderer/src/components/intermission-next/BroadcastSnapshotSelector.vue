<template>
  <section v-if="snapshotMaps.length" class="rounded-lg border bg-card p-4 shadow-sm">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="font-semibold">页面数据快照</h2>
        <p class="mt-1 text-xs text-muted-foreground">
          选择当前系列赛中已经冻结的地图，只会更新准备节目，不会修改比赛记录和正在播出的节目。
        </p>
      </div>
      <span class="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
        {{ snapshotMaps.length }} 张已完成地图
      </span>
    </div>

    <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <button
        v-for="item in snapshotMaps"
        :key="item.mapId"
        type="button"
        class="snapshot-card"
        :class="{ selected: selectedMapId === item.mapId }"
        :aria-pressed="selectedMapId === item.mapId"
        :disabled="busy"
        @click="selectedMapId = item.mapId"
      >
        <img :src="item.icon" alt="" />
        <span class="min-w-0 text-left">
          <strong class="block truncate">{{ item.displayName }}</strong>
          <span class="mt-0.5 block text-xs text-muted-foreground">
            {{ item.snapshot.teamAScore }} : {{ item.snapshot.teamBScore }} ·
            {{ item.snapshot.players.length }} 名选手
          </span>
        </span>
      </button>
    </div>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
      <span class="text-xs text-muted-foreground"> 当前准备来源：{{ preparedMapLabel }} </span>
      <Button
        variant="outline"
        :disabled="busy || !selectedMapId"
        @click="selectedMapId && emit('prepare', selectedMapId)"
      >
        将所选地图战报设为准备节目
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { BP_MAPS, type BPMapId } from '../../../../shared/bp'
import type { IntermissionPayload } from '../../../../shared/intermission'

const props = defineProps<{ payload: IntermissionPayload; busy: boolean }>()
const emit = defineEmits<{ prepare: [mapId: BPMapId] }>()
const selectedMapId = ref<BPMapId | ''>('')

const sourceProgram = computed(
  () => props.payload.runtime.preparedProgram ?? props.payload.runtime.onAirProgram
)
const snapshotMaps = computed(() => {
  const program = sourceProgram.value
  if (!program) return []
  return program.snapshot.match.maps.flatMap((matchMap) => {
    const snapshot = program.snapshot.mapSnapshots[matchMap.name]
    const map = BP_MAPS.find((entry) => entry.id === matchMap.name)
    return snapshot && map
      ? [
          {
            mapId: matchMap.name,
            displayName: map.displayName,
            icon: map.image,
            snapshot
          }
        ]
      : []
  })
})
const preparedMapLabel = computed(() => {
  const mapId = props.payload.runtime.preparedProgram?.sourceMapId
  if (!mapId) return '尚未选择'
  return BP_MAPS.find((map) => map.id === mapId)?.displayName ?? mapId
})

watch(
  snapshotMaps,
  (maps) => {
    const preparedMapId = props.payload.runtime.preparedProgram?.sourceMapId ?? ''
    if (preparedMapId && maps.some((item) => item.mapId === preparedMapId)) {
      selectedMapId.value = preparedMapId
      return
    }
    selectedMapId.value = maps.at(-1)?.mapId ?? ''
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.snapshot-card {
  display: grid;
  grid-template-columns: 2.75rem minmax(0, 1fr);
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--muted) 25%, transparent);
  transition:
    border-color 140ms ease,
    background-color 140ms ease;

  &:hover:not(:disabled),
  &.selected {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  img {
    width: 2.75rem;
    height: 2.75rem;
    object-fit: contain;
  }
}
</style>
