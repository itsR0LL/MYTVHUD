<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { Slider } from '@/components/ui/slider'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import {
  createDefaultManagerSettings,
  managerSettingsEntries,
  normalizeManagerSettings
} from '../../../shared/manager-settings'

const { t } = useI18n({ useScope: 'global' })

const settings = ref(createDefaultManagerSettings())

const modifierOptions = [
  'None',
  'Ctrl',
  'Alt',
  'Shift',
  'Ctrl+Alt',
  'Ctrl+Shift',
  'Alt+Shift',
  'Ctrl+Alt+Shift'
]
const keyOptions = [
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 10 }, (_, i) => String(i)),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)
]

const selectedModifiers = ref<string>('None')
const selectedKey = ref<string>('I')
const isOpeningDataDirectory = ref(false)
const isExportingData = ref(false)
const isImportingData = ref(false)

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback

const persistSettings = async (): Promise<void> => {
  for (const [key, value] of managerSettingsEntries(settings.value)) {
    await window.db.settings.set(key, value)
  }
}

const parseShortcut = (shortcut: string) => {
  const parts = String(shortcut).split('+')
  const mods = parts.filter((p) => ['Ctrl', 'Alt', 'Shift', 'Meta', 'Command'].includes(p))
  const main = parts.find((p) => !mods.includes(p)) || 'I'
  selectedModifiers.value = mods.length ? mods.join('+') : 'None'
  selectedKey.value = main
}

parseShortcut(settings.value.shortcutKey)

watch([selectedModifiers, selectedKey], ([m, k]) => {
  settings.value.shortcutKey = (m && m !== 'None' ? m + '+' : '') + k
})

watch(
  () => settings.value.shortcutKey,
  (val) => {
    parseShortcut(val)
  }
)
const saveSettings = async () => {
  try {
    await persistSettings()
    toast.success(t('settings.toast.saved'), { duration: 2500 })
  } catch (error: any) {
    toast.error(t('common.saveFailed'), {
      description: error?.message ?? t('common.saveFailed'),
      duration: 3500
    })
  }
}

const resetSettings = async () => {
  try {
    settings.value = createDefaultManagerSettings()
    await persistSettings()
    toast.success(t('common.resetSuccess'), { duration: 2500 })
  } catch (error: any) {
    toast.error(t('common.saveFailed'), {
      description: error?.message ?? t('common.saveFailed'),
      duration: 3500
    })
  }
}

const openDataDirectory = async (): Promise<void> => {
  isOpeningDataDirectory.value = true
  try {
    const result = await window.api.openDataDirectory()
    if (!result.success) throw new Error(result.error || t('settings.data.open.failed'))
  } catch (error: unknown) {
    toast.error(t('settings.data.open.failed'), {
      description: getErrorMessage(error, t('settings.data.open.failed')),
      duration: 4000
    })
  } finally {
    isOpeningDataDirectory.value = false
  }
}

const exportDataPackage = async (): Promise<void> => {
  isExportingData.value = true
  try {
    const result = await window.api.exportDataPackage()
    if (result.canceled) return
    if (!result.success) throw new Error(result.error || t('settings.data.exportPackage.failed'))
    toast.success(t('settings.data.exportPackage.success'), {
      description: t('settings.data.counts', {
        teams: result.teamCount ?? 0,
        players: result.playerCount ?? 0
      }),
      duration: 3500
    })
  } catch (error: unknown) {
    toast.error(t('settings.data.exportPackage.failed'), {
      description: getErrorMessage(error, t('settings.data.exportPackage.failed')),
      duration: 4000
    })
  } finally {
    isExportingData.value = false
  }
}

const importDataPackage = async (): Promise<void> => {
  isImportingData.value = true
  try {
    const result = await window.api.importDataPackage()
    if (result.canceled) return
    if (!result.success) throw new Error(result.error || t('settings.data.importPackage.failed'))
    toast.success(t('settings.data.importPackage.success'), {
      description: t('settings.data.counts', {
        teams: result.teamCount ?? 0,
        players: result.playerCount ?? 0
      }),
      duration: 4000
    })
  } catch (error: unknown) {
    toast.error(t('settings.data.importPackage.failed'), {
      description: getErrorMessage(error, t('settings.data.importPackage.failed')),
      duration: 5000
    })
  } finally {
    isImportingData.value = false
  }
}

onMounted(async () => {
  try {
    const data = await window.db.settings.getAll()
    settings.value = normalizeManagerSettings(data)
    parseShortcut(settings.value.shortcutKey)
  } catch (_) {}
})
</script>

<template>
  <div class="settings-container">
    <Transition name="transform-in" appear>
      <div class="settings-item">
        <div class="setting-item-title">{{ t('settings.manager.title') }}</div>
        <div class="setting-item-container">
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.manager.seriesName_first.label') }}</div>
              <div class="description">{{ t('settings.manager.seriesName_first.desc') }}</div>
            </div>
            <Input
              id="seriesName_first"
              v-model="settings.seriesName_first"
              class="w-60"
              :placeholder="t('settings.manager.seriesName_first.placeholder')"
              type="text"
            />
          </div>
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.manager.seriesName_second.label') }}</div>
              <div class="description">{{ t('settings.manager.seriesName_second.desc') }}</div>
            </div>
            <Input
              id="seriesName_second"
              v-model="settings.seriesName_second"
              class="w-60"
              :placeholder="t('settings.manager.seriesName_second.placeholder')"
              type="text"
            />
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="transform-in" appear>
      <div class="settings-item">
        <div class="setting-item-title">{{ t('settings.overlay.color') }}</div>
        <div class="setting-item-container">
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.overlay.ctColor.label') }}</div>
              <div class="description">{{ t('settings.overlay.ctColor.desc') }}</div>
            </div>
            <ColorPicker
              id="ctColor"
              :value="('#' + settings.ctColor) as `#${string}`"
              @value-change="(val) => (settings.ctColor = String(val?.hex ?? '').replace('#', ''))"
            >
              <div
                class="color-swatch cursor-pointer"
                :style="{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  backgroundColor: '#' + settings.ctColor
                }"
              />
            </ColorPicker>
          </div>
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.overlay.tColor.label') }}</div>
              <div class="description">{{ t('settings.overlay.tColor.desc') }}</div>
            </div>
            <ColorPicker
              id="tColor"
              :value="('#' + settings.tColor) as `#${string}`"
              @value-change="(val) => (settings.tColor = String(val?.hex ?? '').replace('#', ''))"
            >
              <div
                class="color-swatch cursor-pointer"
                :style="{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  backgroundColor: '#' + settings.tColor
                }"
              />
            </ColorPicker>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="transform-in" appear>
      <div class="settings-item">
        <div class="setting-item-title">{{ t('settings.overlay.title') }}</div>
        <div class="setting-item-container">
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.overlay.focusedPlayer.label') }}</div>
              <div class="description">{{ t('settings.overlay.focusedPlayer.desc') }}</div>
            </div>
            <Switch id="overlayFocusedPlayer" v-model="settings.overlayFocusedPlayer" />
          </div>
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.overlay.sidebars.label') }}</div>
              <div class="description">{{ t('settings.overlay.sidebars.desc') }}</div>
            </div>
            <Select v-model="settings.overlaySidebars">
              <SelectTrigger class="w-[150px]">
                <SelectValue :placeholder="t('settings.overlay.sidebars.label')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="row">{{ t('settings.overlay.row') }}</SelectItem>
                <SelectItem value="column">{{ t('settings.overlay.column') }}</SelectItem>
                <SelectItem value="undefined">{{ t('settings.overlay.disabled') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.overlay.topbar.label') }}</div>
              <div class="description">{{ t('settings.overlay.topbar.desc') }}</div>
            </div>
            <Switch id="overlayTopbar" v-model="settings.overlayTopbar" />
          </div>
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.overlay.radar.label') }}</div>
              <div class="description">{{ t('settings.overlay.radar.desc') }}</div>
            </div>
            <Switch id="overlayRadar" v-model="settings.overlayRadar" />
          </div>
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">
                {{ t('settings.overlay.borderRadius.label') }}
                <div
                  class="border-radius-sims"
                  :style="{ borderRadius: settings.borderRadius + 'px' }"
                >
                  {{ settings.borderRadius }}
                </div>
              </div>
              <div class="description">{{ t('settings.overlay.borderRadius.desc') }}</div>
            </div>
            <Slider
              id="borderRadius"
              class="w-60"
              :model-value="[Number(settings.borderRadius)]"
              :min="0"
              :max="20"
              :step="1"
              @update:model-value="(val) => (settings.borderRadius = String(val?.[0] ?? 0))"
            />
          </div>
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.other.shortcutKey.label') }}</div>
              <div class="description">{{ t('settings.other.shortcutKey.desc') }}</div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center">
              <Select v-model="selectedModifiers">
                <SelectTrigger class="w-[150px]">
                  <SelectValue :placeholder="t('settings.other.shortcutKey.modifiers')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in modifierOptions" :key="m" :value="m">{{
                    m === 'None' ? '无' : m
                  }}</SelectItem>
                </SelectContent>
              </Select>
              <Select v-model="selectedKey">
                <SelectTrigger class="w-[150px]">
                  <SelectValue :placeholder="t('settings.other.shortcutKey.key')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="k in keyOptions" :key="k" :value="k">{{ k }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="transform-in" appear>
      <div class="settings-item">
        <div class="setting-item-title">{{ t('settings.data.title') }}</div>
        <div class="setting-item-container">
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.data.open.label') }}</div>
              <div class="description">{{ t('settings.data.open.desc') }}</div>
            </div>
            <Button
              class="w-30"
              variant="secondary"
              :disabled="isOpeningDataDirectory"
              @click="openDataDirectory"
            >
              {{ t('settings.data.open.action') }}
            </Button>
          </div>
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.data.exportPackage.label') }}</div>
              <div class="description">{{ t('settings.data.exportPackage.desc') }}</div>
            </div>
            <Button
              class="w-30"
              variant="secondary"
              :disabled="isExportingData || isImportingData"
              @click="exportDataPackage"
            >
              {{
                isExportingData
                  ? t('settings.data.exportPackage.running')
                  : t('settings.data.exportPackage.action')
              }}
            </Button>
          </div>
          <div class="setting-item">
            <div class="setting-item-label">
              <div class="title">{{ t('settings.data.importPackage.label') }}</div>
              <div class="description">{{ t('settings.data.importPackage.desc') }}</div>
            </div>
            <Button
              class="w-30"
              variant="secondary"
              :disabled="isImportingData || isExportingData"
              @click="importDataPackage"
            >
              {{
                isImportingData
                  ? t('settings.data.importPackage.running')
                  : t('settings.data.importPackage.action')
              }}
            </Button>
          </div>
        </div>
      </div>
    </Transition>
    <div class="button-container">
      <Button class="w-30" variant="secondary" @click="resetSettings">{{
        t('common.reset')
      }}</Button>
      <Button class="w-50" variant="default" @click="saveSettings">{{ t('common.save') }}</Button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  height: 100%;
  gap: 1rem;
  padding: 1rem;

  .button-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    min-height: 50px;
    margin-bottom: auto;
    width: 100%;
  }

  .settings-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    width: 100%;

    .setting-item-title {
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--color-zinc-500);
      padding-left: 0.2rem;
      margin-bottom: 0.5rem;
    }

    .setting-item-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      width: 100%;
      background: var(--color-zinc-900);
      padding: 1rem;
      border-radius: var(--radius);

      .setting-item {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        position: relative;
        margin-bottom: 0.5rem;

        &:last-child {
          margin-bottom: 0;

          &::after {
            display: none;
          }
        }

        &::after {
          content: '';
          position: absolute;
          bottom: -10px;
          left: 50%;
          transform: translateX(-50%);
          width: 98%;
          height: 1px;
          background: rgba(255, 255, 255, 0.05);
        }

        .setting-item-label {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-start;
          width: 100%;
          height: 100%;

          .title {
            display: flex;
            flex-direction: row;
            align-items: center;
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--color-zinc-300);
            padding-left: 0.2rem;
            margin-bottom: 0.2rem;
            position: relative;

            .border-radius-sims {
              position: absolute;
              left: 125%;
              text-align: center;
              background: var(--color-zinc-800);
              padding: 0.4rem 2rem;
              transition: var(--transition);
            }
          }

          .description {
            font-size: 0.8rem;
            font-weight: 400;
            color: var(--color-zinc-400);
            padding-left: 0.2rem;
          }
        }
      }
    }
  }
}
</style>
