<template>
  <div class="container mx-auto max-w-5xl p-4 sm:p-6">
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl sm:text-3xl font-semibold tracking-tight">
          {{ t('multi.matchForm.title') }}
        </h1>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2">
        <div class="space-y-2">
          <div class="text-sm font-medium text-muted-foreground">
            {{ selectedTeamA?.name ?? t('multi.matchForm.teamA') }}
          </div>
          <Select
            v-model="matchForm.team_a.id"
            @update:model-value="
              (val) => (matchForm.team_a.id = val === '__none__' ? '' : String(val))
            "
          >
            <SelectTrigger class="w-full sm:w-[220px]">
              <SelectValue :placeholder="t('multi.matchForm.selectTeamA')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{{ t('common.select') }}</SelectItem>
              <SelectItem v-for="team in availableTeamsForA" :key="team.id" :value="String(team.id)"
                >{{ team.name }}
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
              (val) => (matchForm.team_b.id = val === '__none__' ? '' : String(val))
            "
          >
            <SelectTrigger class="w-full sm:w-[220px]">
              <SelectValue :placeholder="t('multi.matchForm.selectTeamB')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{{ t('common.select') }}</SelectItem>
              <SelectItem v-for="team in availableTeamsForB" :key="team.id" :value="String(team.id)"
                >{{ team.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3">
        <div class="space-y-2">
          <div class="text-sm font-medium text-muted-foreground">
            {{ t('multi.matchForm.type') }}
          </div>
          <Select v-model="matchForm.type">
            <SelectTrigger class="w-full md:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="it in types" :key="it.label" :value="it.label">{{
                it.name
              }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div class="space-y-4">
        <div class="overflow-y-auto">
          <TransitionGroup
            tag="div"
            class="space-y-4"
            enter-active-class="transition duration-200"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-1"
          >
            <div
              v-for="(map, index) in matchForm.maps"
              :key="index"
              class="rounded-lg border bg-card text-card-foreground shadow-sm p-4 md:p-5 transition-colors"
            >
              <div class="flex items-center justify-between mb-3">
                <div class="text-xs font-medium text-muted-foreground">
                  {{
                    t('multi.matchForm.mapNumber', {
                      n: index + 1
                    })
                  }}
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-7 gap-3 md:gap-4">
                <div class="md:col-span-2 space-y-2">
                  <div class="text-xs font-medium text-muted-foreground">
                    {{ t('matchForm.map') }}
                  </div>
                  <Select v-model="map.name">
                    <SelectTrigger class="w-full">
                      <SelectValue :placeholder="t('multi.matchForm.selectMap')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="m in mapOptions" :key="m.label" :value="m.label">{{
                        m.name
                      }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="md:col-span-2 space-y-2">
                  <div class="text-xs font-medium text-muted-foreground">
                    {{ t('matchForm.pickBy') }}
                  </div>
                  <Select
                    v-model="map.pickby"
                    :disabled="map.decider"
                    @update:model-value="
                      (val) => (map.pickby = val === '__none__' ? '' : String(val))
                    "
                  >
                    <SelectTrigger class="w-full">
                      <SelectValue :placeholder="t('multi.matchForm.selectPicker')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{{ t('common.select') }}</SelectItem>
                      <SelectItem v-for="t in teamOptions" :key="t.id" :value="String(t.id)">{{
                        t.name
                      }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div class="md:col-span-1 space-y-2">
                  <div class="text-xs font-medium text-muted-foreground">
                    {{ t('matchForm.team_a.score') }}
                  </div>
                  <Input v-model="map.ascore" type="number" :min="0" class="w-full" />
                </div>
                <div class="md:col-span-1 space-y-2">
                  <div class="text-xs font-medium text-muted-foreground">
                    {{ t('matchForm.team_b.score') }}
                  </div>
                  <Input v-model="map.bscore" type="number" :min="0" class="w-full" />
                </div>
                <div class="md:col-span-1 flex md:items-center md:justify-center">
                  <div class="space-y-2">
                    <div class="text-xs font-medium text-muted-foreground">
                      {{ t('matchForm.decider') }}
                    </div>
                    <Checkbox v-model="map.decider" aria-label="决胜图" />
                  </div>
                </div>
              </div>
            </div>
          </TransitionGroup>
        </div>
      </div>

      <div class="flex items-center justify-end gap-3 pt-2">
        <Button @click="resetForm" variant="outline" type="reset" aria-label="重置">{{
          t('common.reset')
        }}</Button>
        <Button @click="submitForm" type="submit" aria-label="提交">{{
          t('common.submit')
        }}</Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'vue-sonner'

const { t } = useI18n()
const teams = ref<Team[]>([])
const types: { name: Match['type']; label: Match['type'] }[] = [
  { name: 'BO1', label: 'BO1' },
  { name: 'BO3', label: 'BO3' },
  { name: 'BO5', label: 'BO5' }
]
const allowedMatchTypes = new Set<Match['type']>(types.map((item) => item.name))

function normalizeMatchType(value: unknown): Match['type'] {
  return allowedMatchTypes.has(value as Match['type']) ? (value as Match['type']) : 'BO1'
}
const mapOptions = computed(() => [
  { name: t('maps.inferno'), label: 'de_inferno' },
  { name: t('maps.mirage'), label: 'de_mirage' },
  { name: t('maps.dust2'), label: 'de_dust2' },
  { name: t('maps.ancient'), label: 'de_ancient' },
  { name: t('maps.nuke'), label: 'de_nuke' },
  { name: t('maps.overpass'), label: 'de_overpass' },
  { name: t('maps.train'), label: 'de_train' },
  { name: t('maps.vertigo'), label: 'de_vertigo' },
  { name: t('maps.anubis'), label: 'de_anubis' },
  { name: t('maps.cache'), label: 'de_cache' }
])

// 统一队伍 ID 为字符串，并从 A 队选项中排除已选的 B 队
const teamOptions = computed(() => teams.value.map((t) => ({ ...t, id: String(t.id) })))

const availableTeamsForA = computed(() => {
  const currentA = String(matchForm.value.team_a.id ?? '')
  const currentB = String(matchForm.value.team_b.id ?? '')
  return teamOptions.value.filter((team) => team.id === currentA || team.id !== currentB)
})

// 从 B 队选项中排除已选的 A 队
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

async function loadTeams() {
  try {
    const list = await window.db.teams.getAll()
    teams.value = Array.isArray(list) ? (list as Team[]) : (Object.values(list) as Team[])
  } catch (error: any) {
    toast.error(t('common.loadFailed'), {
      description: error?.message ?? t('common.loadFailed'),
      duration: 4000
    })
  }
}
const matchForm = ref<Match>({
  id: '',
  team_a: {
    id: '',
    name: '',
    name_ingame: ''
  },
  team_b: {
    id: '',
    name: '',
    name_ingame: ''
  },
  type: 'BO1',
  maps: [
    {
      name: 'de_inferno',
      pickby: '',
      decider: true,
      ascore: 0,
      bscore: 0,
      aid: '',
      bid: ''
    }
  ]
})

const DEFAULT_MAP = (): PickMap => ({
  name: 'de_inferno',
  pickby: '',
  decider: false,
  ascore: 0,
  bscore: 0,
  aid: '',
  bid: ''
})

function adjustMapsLengthByType() {
  const count = Number(matchForm.value.type.replace('BO', '')) || 1
  const current = matchForm.value.maps.length
  if (current < count) {
    for (let i = current; i < count; i++) {
      matchForm.value.maps.push(DEFAULT_MAP())
    }
  } else if (current > count) {
    matchForm.value.maps.splice(count)
  }
  matchForm.value.maps.forEach((m, idx) => {
    m.decider = idx === count - 1
    if (m.decider) {
      m.pickby = ''
    }
    m.ascore = Math.max(0, Number(m.ascore ?? 0) || 0)
    m.bscore = Math.max(0, Number(m.bscore ?? 0) || 0)
  })
}

watch(
  () => matchForm.value.type,
  () => {
    adjustMapsLengthByType()
  }
)

// 队伍 ID 变化时同步完整资料，并保持 ID 为字符串
watch(
  () => matchForm.value.team_a.id,
  (id) => {
    const picked = teams.value.find((t) => String(t.id) === String(id))
    if (picked) {
      matchForm.value.team_a.name = picked.name ?? ''
      matchForm.value.team_a.name_ingame = picked.name_ingame ?? ''
    } else {
      matchForm.value.team_a.name = ''
      matchForm.value.team_a.name_ingame = ''
    }
  }
)

watch(
  () => matchForm.value.team_b.id,
  (id) => {
    const picked = teams.value.find((t) => String(t.id) === String(id))
    if (picked) {
      matchForm.value.team_b.name = picked.name ?? ''
      matchForm.value.team_b.name_ingame = picked.name_ingame ?? ''
    } else {
      matchForm.value.team_b.name = ''
      matchForm.value.team_b.name_ingame = ''
    }
  }
)

// 自动加载比赛：优先读取 currentMatchId，否则读取最近一条记录
async function autoLoadMatch() {
  try {
    let record: any | undefined
    try {
      const currentId = await window.db.settings.get('currentMatchId')
      if (currentId != null) {
        record = await window.db.matchs.getById(currentId)
      }
    } catch (_) {
      // 设置读取失败时继续尝试加载最近一条比赛记录
    }
    if (!record) {
      const list = await window.db.matchs.getAll()
      const items = Array.isArray(list) ? list : Object.values(list)
      if (items.length === 0) {
        return
      }
      // 按数值 ID 选择最新记录，无法转换时保留原顺序
      const sorted = [...items].sort((a: any, b: any) => {
        const na = Number(a?.id)
        const nb = Number(b?.id)
        if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na
        return 0
      })
      record = sorted[0]
    }
    if (!record) return
    const loaded: Match = {
      id: record.id,
      team_a: {
        id: String(record.team_a?.id ?? matchForm.value.team_a.id ?? ''),
        name: String(record.team_a?.name ?? matchForm.value.team_a.name ?? ''),
        name_ingame: String(
          record.team_a?.name_ingame ?? matchForm.value.team_a.name_ingame ?? ''
        )
      },
      team_b: {
        id: String(record.team_b?.id ?? matchForm.value.team_b.id ?? ''),
        name: String(record.team_b?.name ?? matchForm.value.team_b.name ?? ''),
        name_ingame: String(
          record.team_b?.name_ingame ?? matchForm.value.team_b.name_ingame ?? ''
        )
      },
      type: normalizeMatchType(record.type),
      maps:
        Array.isArray(record.maps) && record.maps.length > 0
          ? record.maps.map((m: any) => ({
              name: (m?.name ?? 'de_inferno') as PickMap['name'],
              pickby: !!m?.decider ? '' : String(m?.pickby ?? ''),
              decider: !!m?.decider,
              ascore: typeof m?.ascore === 'number' ? m.ascore : Number(m?.ascore ?? 0) || 0,
              bscore: typeof m?.bscore === 'number' ? m.bscore : Number(m?.bscore ?? 0) || 0,
              aid: String(m?.aid ?? record.team_a?.id ?? ''),
              bid: String(m?.bid ?? record.team_b?.id ?? '')
            }))
          : [DEFAULT_MAP()]
    }
    matchForm.value = loaded
    // 根据赛制校正地图数量和决胜图标记
    adjustMapsLengthByType()
  } catch (error: any) {
    toast.warning(t('common.loadFailed'), {
      description: error?.message ?? t('common.loadFailed'),
      duration: 3000
    })
  }
}

function resetForm() {
  matchForm.value = {
    id: '',
    team_a: {
      id: '',
      name: '',
      name_ingame: ''
    },
    team_b: {
      id: '',
      name: '',
      name_ingame: ''
    },
    type: 'BO1',
    maps: [
      {
        name: 'de_inferno',
        pickby: '',
        decider: true,
        ascore: 0,
        bscore: 0,
        aid: '',
        bid: ''
      }
    ]
  }
  toast.info(t('common.resetSuccess'), { duration: 2000 })
}

function validateForm(): string | null {
  if (!matchForm.value.team_a?.id || !matchForm.value.team_b?.id) {
    return t('multi.matchForm.pickTeams')
  }
  if (matchForm.value.team_a.id === matchForm.value.team_b.id) {
    return t('multi.matchForm.teamsUnique')
  }
  const count = Number(matchForm.value.type.replace('BO', '')) || 1
  if (matchForm.value.maps.length !== count) {
    return t('multi.matchForm.mapsCountMismatch')
  }
  for (const m of matchForm.value.maps) {
    if (m.decider && m.pickby) {
      return t('multi.matchForm.deciderNoPicker')
    }
    if (m.ascore == null || m.bscore == null) {
      return t('common.invalid')
    }
    if (m.ascore < 0 || m.bscore < 0) {
      return t('common.invalid')
    }
  }
  return null
}

async function submitForm() {
  const err = validateForm()
  if (err) {
    toast.warning(t('common.validateFailed'), { description: err, duration: 4000 })
    return
  }
  // 保存前补全已选战队资料
  {
    const ta = teams.value.find((t) => String(t.id) === String(matchForm.value.team_a.id))
    if (ta) {
      matchForm.value.team_a = {
        ...matchForm.value.team_a,
        name: ta.name ?? '',
        name_ingame: ta.name_ingame ?? ''
      }
    }
    const tb = teams.value.find((t) => String(t.id) === String(matchForm.value.team_b.id))
    if (tb) {
      matchForm.value.team_b = {
        ...matchForm.value.team_b,
        name: tb.name ?? '',
        name_ingame: tb.name_ingame ?? ''
      }
    }
  }
  matchForm.value.maps = matchForm.value.maps.map((m) => ({
    ...m,
    pickby: m.decider ? '' : String(m.pickby ?? ''),
    ascore: Math.max(0, Number(m.ascore ?? 0) || 0),
    bscore: Math.max(0, Number(m.bscore ?? 0) || 0),
    aid: matchForm.value.team_a.id,
    bid: matchForm.value.team_b.id
  }))
  const item = JSON.parse(JSON.stringify(matchForm.value))
  if (item.team_a) delete item.team_a.avatar
  if (item.team_b) delete item.team_b.avatar
  try {
    // 始终保存到同一条比赛记录
    const existingId = await window.db.settings.get('currentMatchId').catch(() => null)
    const targetId = String(item.id || existingId || 'current')
    item.id = targetId

    // 记录存在时更新，不存在时新增
    let didModify = false
    try {
      const existing = await window.db.matchs.getById(targetId)
      if (existing) {
        await window.db.matchs.modify(targetId, item)
        didModify = true
      } else {
        await window.db.matchs.add(item)
      }
    } catch (_) {
      // 查询失败时按新增记录处理
      await window.db.matchs.add(item)
    }

    await window.db.settings.set('currentMatchId', targetId)
    matchForm.value.id = targetId
    toast.success(didModify ? t('common.modifySuccess') : t('common.addSuccess'), {
      duration: 3000
    })
  } catch (error: any) {
    toast.error(t('common.saveFailed'), {
      description: error?.message ?? t('common.saveFailed'),
      duration: 4000
    })
  }
}

onMounted(async () => {
  await loadTeams()
  await autoLoadMatch()
})
</script>

<style scoped>
input[type='number']::-webkit-outer-spin-button,
input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type='number'] {
  -moz-appearance: textfield;
}
</style>
