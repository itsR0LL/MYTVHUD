<template>
  <div class="match-page app-scrollbar-hidden container mx-auto max-w-6xl p-4 sm:p-6">
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
              :disabled="structureInputsDisabled"
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
              :disabled="structureInputsDisabled"
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
            <Select v-model="matchForm.type" :disabled="structureInputsDisabled">
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
        <div class="mt-4 rounded-md border px-3 py-2 text-sm" :class="gsiResolutionClass">
          {{ gsiResolutionText }}
        </div>
      </section>

      <section class="rounded-lg border bg-card p-4 shadow-sm md:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold">比赛运行状态</h2>
            <p class="mt-1 text-sm text-muted-foreground">
              GSI 自动推进地图；人工按钮仅用于异常处理与系列赛交接。
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="structureLocked"
              :variant="manualCorrectionEnabled ? 'destructive' : 'outline'"
              :disabled="runtimeBusy"
              @click="manualCorrectionEnabled = !manualCorrectionEnabled"
            >
              {{ manualCorrectionEnabled ? '退出人工修正' : '进入人工修正' }}
            </Button>
            <Button
              variant="outline"
              :disabled="runtimeBusy || !matchRuntime.seriesEnded"
              @click="startNextMatchDraft"
            >
              创建下一场比赛
            </Button>
            <Button
              variant="outline"
              :disabled="runtimeBusy || !canFinishSeries"
              @click="finishSeries"
            >
              结束本场并生成战报
            </Button>
          </div>
        </div>

        <div
          v-if="manualCorrectionEnabled"
          class="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
        >
          修改双方、赛制或完整 BP 后保存，会明确作废当前比赛的全部运行快照和准备节目；已经在 OBS
          播出的旧节目不会被删除。
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="runtime-card">
            <span>当前比赛 ID</span>
            <strong>{{ runtimeMatch?.id ?? '未设置' }}</strong>
          </div>
          <div class="runtime-card">
            <span>当前地图</span>
            <strong>{{ currentRuntimeMapLabel }}</strong>
          </div>
          <div class="runtime-card">
            <span>系列赛大比分</span>
            <strong>{{ runtimeSeriesScore.teamA }} : {{ runtimeSeriesScore.teamB }}</strong>
          </div>
          <div class="runtime-card">
            <span>播出准备</span>
            <strong>{{ preparedBroadcastLabel }}</strong>
          </div>
        </div>

        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <div class="rounded-md border bg-muted/20 p-3 text-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span>完整 BP</span>
              <strong>{{ runtimeBPReady ? '已保存' : '未完成' }}</strong>
            </div>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span>最近完整 GSI</span>
              <strong>{{ lastCompleteGSILabel }}</strong>
            </div>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span>系列赛状态</span>
              <strong>{{ matchRuntime.seriesEnded ? '已结束' : '进行中或待开始' }}</strong>
            </div>
          </div>
          <div class="rounded-md border bg-muted/20 p-3 text-sm">
            <div class="mb-2 font-semibold">地图快照</div>
            <div v-if="!runtimeMatch?.maps.length" class="text-muted-foreground">
              尚无比赛地图。
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="map in runtimeMatch.maps"
                :key="map.name"
                class="flex flex-wrap items-center justify-between gap-2"
              >
                <span>{{ mapDisplayName(map.name) }} · {{ map.ascore }}:{{ map.bscore }}</span>
                <span class="text-xs text-muted-foreground">
                  {{
                    matchRuntime.mapSnapshots[map.name] ? '快照已冻结' : mapStatusLabel(map.status)
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="outline" :disabled="runtimeBusy" @click="clearRuntimeData">
            清除当前比赛运行数据
          </Button>
        </div>
      </section>

      <div
        v-if="isNextMatchDraft"
        class="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm"
      >
        正在创建下一场比赛。选择双方与赛制后可先保存基本信息；上一场冻结战报不会被覆盖。
      </div>

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
                <img
                  class="map-image"
                  :src="map.image"
                  :alt="map.displayName"
                  width="512"
                  height="512"
                  loading="lazy"
                  decoding="async"
                />
                <div class="map-card-content">
                  <div class="map-name">{{ map.name }}</div>
                  <div class="map-cn">{{ chineseMapName(map.displayName) }}</div>
                  <div v-if="isMapUsed(map.id)" class="map-added">{{ t('bp.added') }}</div>
                  <div v-else-if="nextRequiredAction === 'ban'" class="map-actions">
                    <Button
                      size="sm"
                      variant="destructive"
                      :disabled="structureInputsDisabled || !canAddAction('ban')"
                      @click="addMap(map.id, 'ban')"
                    >
                      {{ t('bp.action.ban') }}
                    </Button>
                  </div>
                  <div v-else-if="nextRequiredAction === 'pick'" class="map-actions">
                    <Button
                      size="sm"
                      :disabled="structureInputsDisabled || !canAddAction('pick')"
                      @click="addMap(map.id, 'pick')"
                    >
                      {{ t('bp.action.pick') }}
                    </Button>
                  </div>
                  <div v-else-if="nextRequiredAction === 'decider'" class="map-actions">
                    <Button
                      size="sm"
                      class="decider-button"
                      :disabled="structureInputsDisabled || !canAddAction('decider')"
                      @click="addMap(map.id, 'decider')"
                    >
                      {{ t('bp.action.decider') }}
                    </Button>
                  </div>
                </div>
              </article>
            </div>

            <BPResultGrid
              compact
              :sequence="bpSequence"
              :team-a="selectedTeamA ?? null"
              :team-b="selectedTeamB ?? null"
            />
          </div>

          <div class="space-y-3">
            <div v-if="bpSequence.length" class="flex justify-end">
              <Button
                variant="ghost"
                class="text-destructive hover:text-destructive"
                :disabled="structureInputsDisabled"
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
                      :disabled="structureInputsDisabled"
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
                        :disabled="structureInputsDisabled"
                        @click="setActor(index, 'team_a')"
                      >
                        {{ teamSlotName('team_a') }}
                      </Button>
                      <Button
                        size="sm"
                        :variant="item.actor === 'team_b' ? 'default' : 'outline'"
                        :disabled="structureInputsDisabled"
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
                        :disabled="structureInputsDisabled || !item.actor"
                        :variant="item.startingSide === 'CT' ? 'default' : 'outline'"
                        @click="setStartingSide(index, 'CT')"
                      >
                        CT
                      </Button>
                      <Button
                        size="sm"
                        :disabled="structureInputsDisabled || !item.actor"
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

      <div class="flex items-center justify-end gap-3 pb-4 pt-2">
        <Button
          v-if="isNextMatchDraft"
          variant="outline"
          :disabled="runtimeBusy || !canSaveNextMatchBasics"
          @click="saveNextMatchBasics"
        >
          保存下一场基本信息
        </Button>
        <Button variant="outline" type="reset" :disabled="isResetting" @click="resetForm">
          完全重置赛事工作区
        </Button>
        <Button type="submit" @click="submitForm">
          {{ t('multi.matchForm.submitAndPrepare') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { X } from 'lucide-vue-next'

import BPResultGrid from '@/components/bp/BPResultGrid.vue'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  BP_MAPS,
  BP_SERIES_ACTION_ORDER,
  BP_SERIES_RULES,
  getTeamAbbreviation,
  isBPSequenceComplete,
  normalizeBPSequence,
  type BPAction,
  type BPMapId,
  type BPSequenceItem,
  type BPStartingSide,
  type BPTeamSlot
} from '../../../shared/bp'
import {
  createMatchMapsFromBP,
  calculateSnapshotSeriesScore,
  createDefaultMatchRuntime,
  normalizeMatchRecord,
  type MatchRecord,
  type MatchRuntimeV1
} from '../../../shared/match-session'
import {
  createDefaultBroadcastRuntime,
  type BroadcastRuntimeV1
} from '../../../shared/broadcast-flow'
import type { MatchMapStatus } from '../../../shared/intermission'

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
  status: MatchMapStatus
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
  bpSequence?: unknown
}

interface GSITeamResolutionStatus {
  state: 'waiting' | 'resolved' | 'unresolved' | 'offline'
  teamCT: { id: string; name: string } | null
  teamT: { id: string; name: string } | null
  reason: string
  gsiMapId: string
  plannedMapIds: string[]
}

const { t } = useI18n()
const teams = ref<MatchTeam[]>([])
const bpSequence = ref<BPSequenceItem[]>([])
const isResetting = ref(false)
const runtimeBusy = ref(false)
const isNextMatchDraft = ref(false)
const manualCorrectionEnabled = ref(false)
const matchRuntime = ref<MatchRuntimeV1>(createDefaultMatchRuntime())
const broadcastRuntime = ref<BroadcastRuntimeV1>(createDefaultBroadcastRuntime())
const runtimeMatch = ref<MatchRecord | null>(null)
const gsiTeamResolution = ref<GSITeamResolutionStatus>({
  state: 'waiting',
  teamCT: null,
  teamT: null,
  reason: '等待 CS2 GSI 数据',
  gsiMapId: '',
  plannedMapIds: []
})
let isRestoringMatch = false
let gsiResolutionTimer: number | null = null

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
const gsiResolutionText = computed(() => {
  const status = gsiTeamResolution.value
  if (status.state === 'resolved' && status.teamCT && status.teamT) {
    return `HUD 战队识别：CT → ${status.teamCT.name}，T → ${status.teamT.name}`
  }
  if (status.state === 'unresolved') {
    return status.reason || 'HUD 战队尚未识别，请检查当前比赛与选手所属战队。'
  }
  if (status.state === 'offline') return '本地 GSI 服务未连接。'
  return '等待 CS2 GSI 数据。'
})
const gsiResolutionClass = computed(() => {
  if (gsiTeamResolution.value.state === 'resolved') return 'border-emerald-500/40 text-emerald-500'
  if (gsiTeamResolution.value.state === 'unresolved')
    return 'border-destructive/40 text-destructive'
  return 'text-muted-foreground'
})
const currentRule = computed(() => BP_SERIES_RULES[matchForm.value.type])
const currentActionOrder = computed(() => BP_SERIES_ACTION_ORDER[matchForm.value.type])
const nextRequiredAction = computed(() => currentActionOrder.value[bpSequence.value.length])
const actionCounts = computed(() => ({
  ban: bpSequence.value.filter((item) => item.action === 'ban').length,
  pick: bpSequence.value.filter((item) => item.action === 'pick').length,
  decider: bpSequence.value.filter((item) => item.action === 'decider').length
}))
const runtimeSeriesScore = computed(() =>
  runtimeMatch.value
    ? calculateSnapshotSeriesScore(
        runtimeMatch.value.maps,
        matchRuntime.value.mapSnapshots,
        runtimeMatch.value.type
      )
    : { teamA: 0, teamB: 0 }
)
const runtimeBPReady = computed(() =>
  runtimeMatch.value
    ? isBPSequenceComplete(runtimeMatch.value.bpSequence, runtimeMatch.value.type)
    : false
)
const currentRuntimeMapLabel = computed(() => {
  if (!matchRuntime.value.currentMapId)
    return matchRuntime.value.seriesEnded ? '系列赛已结束' : '未开始'
  const map = runtimeMatch.value?.maps.find((item) => item.name === matchRuntime.value.currentMapId)
  return map
    ? `${mapDisplayName(map.name)} · ${mapStatusLabel(map.status)}`
    : matchRuntime.value.currentMapId
})
const preparedBroadcastLabel = computed(() => {
  const program = broadcastRuntime.value.preparedProgram
  if (!program) return '尚未生成'
  if (program.type === 'map_break') return '地图间节目已就绪'
  if (program.type === 'series_end') return '系列赛战报已就绪'
  return '赛事待机已就绪'
})
const lastCompleteGSILabel = computed(() => {
  const timestamp = matchRuntime.value.lastCompleteGSIAtMs
  return timestamp === null
    ? '尚未接收'
    : new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
})
const canFinishSeries = computed(
  () =>
    !matchRuntime.value.seriesEnded &&
    Object.keys(matchRuntime.value.mapSnapshots).length > 0 &&
    String(matchRuntime.value.matchId ?? '') === String(runtimeMatch.value?.id ?? '')
)
const canSaveNextMatchBasics = computed(
  () =>
    Boolean(matchForm.value.team_a.id) &&
    Boolean(matchForm.value.team_b.id) &&
    String(matchForm.value.team_a.id) !== String(matchForm.value.team_b.id)
)
const structureLocked = computed(
  () =>
    !isNextMatchDraft.value &&
    String(matchRuntime.value.matchId ?? '') === String(matchForm.value.id ?? '') &&
    (Boolean(matchRuntime.value.currentMapId) ||
      matchRuntime.value.handledMapEndIds.length > 0 ||
      Object.keys(matchRuntime.value.mapSnapshots).length > 0)
)
const structureInputsDisabled = computed(
  () => runtimeBusy.value || (structureLocked.value && !manualCorrectionEnabled.value)
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

function mapStatusLabel(status: MatchMapStatus): string {
  if (status === 'live') return '进行中'
  if (status === 'finished') return '已结束'
  return '待开始'
}

function actionName(action: BPAction): string {
  return t(`bp.action.${action}`)
}

function teamSlotName(slot: BPTeamSlot): string {
  const team = slot === 'team_a' ? selectedTeamA.value : selectedTeamB.value
  return getTeamAbbreviation(team, slot === 'team_a' ? t('bp.teamA') : t('bp.teamB'))
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

function canAddAction(action: BPAction): boolean {
  return (
    nextRequiredAction.value === action &&
    bpSequence.value.every((item, index) => item.action === currentActionOrder.value[index])
  )
}

function addMap(map: BPMapId, action: BPAction): void {
  if (isMapUsed(map) || bpSequence.value.length >= 7) return
  if (!canAddAction(action)) return

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

function buildMatchMaps(): MatchMap[] {
  return createMatchMapsFromBP(
    bpSequence.value,
    matchForm.value.type,
    matchForm.value.team_a.id,
    matchForm.value.team_b.id
  )
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
    const requiredAction = currentActionOrder.value[index]
    if (item.action !== requiredAction) {
      return t('bp.validation.actionOrder', {
        step: index + 1,
        action: actionName(requiredAction)
      })
    }
    if (item.action !== 'decider' && !item.actor) {
      return t('bp.validation.actor', { step: index + 1 })
    }
    if (item.action === 'pick' && !item.startingSide) {
      return t('bp.validation.side', { step: index + 1 })
    }
  }

  return null
}

async function loadGSITeamResolution(): Promise<void> {
  try {
    const response = await fetch('http://127.0.0.1:5031/api/gsi/team-resolution')
    if (!response.ok) throw new Error(String(response.status))
    const value = (await response.json()) as Partial<GSITeamResolutionStatus>
    if (!['waiting', 'resolved', 'unresolved'].includes(String(value.state))) {
      throw new Error('Invalid GSI team resolution state')
    }
    gsiTeamResolution.value = {
      state: value.state as 'waiting' | 'resolved' | 'unresolved',
      teamCT: value.teamCT ?? null,
      teamT: value.teamT ?? null,
      reason: typeof value.reason === 'string' ? value.reason : '',
      gsiMapId: typeof value.gsiMapId === 'string' ? value.gsiMapId : '',
      plannedMapIds: Array.isArray(value.plannedMapIds)
        ? value.plannedMapIds.filter((item): item is string => typeof item === 'string')
        : []
    }
  } catch {
    gsiTeamResolution.value = {
      state: 'offline',
      teamCT: null,
      teamT: null,
      reason: '本地 GSI 服务未连接',
      gsiMapId: '',
      plannedMapIds: []
    }
  }
}

async function loadRuntimeStatus(): Promise<void> {
  try {
    const [nextMatchRuntime, nextBroadcastRuntime, currentMatchId] = await Promise.all([
      window.api.getMatchRuntimeState(),
      window.api.getBroadcastState(),
      window.db.settings.get('currentMatchId')
    ])
    let record: unknown = null
    if (typeof currentMatchId === 'string' || typeof currentMatchId === 'number') {
      record = await window.db.matchs.getById(currentMatchId)
    }
    matchRuntime.value = nextMatchRuntime
    broadcastRuntime.value = nextBroadcastRuntime
    runtimeMatch.value = normalizeMatchRecord(record)
  } catch (error: unknown) {
    console.error('读取比赛运行状态失败：', error)
  }
}

function startNextMatchDraft(): void {
  if (!matchRuntime.value.seriesEnded || runtimeBusy.value) return
  isRestoringMatch = true
  matchForm.value = createEmptyMatch()
  bpSequence.value = []
  isRestoringMatch = false
  isNextMatchDraft.value = true
  manualCorrectionEnabled.value = false
}

async function saveNextMatchBasics(): Promise<void> {
  if (!isNextMatchDraft.value || !canSaveNextMatchBasics.value || runtimeBusy.value) return
  runtimeBusy.value = true
  try {
    const match = await window.api.createNextMatch({
      teamAId: matchForm.value.team_a.id,
      teamBId: matchForm.value.team_b.id,
      type: matchForm.value.type
    })
    matchForm.value.id = match.id
    isNextMatchDraft.value = false
    manualCorrectionEnabled.value = false
    await loadRuntimeStatus()
    toast.success('下一场比赛基本信息已保存', {
      description: 'BP 尚未完成，OBS 不会自动展示。',
      duration: 3500
    })
  } catch (error: unknown) {
    toast.error(t('common.saveFailed'), {
      description: error instanceof Error ? error.message : String(error),
      duration: 4000
    })
  } finally {
    runtimeBusy.value = false
  }
}

async function finishSeries(): Promise<void> {
  if (!canFinishSeries.value || runtimeBusy.value) return
  if (!window.confirm('确认人工结束当前系列赛并生成完整战报吗？比赛记录与地图快照会保留。')) {
    return
  }
  runtimeBusy.value = true
  try {
    matchRuntime.value = await window.api.finishMatchSeries()
    await loadRuntimeStatus()
    toast.success('系列赛战报已生成', { duration: 2500 })
  } catch (error: unknown) {
    toast.error('无法结束当前系列赛', {
      description: error instanceof Error ? error.message : String(error),
      duration: 4000
    })
  } finally {
    runtimeBusy.value = false
  }
}

async function clearRuntimeData(): Promise<void> {
  if (runtimeBusy.value) return
  if (!window.confirm('确认清除当前比赛运行快照吗？比赛表单与 BP 记录不会删除。')) return
  runtimeBusy.value = true
  try {
    matchRuntime.value = await window.api.clearMatchRuntimeState()
    await loadRuntimeStatus()
    toast.success('当前比赛运行数据已清除', { duration: 2500 })
  } catch (error: unknown) {
    toast.error('运行数据清除失败', {
      description: error instanceof Error ? error.message : String(error),
      duration: 4000
    })
  } finally {
    runtimeBusy.value = false
  }
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
      const settings = await window.db.settings.getAll()
      if (Object.prototype.hasOwnProperty.call(settings, 'currentMatchId')) {
        const currentId = settings.currentMatchId
        if (currentId == null) return
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
    isRestoringMatch = false

    bpSequence.value = normalizeBPSequence(record.bpSequence)
  } catch (error: unknown) {
    isRestoringMatch = false
    toast.warning(t('common.loadFailed'), {
      description: error instanceof Error ? error.message : String(error),
      duration: 3000
    })
  }
}

async function resetForm(): Promise<void> {
  if (isResetting.value) return
  if (
    !window.confirm(
      '确认完全重置赛事工作区吗？当前比赛、BP 输出、页面播放运行状态和运行快照会清空；战队、选手、页面设置与页面播放流程会保留。'
    )
  ) {
    return
  }
  if (
    !window.confirm(
      '再次确认：该操作会立即隐藏 BP 与播出控制输出，并清除当前比赛运行快照，且无法撤销。是否继续？'
    )
  ) {
    return
  }
  isResetting.value = true
  try {
    await window.api.resetMatchBroadcastState(true)
    isRestoringMatch = true
    matchForm.value = createEmptyMatch()
    isRestoringMatch = false
    bpSequence.value = []
    isNextMatchDraft.value = false
    manualCorrectionEnabled.value = false
    await loadRuntimeStatus()
    toast.info(t('common.resetSuccess'), { duration: 2000 })
  } catch (error: unknown) {
    isRestoringMatch = false
    toast.error(t('common.saveFailed'), {
      description: error instanceof Error ? error.message : String(error),
      duration: 4000
    })
  } finally {
    isResetting.value = false
  }
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
  item.bpSequence = JSON.parse(JSON.stringify(bpSequence.value))
  if (item.team_a) delete item.team_a.avatar
  if (item.team_b) delete item.team_b.avatar
  const affectedSnapshotLabels = Object.keys(matchRuntime.value.mapSnapshots).map((mapId) =>
    mapDisplayName(mapId as BPMapId)
  )
  const correctionScope = affectedSnapshotLabels.length
    ? `以下地图快照及关联准备节目：${affectedSnapshotLabels.join('、')}`
    : '当前比赛运行状态及关联准备节目'

  if (
    structureLocked.value &&
    manualCorrectionEnabled.value &&
    !window.confirm(`确认保存人工结构修正吗？${correctionScope}会被作废。`)
  ) {
    return
  }

  runtimeBusy.value = true
  try {
    if (isNextMatchDraft.value) {
      const created = await window.api.createNextMatch({
        teamAId: item.team_a.id,
        teamBId: item.team_b.id,
        type: item.type
      })
      item.id = created.id
      matchForm.value.id = created.id
      isNextMatchDraft.value = false
    }
    const result = await window.api.saveMatch({
      match: item,
      allowStructureInvalidation: manualCorrectionEnabled.value
    })
    matchForm.value.id = result.match.id
    await window.api.setBPContent({
      sequence: JSON.parse(JSON.stringify(bpSequence.value))
    })
    await loadRuntimeStatus()
    manualCorrectionEnabled.value = false
    toast.success('比赛与 BP 已保存', {
      description: result.runtimeInvalidated
        ? '旧运行快照已按确认作废；比赛与 BP 已重新保存，等待播出控制进入 BP 展示阶段。'
        : t('multi.matchForm.bp.prepared'),
      duration: 3500
    })
  } catch (error: unknown) {
    toast.error(t('common.saveFailed'), {
      description: error instanceof Error ? error.message : String(error),
      duration: 4000
    })
  } finally {
    runtimeBusy.value = false
  }
}

watch(
  () => matchForm.value.type,
  (nextType, previousType) => {
    if (isRestoringMatch || nextType === previousType) return
    bpSequence.value = []
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
  await Promise.all([loadGSITeamResolution(), loadRuntimeStatus()])
  gsiResolutionTimer = window.setInterval(() => {
    void loadGSITeamResolution()
    void loadRuntimeStatus()
  }, 1000)
})

onBeforeUnmount(() => {
  if (gsiResolutionTimer !== null) window.clearInterval(gsiResolutionTimer)
  gsiResolutionTimer = null
})
</script>

<style scoped lang="scss">
.match-page {
  min-height: 100%;
  overflow-y: auto;
  padding-bottom: 3rem;
}

.runtime-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--muted) 22%, transparent);

  span {
    color: var(--muted-foreground);
    font-size: 0.72rem;
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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

.map-image {
  position: absolute;
  inset: 0;
  z-index: 0;
  top: 14px;
  right: auto;
  bottom: auto;
  left: 50%;
  width: 72px;
  height: 72px;
  object-fit: contain;
  filter: drop-shadow(0 5px 12px rgba(0, 0, 0, 0.42));
  transform: translateX(-50%);
}

.map-card-content {
  position: relative;
  z-index: 1;
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
