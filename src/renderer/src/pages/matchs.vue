<template>
  <div class="match-page container mx-auto max-w-6xl p-4 sm:p-6">
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
          {{ t('multi.matchForm.title') }}
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ t('multi.matchForm.desc') }}</p>
      </div>

      <section class="rounded-lg border bg-card p-4 shadow-sm md:p-5">
        <div class="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1fr_180px]">
          <div class="space-y-2">
            <div class="text-sm font-medium text-muted-foreground">
              {{ selectedTeamA?.name ?? t('multi.matchForm.teamA') }}
            </div>
            <Select
              v-model="matchForm.team_a.id"
              @update:model-value="
                (value) => (matchForm.team_a.id = value === '__none__' ? '' : String(value))
              "
            >
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('multi.matchForm.selectTeamA')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{{ t('common.select') }}</SelectItem>
                <SelectItem
                  v-for="team in availableTeamsForA"
                  :key="team.id"
                  :value="String(team.id)"
                >
                  {{ team.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <div class="text-sm font-medium text-muted-foreground">
              {{ selectedTeamB?.name ?? t('multi.matchForm.teamB') }}
            </div>
            <Select
              v-model="matchForm.team_b.id"
              @update:model-value="
                (value) => (matchForm.team_b.id = value === '__none__' ? '' : String(value))
              "
            >
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('multi.matchForm.selectTeamB')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{{ t('common.select') }}</SelectItem>
                <SelectItem
                  v-for="team in availableTeamsForB"
                  :key="team.id"
                  :value="String(team.id)"
                >
                  {{ team.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <div class="text-sm font-medium text-muted-foreground">
              {{ t('multi.matchForm.type') }}
            </div>
            <Select v-model="matchForm.type">
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in types" :key="item.label" :value="item.label">
                  {{ item.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section class="space-y-4">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">{{ t('multi.matchForm.bp.title') }}</h2>
            <p class="text-sm text-muted-foreground">{{ t('multi.matchForm.bp.desc') }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span class="rounded-md border px-2.5 py-1.5">
              {{ t('bp.action.ban') }} {{ actionCounts.ban }} / {{ currentRule.ban }}
            </span>
            <span class="rounded-md border px-2.5 py-1.5">
              {{ t('bp.action.pick') }} {{ actionCounts.pick }} / {{ currentRule.pick }}
            </span>
            <span class="rounded-md border px-2.5 py-1.5">
              {{ t('bp.action.decider') }} {{ actionCounts.decider }} / 1
            </span>
            <span class="min-w-14 text-right text-sm font-semibold tabular-nums">
              {{ bpSequence.length }} / 7
            </span>
          </div>
        </div>

        <div class="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
          <div class="space-y-3">
            <div>
              <h3 class="font-semibold">{{ t('bp.mapPool') }}</h3>
              <p class="text-sm text-muted-foreground">
                {{ bpSequence.length < 6 ? t('multi.matchForm.bp.mapHint') : t('bp.deciderHint') }}
              </p>
            </div>

            <div class="map-grid">
              <article
                v-for="map in BP_MAPS"
                :key="map.id"
                class="map-card"
                :class="{ 'is-used': isMapUsed(map.id) }"
              >
                <img v-if="map.image" class="map-image" :src="map.image" :alt="map.displayName" />
                <div v-else class="map-placeholder" aria-hidden="true">{{ map.name }}</div>
                <div class="map-card-content">
                  <div class="map-name">{{ map.name }}</div>
                  <div class="map-cn">{{ chineseMapName(map.displayName) }}</div>
                  <div v-if="isMapUsed(map.id)" class="map-added">{{ t('bp.added') }}</div>
                  <div v-else-if="bpSequence.length < 6" class="map-actions">
                    <Button
                      size="sm"
                      variant="destructive"
                      :disabled="!canAddAction('ban')"
                      @click="addMap(map.id, 'ban')"
                    >
                      {{ t('bp.action.ban') }}
                    </Button>
                    <Button
                      size="sm"
                      :disabled="!canAddAction('pick')"
                      @click="addMap(map.id, 'pick')"
                    >
                      {{ t('bp.action.pick') }}
                    </Button>
                  </div>
                  <div v-else-if="bpSequence.length === 6" class="map-actions">
                    <Button size="sm" class="decider-button" @click="addMap(map.id, 'decider')">
                      {{ t('bp.action.decider') }}
                    </Button>
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div class="space-y-3">
            <div v-if="bpSequence.length" class="flex justify-end">
              <Button
                variant="ghost"
                class="text-destructive hover:text-destructive"
                @click="clearSequence"
              >
                {{ t('bp.clear') }}
              </Button>
            </div>

            <div v-if="!bpSequence.length" class="sequence-empty">
              {{ t('multi.matchForm.bp.emptySequence') }}
            </div>

            <div v-else class="space-y-3">
              <article v-for="(item, index) in bpSequence" :key="item.map" class="sequence-item">
                <div class="sequence-header">
                  <div class="flex min-w-0 items-center gap-2">
                    <span class="truncate font-semibold">{{ mapDisplayName(item.map) }}</span>
                    <span class="action-badge" :data-action="item.action">
                      {{ actionName(item.action) }}
                    </span>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-destructive hover:text-destructive"
                      :aria-label="t('bp.removeStep')"
                      @click="removeItem(index)"
                    >
                      <X :size="15" />
                    </Button>
                  </div>
                </div>

                <div v-if="item.action !== 'decider'" class="sequence-controls">
                  <div class="control-group">
                    <span class="control-label">{{ t('bp.executingTeam') }}</span>
                    <div class="grid w-full grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        :variant="item.actor === 'team_a' ? 'default' : 'outline'"
                        @click="setActor(index, 'team_a')"
                      >
                        {{ teamSlotName('team_a') }}
                      </Button>
                      <Button
                        size="sm"
                        :variant="item.actor === 'team_b' ? 'default' : 'outline'"
                        @click="setActor(index, 'team_b')"
                      >
                        {{ teamSlotName('team_b') }}
                      </Button>
                    </div>
                  </div>

                  <div v-if="item.action === 'pick'" class="control-group">
                    <span class="control-label">{{ sideSelectorLabel(item) }}</span>
                    <div class="grid w-full grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        :disabled="!item.actor"
                        :variant="item.startingSide === 'CT' ? 'default' : 'outline'"
                        @click="setStartingSide(index, 'CT')"
                      >
                        CT
                      </Button>
                      <Button
                        size="sm"
                        :disabled="!item.actor"
                        :variant="item.startingSide === 'T' ? 'default' : 'outline'"
                        @click="setStartingSide(index, 'T')"
                      >
                        T
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <Separator />

      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-semibold">{{ t('multi.matchForm.score.title') }}</h2>
          <p class="text-sm text-muted-foreground">{{ t('multi.matchForm.score.desc') }}</p>
        </div>
        <div v-if="!seriesMaps.length" class="sequence-empty compact">
          {{ t('multi.matchForm.score.empty') }}
        </div>
        <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="(item, index) in seriesMaps"
            :key="item.map"
            class="rounded-lg border bg-card p-4 shadow-sm"
          >
            <div class="mb-3 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="text-xs text-muted-foreground">
                  {{ t('multi.matchForm.mapNumber', { n: index + 1 }) }}
                </div>
                <div class="truncate font-semibold">{{ mapDisplayName(item.map) }}</div>
              </div>
              <span class="action-badge" :data-action="item.action">
                {{ actionName(item.action) }}
              </span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="space-y-2">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ selectedTeamA?.name ?? t('matchForm.team_a.score') }}
                </span>
                <Input v-model="scoreByMap[item.map].ascore" type="number" :min="0" />
              </label>
              <label class="space-y-2">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ selectedTeamB?.name ?? t('matchForm.team_b.score') }}
                </span>
                <Input v-model="scoreByMap[item.map].bscore" type="number" :min="0" />
              </label>
            </div>
          </article>
        </div>
      </section>

      <div class="flex items-center justify-end gap-3 pb-4 pt-2">
        <Button variant="outline" type="reset" @click="resetForm">
          {{ t('common.reset') }}
        </Button>
        <Button type="submit" @click="submitForm">
          {{ t('multi.matchForm.submitAndPrepare') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { X } from 'lucide-vue-next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  BP_MAPS,
  BP_SERIES_RULES,
  type BPAction,
  type BPMapId,
  type BPSequenceItem,
  type BPStartingSide,
  type BPTeamSlot
} from '../../../shared/bp'

type MapScore = { ascore: number; bscore: number }
interface MatchTeam {
  id: string | number
  name: string
  name_ingame: string
  avatar?: string
}

interface MatchMap {
  name: BPMapId
  pickby: string
  decider: boolean
  ascore: number
  bscore: number
  aid: string | number
  bid: string | number
}

interface MatchFormData {
  id: string | number
  team_a: MatchTeam
  team_b: MatchTeam
  type: 'BO1' | 'BO3' | 'BO5'
  maps: MatchMap[]
}

interface StoredMatchRecord {
  id: string | number
  team_a?: Partial<MatchTeam>
  team_b?: Partial<MatchTeam>
  type?: unknown
  maps?: unknown
}

const { t } = useI18n()
const teams = ref<MatchTeam[]>([])
const bpSequence = ref<BPSequenceItem[]>([])
const scoreByMap = ref(createScoreState())
let isRestoringMatch = false

const types: Array<{ name: MatchFormData['type']; label: MatchFormData['type'] }> = [
  { name: 'BO1', label: 'BO1' },
  { name: 'BO3', label: 'BO3' },
  { name: 'BO5', label: 'BO5' }
]
const allowedMatchTypes = new Set<MatchFormData['type']>(types.map((item) => item.name))
const matchForm = ref<MatchFormData>(createEmptyMatch())

const teamOptions = computed(() => teams.value.map((team) => ({ ...team, id: String(team.id) })))
const availableTeamsForA = computed(() => {
  const currentA = String(matchForm.value.team_a.id ?? '')
  const currentB = String(matchForm.value.team_b.id ?? '')
  return teamOptions.value.filter((team) => team.id === currentA || team.id !== currentB)
})
const availableTeamsForB = computed(() => {
  const currentA = String(matchForm.value.team_a.id ?? '')
  const currentB = String(matchForm.value.team_b.id ?? '')
  return teamOptions.value.filter((team) => team.id === currentB || team.id !== currentA)
})
const selectedTeamA = computed(() =>
  teams.value.find((team) => String(team.id) === String(matchForm.value.team_a.id))
)
const selectedTeamB = computed(() =>
  teams.value.find((team) => String(team.id) === String(matchForm.value.team_b.id))
)
const currentRule = computed(() => BP_SERIES_RULES[matchForm.value.type])
const actionCounts = computed(() => ({
  ban: bpSequence.value.filter((item) => item.action === 'ban').length,
  pick: bpSequence.value.filter((item) => item.action === 'pick').length,
  decider: bpSequence.value.filter((item) => item.action === 'decider').length
}))
const seriesMaps = computed(() =>
  bpSequence.value.filter((item) => item.action === 'pick' || item.action === 'decider')
)

function createEmptyMatch(): MatchFormData {
  return {
    id: '',
    team_a: { id: '', name: '', name_ingame: '' },
    team_b: { id: '', name: '', name_ingame: '' },
    type: 'BO1',
    maps: []
  }
}

function createScoreState(): Record<BPMapId, MapScore> {
  return Object.fromEntries(BP_MAPS.map((map) => [map.id, { ascore: 0, bscore: 0 }])) as Record<
    BPMapId,
    MapScore
  >
}

function normalizeMatchType(value: unknown): MatchFormData['type'] {
  return allowedMatchTypes.has(value as MatchFormData['type'])
    ? (value as MatchFormData['type'])
    : 'BO1'
}

function chineseMapName(displayName: string): string {
  const start = displayName.indexOf('(')
  return start === -1 ? displayName : displayName.slice(start + 1, -1)
}

function mapDisplayName(mapId: BPMapId): string {
  return BP_MAPS.find((map) => map.id === mapId)?.displayName ?? mapId
}

function actionName(action: BPAction): string {
  return t(`bp.action.${action}`)
}

function teamSlotName(slot: BPTeamSlot): string {
  const team = slot === 'team_a' ? selectedTeamA.value : selectedTeamB.value
  return team?.name || team?.name_ingame || (slot === 'team_a' ? t('bp.teamA') : t('bp.teamB'))
}

function oppositeTeamSlot(slot: BPTeamSlot): BPTeamSlot {
  return slot === 'team_a' ? 'team_b' : 'team_a'
}

function sideSelectorLabel(item: BPSequenceItem): string {
  if (!item.actor) return t('bp.selectActorFirst')
  return t('bp.startingSide', { team: teamSlotName(oppositeTeamSlot(item.actor)) })
}

function isMapUsed(mapId: BPMapId): boolean {
  return bpSequence.value.some((item) => item.map === mapId)
}

function canAddAction(action: Exclude<BPAction, 'decider'>): boolean {
  return bpSequence.value.length < 6 && actionCounts.value[action] < currentRule.value[action]
}

function addMap(map: BPMapId, action: BPAction): void {
  if (isMapUsed(map) || bpSequence.value.length >= 7) return
  const isFinalStep = bpSequence.value.length === 6
  if ((isFinalStep && action !== 'decider') || (!isFinalStep && action === 'decider')) return
  if (action !== 'decider' && !canAddAction(action)) return

  bpSequence.value.push({ map, action, actor: '', startingSide: '' })
}

function removeItem(index: number): void {
  bpSequence.value.splice(index, 1)
  bpSequence.value = bpSequence.value.filter(
    (item, itemIndex) => item.action !== 'decider' || itemIndex === 6
  )
}

function clearSequence(): void {
  bpSequence.value = []
  toast.info(t('bp.toast.cleared'), { duration: 2000 })
}

function setActor(index: number, actor: BPTeamSlot): void {
  const item = bpSequence.value[index]
  if (!item || item.action === 'decider') return
  if (item.actor !== actor) item.startingSide = ''
  item.actor = actor
}

function setStartingSide(index: number, side: BPStartingSide): void {
  const item = bpSequence.value[index]
  if (!item || item.action !== 'pick' || !item.actor) return
  item.startingSide = side
}

function mapTeamId(slot: BPTeamSlot | ''): string {
  if (slot === 'team_a') return String(matchForm.value.team_a.id)
  if (slot === 'team_b') return String(matchForm.value.team_b.id)
  return ''
}

function buildMatchMaps(): MatchMap[] {
  return seriesMaps.value.map((item) => ({
    name: item.map,
    pickby: item.action === 'pick' ? mapTeamId(item.actor) : '',
    decider: item.action === 'decider',
    ascore: Math.max(0, Number(scoreByMap.value[item.map].ascore ?? 0) || 0),
    bscore: Math.max(0, Number(scoreByMap.value[item.map].bscore ?? 0) || 0),
    aid: matchForm.value.team_a.id,
    bid: matchForm.value.team_b.id
  }))
}

function validateForm(): string | null {
  if (!matchForm.value.team_a.id || !matchForm.value.team_b.id) {
    return t('multi.matchForm.pickTeams')
  }
  if (String(matchForm.value.team_a.id) === String(matchForm.value.team_b.id)) {
    return t('multi.matchForm.teamsUnique')
  }
  if (bpSequence.value.length !== 7) return t('bp.validation.stepCount')
  if (actionCounts.value.ban !== currentRule.value.ban) {
    return t('multi.matchForm.bp.banCount', { count: currentRule.value.ban })
  }
  if (actionCounts.value.pick !== currentRule.value.pick) {
    return t('multi.matchForm.bp.pickCount', { count: currentRule.value.pick })
  }

  for (let index = 0; index < bpSequence.value.length; index += 1) {
    const item = bpSequence.value[index]
    if (index === 6 && item.action !== 'decider') return t('bp.validation.decider')
    if (index < 6 && item.action === 'decider') return t('bp.validation.decider')
    if (item.action !== 'decider' && !item.actor) {
      return t('bp.validation.actor', { step: index + 1 })
    }
    if (item.action === 'pick' && !item.startingSide) {
      return t('bp.validation.side', { step: index + 1 })
    }
  }

  return null
}

async function loadTeams(): Promise<void> {
  try {
    const list = await window.db.teams.getAll()
    teams.value = Array.isArray(list) ? (list as MatchTeam[]) : (Object.values(list) as MatchTeam[])
  } catch (error: unknown) {
    toast.error(t('common.loadFailed'), {
      description: error instanceof Error ? error.message : String(error),
      duration: 4000
    })
  }
}

async function autoLoadMatch(): Promise<void> {
  try {
    let record: StoredMatchRecord | undefined
    try {
      const currentId = await window.db.settings.get('currentMatchId')
      if (currentId != null) {
        record = (await window.db.matchs.getById(currentId)) as StoredMatchRecord | undefined
      }
    } catch {
      // 设置读取失败时继续尝试加载最近一条比赛记录
    }

    if (!record) {
      const list = await window.db.matchs.getAll()
      const items = (Array.isArray(list) ? list : Object.values(list)) as StoredMatchRecord[]
      if (items.length === 0) return
      record = [...items].sort((a, b) => {
        const firstId = Number(a?.id)
        const secondId = Number(b?.id)
        if (Number.isFinite(firstId) && Number.isFinite(secondId)) return secondId - firstId
        return 0
      })[0]
    }
    if (!record) return

    const restoredScores = createScoreState()
    if (Array.isArray(record.maps)) {
      for (const map of record.maps as Array<Partial<MatchMap>>) {
        const mapId = map?.name as BPMapId
        if (!BP_MAPS.some((item) => item.id === mapId)) continue
        restoredScores[mapId] = {
          ascore: Math.max(0, Number(map?.ascore ?? 0) || 0),
          bscore: Math.max(0, Number(map?.bscore ?? 0) || 0)
        }
      }
    }

    isRestoringMatch = true
    matchForm.value = {
      id: record.id,
      team_a: {
        id: String(record.team_a?.id ?? ''),
        name: String(record.team_a?.name ?? ''),
        name_ingame: String(record.team_a?.name_ingame ?? '')
      },
      team_b: {
        id: String(record.team_b?.id ?? ''),
        name: String(record.team_b?.name ?? ''),
        name_ingame: String(record.team_b?.name_ingame ?? '')
      },
      type: normalizeMatchType(record.type),
      maps: []
    }
    scoreByMap.value = restoredScores
    isRestoringMatch = false

    const bpPayload = await window.api.getBPState()
    if (bpPayload.match && String(bpPayload.match.id) === String(record.id)) {
      bpSequence.value = JSON.parse(JSON.stringify(bpPayload.state.sequence))
    }
  } catch (error: unknown) {
    isRestoringMatch = false
    toast.warning(t('common.loadFailed'), {
      description: error instanceof Error ? error.message : String(error),
      duration: 3000
    })
  }
}

function resetForm(): void {
  isRestoringMatch = true
  matchForm.value = createEmptyMatch()
  isRestoringMatch = false
  bpSequence.value = []
  scoreByMap.value = createScoreState()
  toast.info(t('common.resetSuccess'), { duration: 2000 })
}

async function submitForm(): Promise<void> {
  const validationError = validateForm()
  if (validationError) {
    toast.warning(t('common.validateFailed'), { description: validationError, duration: 4000 })
    return
  }

  const teamA = teams.value.find((team) => String(team.id) === String(matchForm.value.team_a.id))
  const teamB = teams.value.find((team) => String(team.id) === String(matchForm.value.team_b.id))
  if (teamA) matchForm.value.team_a = { ...teamA, id: String(teamA.id) }
  if (teamB) matchForm.value.team_b = { ...teamB, id: String(teamB.id) }

  matchForm.value.maps = buildMatchMaps()
  const item = JSON.parse(JSON.stringify(matchForm.value))
  if (item.team_a) delete item.team_a.avatar
  if (item.team_b) delete item.team_b.avatar

  try {
    const existingId = await window.db.settings.get('currentMatchId').catch(() => null)
    const targetId = String(item.id || existingId || 'current')
    item.id = targetId

    let didModify = false
    try {
      const existing = await window.db.matchs.getById(targetId)
      if (existing) {
        await window.db.matchs.modify(targetId, item)
        didModify = true
      } else {
        await window.db.matchs.add(item)
      }
    } catch {
      await window.db.matchs.add(item)
    }

    await window.db.settings.set('currentMatchId', targetId)
    matchForm.value.id = targetId
    await window.api.setBPContent({
      sequence: JSON.parse(JSON.stringify(bpSequence.value))
    })
    toast.success(didModify ? t('common.modifySuccess') : t('common.addSuccess'), {
      description: t('multi.matchForm.bp.prepared'),
      duration: 3500
    })
  } catch (error: unknown) {
    toast.error(t('common.saveFailed'), {
      description: error instanceof Error ? error.message : String(error),
      duration: 4000
    })
  }
}

watch(
  () => matchForm.value.type,
  (nextType, previousType) => {
    if (isRestoringMatch || nextType === previousType) return
    bpSequence.value = []
    scoreByMap.value = createScoreState()
  },
  { flush: 'sync' }
)

watch(
  () => matchForm.value.team_a.id,
  (id) => {
    const team = teams.value.find((item) => String(item.id) === String(id))
    matchForm.value.team_a.name = team?.name ?? ''
    matchForm.value.team_a.name_ingame = team?.name_ingame ?? ''
  }
)

watch(
  () => matchForm.value.team_b.id,
  (id) => {
    const team = teams.value.find((item) => String(item.id) === String(id))
    matchForm.value.team_b.name = team?.name ?? ''
    matchForm.value.team_b.name_ingame = team?.name_ingame ?? ''
  }
)

onMounted(async () => {
  await loadTeams()
  await autoLoadMatch()
})
</script>

<style scoped lang="scss">
.match-page {
  min-height: 100%;
  overflow-y: auto;
  padding-bottom: 3rem;
}

.map-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
}

.map-card {
  position: relative;
  min-height: 150px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
  transition: var(--transition);
  isolation: isolate;

  &:hover:not(.is-used) {
    border-color: var(--primary);
  }

  &.is-used {
    opacity: 0.62;
  }
}

.map-image,
.map-placeholder {
  position: absolute;
  z-index: -1;
  inset: 0;
  width: 100%;
  height: 100%;
}

.map-image {
  object-fit: cover;
}

.map-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.055);
  font-size: clamp(1.5rem, 2.4vw, 2.8rem);
  font-weight: 900;
  line-height: 0.9;
  text-align: center;
  text-transform: uppercase;
  transform: rotate(-8deg);
}

.map-card-content {
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: flex-end;
  flex-direction: column;
  gap: 0.2rem;
  padding: 1rem 0.6rem 0.75rem;
  background: linear-gradient(transparent, rgba(9, 9, 11, 0.96));
}

.map-name {
  font-size: 1rem;
  font-weight: 800;
}

.map-cn {
  color: var(--muted-foreground);
  font-size: 0.75rem;
}

.map-actions {
  display: flex;
  width: 100%;
  justify-content: center;
  gap: 0.35rem;
  margin-top: 0.5rem;

  button {
    min-width: 0;
    flex: 1;
  }
}

.map-added {
  margin-top: 0.5rem;
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted-foreground);
  font-size: 0.7rem;
  font-weight: 700;
}

.decider-button {
  color: #082f49;
  background: #38bdf8;

  &:hover {
    background: #7dd3fc;
  }
}

.sequence-empty {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--muted-foreground);
  text-align: center;

  &.compact {
    min-height: 84px;
  }
}

.sequence-item {
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
}

.sequence-header {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.action-badge {
  flex: 0 0 auto;
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
  color: #ffffff;
  background: var(--muted);
  font-size: 0.68rem;
  font-weight: 700;

  &[data-action='ban'] {
    background: var(--primary);
  }

  &[data-action='pick'] {
    background: #15803d;
  }

  &[data-action='decider'] {
    color: #082f49;
    background: #38bdf8;
  }
}

.sequence-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px solid var(--border);
}

.control-group {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  flex-direction: column;
  gap: 0.45rem;
}

.control-label {
  max-width: 100%;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 0.72rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

input[type='number']::-webkit-outer-spin-button,
input[type='number']::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

input[type='number'] {
  -moz-appearance: textfield;
}

@media (max-width: 1180px) {
  .map-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .map-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sequence-controls {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .map-card,
  .sequence-item {
    transition: none;
  }
}
</style>
