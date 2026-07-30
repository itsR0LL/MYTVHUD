<template>
  <div class="bp-page container mx-auto max-w-6xl p-4 sm:p-6">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-2">
          <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">{{ t('bp.title') }}</h1>
          <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{{ t('bp.outputUrl') }}</span>
            <code class="rounded-md border bg-background px-2 py-1">{{ BP_OUTPUT_URL }}</code>
            <Button
              variant="outline"
              size="icon"
              :aria-label="t('bp.copyUrl')"
              @click="copyOutputUrl"
            >
              <Copy :size="16" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              :aria-label="t('bp.openOutput')"
              @click="openOutput"
            >
              <ExternalLink :size="16" />
            </Button>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-3">
          <label class="flex min-h-9 items-center gap-2 rounded-md border px-3">
            <span class="text-sm font-medium">{{ t('bp.animation') }}</span>
            <Switch v-model="state.animationEnabled" :aria-label="t('bp.animation')" />
            <span class="text-xs text-muted-foreground">
              {{ state.animationEnabled ? t('common.enabled') : t('common.disabled') }}
            </span>
          </label>
          <Button :disabled="isLoading || isOutputBusy" @click="showOutput">
            <Play :size="16" />
            {{ t('bp.startDisplay') }}
          </Button>
          <Button
            variant="destructive"
            :disabled="isLoading || isOutputBusy || !state.visible"
            @click="hideOutput"
          >
            <EyeOff :size="16" />
            {{ t('bp.hide') }}
          </Button>
          <div class="min-w-12 text-right text-sm font-semibold tabular-nums">
            {{ state.sequence.length }} / 7
          </div>
        </div>
      </div>

      <div class="match-bar" :class="{ 'is-missing': !match }">
        <div class="team-side">
          <div class="team-logo-slot" :class="{ 'is-empty': !match?.team_a.avatar }">
            <img v-if="match?.team_a.avatar" :src="match.team_a.avatar" alt="" />
          </div>
          <span class="team-name">{{ teamDisplayName(match?.team_a, t('bp.teamA')) }}</span>
        </div>
        <div class="versus">
          <span v-if="match" class="series-type">{{ match.type }}</span>
          <span>VS</span>
        </div>
        <div class="team-side right">
          <span class="team-name">{{ teamDisplayName(match?.team_b, t('bp.teamB')) }}</span>
          <div class="team-logo-slot" :class="{ 'is-empty': !match?.team_b.avatar }">
            <img v-if="match?.team_b.avatar" :src="match.team_b.avatar" alt="" />
          </div>
        </div>
      </div>

      <div
        v-if="!match && !isLoading"
        class="rounded-lg border border-destructive/50 bg-destructive/10 p-4"
      >
        <div class="font-medium">{{ t('bp.noMatch.title') }}</div>
        <div class="mt-1 text-sm text-muted-foreground">{{ t('bp.noMatch.desc') }}</div>
        <Button class="mt-3" variant="outline" @click="router.push('/matchs')">
          {{ t('bp.noMatch.action') }}
        </Button>
      </div>

      <section class="space-y-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <LockKeyhole :size="17" class="text-muted-foreground" />
              <h2 class="text-lg font-semibold">{{ t('bp.readOnly.title') }}</h2>
            </div>
            <p class="mt-1 text-sm text-muted-foreground">{{ t('bp.readOnly.desc') }}</p>
          </div>
          <Button variant="outline" @click="router.push('/matchs')">
            <PencilLine :size="16" />
            {{ t('bp.readOnly.editInMatch') }}
          </Button>
        </div>

        <div v-if="!state.sequence.length" class="sequence-empty">
          <div class="space-y-2 text-center">
            <div class="font-medium text-foreground">{{ t('bp.readOnly.emptyTitle') }}</div>
            <div class="text-sm">{{ t('bp.readOnly.emptyDesc') }}</div>
          </div>
        </div>

        <div v-else class="sequence-grid" aria-live="polite">
          <article
            v-for="(item, index) in state.sequence"
            :key="item.map"
            class="preview-card"
            :data-action="item.action"
          >
            <header class="preview-header">
              <span class="sequence-index">{{ index + 1 }}</span>
              <span class="action-badge" :data-action="item.action">
                {{ actionName(item.action) }}
              </span>
            </header>
            <div class="preview-art">
              <img
                v-if="mapRecord(item.map)?.wideImage"
                class="preview-map-background"
                :src="mapRecord(item.map)?.wideImage"
                :alt="mapDisplayName(item.map)"
                width="1920"
                height="1080"
                loading="lazy"
                decoding="async"
              />
              <img
                v-if="mapRecord(item.map)?.image"
                class="preview-map-icon"
                :src="mapRecord(item.map)?.image"
                alt=""
                aria-hidden="true"
                width="512"
                height="512"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div class="preview-content">
              <div class="preview-map-name">{{ mapDisplayName(item.map) }}</div>
              <div class="preview-result">{{ resultText(item) }}</div>
              <div v-if="item.action === 'pick'" class="preview-side">
                {{ sideResultText(item) }}
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Copy, ExternalLink, EyeOff, LockKeyhole, PencilLine, Play } from 'lucide-vue-next'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  BP_MAPS,
  BP_SERIES_ACTION_ORDER,
  BP_SERIES_RULES,
  createDefaultBPState,
  type BPAction,
  type BPMapId,
  type BPMatch,
  type BPSequenceItem,
  type BPTeam,
  type BPTeamSlot
} from '../../../shared/bp'

const BP_OUTPUT_URL = 'http://localhost:5031/bp'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const state = ref(createDefaultBPState())
const match = ref<BPMatch | null>(null)
const isLoading = ref(true)
const isOutputBusy = ref(false)

let hasLoaded = false
let saveTimer: number | null = null
let saveQueue: Promise<void> = Promise.resolve()

function teamDisplayName(team: BPTeam | undefined, fallback: string): string {
  if (!team) return fallback
  return team.name || team.name_ingame || fallback
}

function mapRecord(mapId: BPMapId): (typeof BP_MAPS)[number] | undefined {
  return BP_MAPS.find((map) => map.id === mapId)
}

function mapDisplayName(mapId: BPMapId): string {
  return mapRecord(mapId)?.displayName ?? mapId
}

function actionName(action: BPAction): string {
  return t(`bp.action.${action}`)
}

function actorTeam(item: BPSequenceItem): BPTeam | undefined {
  if (!match.value || !item.actor) return undefined
  return match.value[item.actor]
}

function oppositeTeamSlot(actor: BPTeamSlot): BPTeamSlot {
  return actor === 'team_a' ? 'team_b' : 'team_a'
}

function resultText(item: BPSequenceItem): string {
  if (item.action === 'decider') return t('bp.readOnly.deciderResult')
  const fallback = item.actor === 'team_b' ? t('bp.teamB') : t('bp.teamA')
  return t(`bp.readOnly.${item.action}Result`, {
    team: teamDisplayName(actorTeam(item), fallback)
  })
}

function sideResultText(item: BPSequenceItem): string {
  if (!match.value || !item.actor || !item.startingSide) return t('bp.readOnly.sidePending')
  const opponent = match.value[oppositeTeamSlot(item.actor)]
  return t('bp.readOnly.sideResult', {
    team: teamDisplayName(opponent, t('bp.teamB')),
    side: item.startingSide
  })
}

function scheduleSave(): void {
  if (!hasLoaded) return
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    void persistState()
  }, 180)
}

function persistState(): Promise<void> {
  if (!hasLoaded) return Promise.resolve()
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }

  const snapshot = JSON.parse(JSON.stringify(state.value))
  saveQueue = saveQueue.then(async () => {
    try {
      const payload = await window.api.setBPState(snapshot)
      match.value = payload.match
    } catch (error: unknown) {
      toast.error(t('bp.toast.saveFailed'), {
        description: error instanceof Error ? error.message : String(error),
        duration: 4000
      })
    }
  })
  return saveQueue
}

async function loadBP(): Promise<void> {
  isLoading.value = true
  try {
    const payload = await window.api.getBPState()
    hasLoaded = false
    state.value = payload.state
    match.value = payload.match
    hasLoaded = true
  } catch (error: unknown) {
    toast.error(t('bp.toast.loadFailed'), {
      description: error instanceof Error ? error.message : String(error),
      duration: 4000
    })
  } finally {
    isLoading.value = false
  }
}

function validateForOutput(): string | null {
  if (!match.value) return t('bp.validation.noMatch')
  if (state.value.sequence.length !== 7) return t('bp.validation.stepCount')

  const rule = BP_SERIES_RULES[match.value.type]
  const actionOrder = BP_SERIES_ACTION_ORDER[match.value.type]
  const banCount = state.value.sequence.filter((item) => item.action === 'ban').length
  const pickCount = state.value.sequence.filter((item) => item.action === 'pick').length
  if (banCount !== rule.ban) return t('multi.matchForm.bp.banCount', { count: rule.ban })
  if (pickCount !== rule.pick) return t('multi.matchForm.bp.pickCount', { count: rule.pick })

  for (let index = 0; index < state.value.sequence.length; index += 1) {
    const item = state.value.sequence[index]
    const requiredAction = actionOrder[index]
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

async function showOutput(): Promise<void> {
  if (isOutputBusy.value) return
  const error = validateForOutput()
  if (error) {
    toast.warning(t('bp.toast.incomplete'), { description: error, duration: 4000 })
    return
  }
  isOutputBusy.value = true
  try {
    state.value.visible = true
    state.value.revision += 1
    await persistState()
  } finally {
    isOutputBusy.value = false
  }
}

async function hideOutput(): Promise<void> {
  if (isOutputBusy.value || !state.value.visible) return
  isOutputBusy.value = true
  try {
    state.value.visible = false
    await persistState()
  } finally {
    isOutputBusy.value = false
  }
}

async function copyOutputUrl(): Promise<void> {
  try {
    await navigator.clipboard.writeText(BP_OUTPUT_URL)
    toast.success(t('bp.toast.urlCopied'), { duration: 2000 })
  } catch (error: unknown) {
    toast.error(t('bp.toast.copyFailed'), {
      description: error instanceof Error ? error.message : String(error),
      duration: 3000
    })
  }
}

function openOutput(): void {
  window.open(BP_OUTPUT_URL, '_blank')
}

watch(state, scheduleSave, { deep: true })

onMounted(() => {
  if (!hasLoaded) void loadBP()
})

onActivated(() => {
  if (hasLoaded) void loadBP()
})

onDeactivated(() => {
  void persistState()
})

onUnmounted(() => {
  if (saveTimer !== null) window.clearTimeout(saveTimer)
})
</script>

<style scoped lang="scss">
.bp-page {
  min-height: 100%;
  overflow-y: auto;
  padding-bottom: 3rem;
}

.match-bar {
  display: grid;
  min-height: 76px;
  overflow: hidden;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--background);

  &.is-missing {
    opacity: 0.55;
  }
}

.team-side {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1.5rem;

  &.right {
    justify-content: flex-end;
    text-align: right;
  }
}

.team-logo-slot {
  width: 42px;
  height: 42px;
  overflow: hidden;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--muted);

  &.is-empty {
    opacity: 0.35;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.team-name {
  min-width: 0;
  overflow: hidden;
  font-size: 1.15rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.versus {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 700;
}

.series-type {
  color: var(--foreground);
  font-size: 0.65rem;
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
}

.sequence-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.65rem;
}

.preview-card {
  --preview-accent: var(--primary);
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-top: 3px solid var(--preview-accent);
  border-radius: var(--radius);
  background: var(--card);

  &[data-action='pick'] {
    --preview-accent: #16a34a;
  }

  &[data-action='decider'] {
    --preview-accent: #38bdf8;
  }
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.55rem;
  border-bottom: 1px solid var(--border);
}

.sequence-index {
  display: inline-flex;
  width: 23px;
  height: 23px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--primary-foreground);
  background: var(--primary);
  font-size: 0.72rem;
  font-weight: 800;
}

.action-badge {
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
  color: #ffffff;
  background: var(--primary);
  font-size: 0.65rem;
  font-weight: 700;

  &[data-action='pick'] {
    background: #15803d;
  }

  &[data-action='decider'] {
    color: #082f49;
    background: #38bdf8;
  }
}

.preview-art {
  position: relative;
  display: flex;
  height: 96px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: color-mix(in srgb, var(--preview-accent) 35%, transparent);
  background:
    radial-gradient(
      circle at 70% 25%,
      color-mix(in srgb, var(--preview-accent) 20%, transparent),
      transparent 45%
    ),
    var(--muted);
  font-size: 1.35rem;
  font-weight: 900;
  text-transform: uppercase;

  .preview-map-background {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview-map-icon {
    position: relative;
    z-index: 1;
    width: 48px;
    height: 48px;
    object-fit: contain;
    filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.75));
  }

  &::after {
    position: absolute;
    inset: 0;
    background: linear-gradient(rgba(9, 9, 11, 0.08), rgba(9, 9, 11, 0.58));
    content: '';
  }
}

.preview-content {
  display: flex;
  min-height: 116px;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.65rem;
}

.preview-map-name {
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1.25;
}

.preview-result,
.preview-side {
  color: var(--muted-foreground);
  font-size: 0.68rem;
  line-height: 1.4;
}

.preview-side {
  margin-top: auto;
  color: var(--foreground);
}

@media (max-width: 1180px) {
  .sequence-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .team-side {
    padding: 0 0.75rem;
  }

  .team-logo-slot {
    display: none;
  }

  .sequence-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
