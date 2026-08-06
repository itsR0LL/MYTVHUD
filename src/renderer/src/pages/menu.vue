<template>
  <main class="menu-page app-scrollbar-hidden">
    <div class="tutorial-shell">
      <header class="tutorial-header">
        <div class="title-block">
          <span class="title-icon" aria-hidden="true"><BookOpenCheck /></span>
          <div>
            <h1>{{ t('menu.title') }}</h1>
            <p>{{ t('menu.subtitle') }}</p>
          </div>
        </div>

        <div class="unified-output" role="note">
          <RadioTower aria-hidden="true" />
          <div>
            <strong>{{ t('menu.output.title') }}</strong>
            <p>{{ t('menu.output.desc') }}</p>
            <code>http://localhost:5031/intermission-next</code>
          </div>
        </div>
      </header>

      <section class="tutorial-grid" :aria-label="t('menu.stepsLabel')">
        <article v-for="step in tutorialSteps" :key="step.id" class="tutorial-card">
          <header class="card-header">
            <span class="step-number">{{ step.number }}</span>
            <span class="step-icon" aria-hidden="true">
              <component :is="step.icon" />
            </span>
            <div>
              <h2>{{ t(step.titleKey) }}</h2>
              <p>{{ t(step.summaryKey) }}</p>
            </div>
          </header>

          <ul class="step-list">
            <li v-for="itemKey in step.itemKeys" :key="itemKey">
              <span>{{ t(itemKey) }}</span>
            </li>
          </ul>

          <div v-if="step.codes?.length" class="code-list">
            <div v-for="entry in step.codes" :key="entry.value" class="code-row">
              <span>{{ t(entry.labelKey) }}</span>
              <code>{{ entry.value }}</code>
            </div>
          </div>

          <div v-if="step.noteKey" class="step-note">
            <Info aria-hidden="true" />
            <span>{{ t(step.noteKey) }}</span>
          </div>

          <footer v-if="step.actions.length" class="card-actions">
            <Button
              v-for="action in step.actions"
              :key="action.labelKey"
              :variant="action.variant"
              :disabled="action.type === 'gsi' && gsiBusy"
              @click="handleAction(action)"
            >
              <LoaderCircle
                v-if="action.type === 'gsi' && gsiBusy"
                class="animate-spin"
                aria-hidden="true"
              />
              <component :is="action.icon" v-else aria-hidden="true" />
              {{ t(action.labelKey) }}
            </Button>
          </footer>
        </article>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  BookOpenCheck,
  Database,
  Gamepad2,
  Info,
  LoaderCircle,
  MonitorUp,
  RadioTower,
  Route,
  Settings2,
  ShieldCheck,
  Swords,
  TestTube2,
  Trophy,
  Users
} from 'lucide-vue-next'

type TutorialAction =
  | {
      type: 'gsi'
      labelKey: string
      icon: Component
      variant: 'default' | 'outline'
    }
  | {
      type: 'route'
      route: string
      labelKey: string
      icon: Component
      variant: 'default' | 'outline'
    }

interface TutorialStep {
  id: string
  number: string
  icon: Component
  titleKey: string
  summaryKey: string
  itemKeys: string[]
  noteKey?: string
  codes?: Array<{ labelKey: string; value: string }>
  actions: TutorialAction[]
}

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const gsiBusy = ref(false)

const tutorialSteps: TutorialStep[] = [
  {
    id: 'gsi',
    number: '01',
    icon: Settings2,
    titleKey: 'menu.step1.title',
    summaryKey: 'menu.step1.summary',
    itemKeys: ['menu.step1.item1', 'menu.step1.item2'],
    noteKey: 'menu.step1.note',
    actions: [
      {
        type: 'gsi',
        labelKey: 'menu.step1.action',
        icon: Settings2,
        variant: 'default'
      }
    ]
  },
  {
    id: 'registration',
    number: '02',
    icon: Users,
    titleKey: 'menu.step2.title',
    summaryKey: 'menu.step2.summary',
    itemKeys: ['menu.step2.item1', 'menu.step2.item2', 'menu.step2.item3'],
    noteKey: 'menu.step2.note',
    actions: [
      {
        type: 'route',
        route: '/teams',
        labelKey: 'menu.step2.teamAction',
        icon: ShieldCheck,
        variant: 'default'
      },
      {
        type: 'route',
        route: '/players',
        labelKey: 'menu.step2.playerAction',
        icon: Users,
        variant: 'outline'
      }
    ]
  },
  {
    id: 'match',
    number: '03',
    icon: Swords,
    titleKey: 'menu.step3.title',
    summaryKey: 'menu.step3.summary',
    itemKeys: ['menu.step3.item1', 'menu.step3.item2', 'menu.step3.item3'],
    noteKey: 'menu.step3.note',
    actions: [
      {
        type: 'route',
        route: '/matchs',
        labelKey: 'menu.step3.action',
        icon: Trophy,
        variant: 'default'
      }
    ]
  },
  {
    id: 'obs',
    number: '04',
    icon: MonitorUp,
    titleKey: 'menu.step4.title',
    summaryKey: 'menu.step4.summary',
    itemKeys: ['menu.step4.item1', 'menu.step4.item2', 'menu.step4.item3', 'menu.step4.item4'],
    noteKey: 'menu.step4.note',
    codes: [
      { labelKey: 'menu.step4.gameUrl', value: 'http://localhost:5031/overlay' },
      {
        labelKey: 'menu.step4.broadcastUrl',
        value: 'http://localhost:5031/intermission-next'
      },
      {
        labelKey: 'menu.step4.consoleCommand',
        value: 'cl_draw_only_deathnotices 1; cl_drawhud_force_deathnotices -1'
      }
    ],
    actions: []
  },
  {
    id: 'layout',
    number: '05',
    icon: Route,
    titleKey: 'menu.step5.title',
    summaryKey: 'menu.step5.summary',
    itemKeys: ['menu.step5.item1', 'menu.step5.item2', 'menu.step5.item3'],
    noteKey: 'menu.step5.note',
    actions: [
      {
        type: 'route',
        route: '/intermission',
        labelKey: 'menu.step5.action',
        icon: RadioTower,
        variant: 'default'
      }
    ]
  },
  {
    id: 'broadcast',
    number: '06',
    icon: RadioTower,
    titleKey: 'menu.step6.title',
    summaryKey: 'menu.step6.summary',
    itemKeys: ['menu.step6.item1', 'menu.step6.item2', 'menu.step6.item3', 'menu.step6.item4'],
    noteKey: 'menu.step6.note',
    actions: [
      {
        type: 'route',
        route: '/intermission',
        labelKey: 'menu.step6.action',
        icon: Gamepad2,
        variant: 'default'
      }
    ]
  },
  {
    id: 'maintenance',
    number: '07',
    icon: TestTube2,
    titleKey: 'menu.step7.title',
    summaryKey: 'menu.step7.summary',
    itemKeys: ['menu.step7.item1', 'menu.step7.item2', 'menu.step7.item3'],
    noteKey: 'menu.step7.note',
    actions: [
      {
        type: 'route',
        route: '/settings',
        labelKey: 'menu.step7.settingsAction',
        icon: Database,
        variant: 'default'
      },
      {
        type: 'route',
        route: '/matchs',
        labelKey: 'menu.step7.matchAction',
        icon: Trophy,
        variant: 'outline'
      }
    ]
  }
]

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function autoPlaceGSI(): Promise<void> {
  if (gsiBusy.value) return
  gsiBusy.value = true
  try {
    const res = await window.api.autoPlaceGSI()
    if (res?.success) {
      toast.success(t('menu.toast.gsiSuccess'), { description: res.message })
    } else {
      toast.warning(t('menu.toast.gsiIncomplete'), {
        description: res?.message ?? t('menu.toast.gsiCancelled')
      })
    }
  } catch (error: unknown) {
    toast.error(t('menu.toast.gsiFailed'), { description: getErrorMessage(error) })
  } finally {
    gsiBusy.value = false
  }
}

function handleAction(action: TutorialAction): void {
  if (action.type === 'gsi') {
    void autoPlaceGSI()
    return
  }
  void router.push(action.route)
}
</script>

<style scoped lang="scss">
.menu-page {
  width: 100%;
  height: calc(100vh - var(--header-height));
  overflow-y: auto;
  color: var(--foreground);
}

.tutorial-shell {
  width: min(100%, 1180px);
  margin: 0 auto;
  padding: 1.25rem 1.5rem 2rem;
}

.tutorial-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(20rem, 0.72fr);
  align-items: stretch;
  gap: 1rem;
  margin-bottom: 1rem;
}

.title-block,
.unified-output {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 4px);
  background: var(--card);
}

.title-block {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.2rem 1.3rem;
}

.title-icon,
.step-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--primary) 74%, white);
  background: color-mix(in srgb, var(--primary) 14%, var(--card));
}

.title-icon {
  width: 3.2rem;
  height: 3.2rem;
  border: 1px solid color-mix(in srgb, var(--primary) 38%, var(--border));
  border-radius: 0.8rem;
}

.title-icon svg {
  width: 1.45rem;
  height: 1.45rem;
}

.title-block h1 {
  font-size: clamp(1.25rem, 2vw, 1.7rem);
  font-weight: 750;
  letter-spacing: -0.02em;
}

.title-block p,
.unified-output p,
.card-header p {
  color: var(--muted-foreground);
  line-height: 1.55;
}

.title-block p {
  margin-top: 0.35rem;
  font-size: 0.82rem;
}

.unified-output {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.1rem;
  border-color: var(--border);
  background: var(--card);
}

.unified-output > svg {
  width: 1.15rem;
  height: 1.15rem;
  margin-top: 0.15rem;
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--primary) 74%, white);
}

.unified-output strong {
  font-size: 0.88rem;
}

.unified-output p {
  margin-top: 0.25rem;
  font-size: 0.75rem;
}

.unified-output code,
.code-row code {
  display: block;
  overflow-wrap: anywhere;
  font-family: 'Consolas', monospace;
  color: var(--foreground);
  background: color-mix(in srgb, var(--muted) 72%, transparent);
}

.unified-output code {
  margin-top: 0.55rem;
  padding: 0.45rem 0.6rem;
  border-radius: var(--radius);
  font-size: 0.72rem;
}

.tutorial-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.tutorial-card {
  display: flex;
  min-width: 0;
  min-height: 22rem;
  flex-direction: column;
  gap: 1rem;
  padding: 1.15rem;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 4px);
  background: var(--card);
  transition:
    border-color 180ms ease,
    background-color 180ms ease;
}

.tutorial-card:hover {
  border-color: color-mix(in srgb, var(--primary) 46%, var(--border));
  background: color-mix(in srgb, var(--primary) 2.5%, var(--card));
}

.card-header {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: start;
  gap: 0.75rem;
}

.step-number {
  min-width: 2rem;
  padding-top: 0.32rem;
  color: color-mix(in srgb, var(--primary) 72%, white);
  font-family: 'Consolas', monospace;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.step-icon {
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 0.65rem;
}

.step-icon svg {
  width: 1.1rem;
  height: 1.1rem;
}

.card-header h2 {
  font-size: 0.96rem;
  font-weight: 720;
}

.card-header p {
  margin-top: 0.28rem;
  font-size: 0.75rem;
}

.step-list {
  display: grid;
  gap: 0.62rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-list li {
  display: block;
  color: color-mix(in srgb, var(--foreground) 90%, var(--muted-foreground));
  font-size: 0.78rem;
  line-height: 1.55;
}

.code-list {
  display: grid;
  gap: 0.5rem;
}

.code-row {
  display: grid;
  grid-template-columns: 6.5rem minmax(0, 1fr);
  align-items: center;
  gap: 0.55rem;
  font-size: 0.72rem;
}

.code-row > span {
  color: var(--muted-foreground);
}

.code-row code {
  padding: 0.42rem 0.55rem;
  border-radius: var(--radius);
  font-size: 0.7rem;
}

.step-note {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted-foreground);
  background: color-mix(in srgb, var(--muted) 48%, transparent);
  font-size: 0.72rem;
  line-height: 1.5;
}

.step-note svg {
  width: 0.9rem;
  height: 0.9rem;
  margin-top: 0.18rem;
  color: color-mix(in srgb, var(--primary) 74%, white);
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: auto;
  padding-top: 0.15rem;
}

.card-actions :deep(button) {
  min-height: 2.5rem;
}

@media (max-width: 1050px) {
  .tutorial-header,
  .tutorial-grid {
    grid-template-columns: 1fr;
  }

  .tutorial-card {
    min-height: 0;
  }
}

@media (max-width: 640px) {
  .tutorial-shell {
    padding: 1rem 0.85rem 1.5rem;
  }

  .title-block {
    align-items: flex-start;
  }

  .card-header {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .card-header > div {
    grid-column: 1 / -1;
  }

  .code-row {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tutorial-card {
    transition: none;
  }
}
</style>
