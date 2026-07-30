<template>
  <SidebarProvider class="relative">
    <Sidebar
      side="left"
      collapsible="icon"
      variant="floating"
      class="border-r border-border"
      :style="{ top: 'var(--header-height)', height: 'calc(100vh - var(--header-height))' }"
    >
      <SidebarHeader class="w-full"></SidebarHeader>
      <SidebarContent class="w-full">
        <SidebarMenu>
          <SidebarMenuItem
            v-for="item in indicatorItems"
            :key="item.path"
            class="w-auto group-data-[state=expanded]:w-full"
          >
            <SidebarMenuButton
              class="w-full justify-center font-medium group-data-[state=expanded]:justify-start cursor-pointer"
              :data-active="item.path === selectedItem"
              :tooltip="t(item.label)"
              size="lg"
              @click="navigate(item.path)"
            >
              <component :is="item.icon" />
              <span class="group-data-[collapsible=icon]:hidden">{{ t(item.label) }}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>

    <SidebarInset class="pt-(--header-height) h-full w-full">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </SidebarInset>
  </SidebarProvider>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'

import { useI18n } from 'vue-i18n'
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarInset
} from '@/components/ui/sidebar'
import { Home, Trophy, Users, Settings, Map as MapIcon, TvMinimalPlay } from 'lucide-vue-next'

const { t } = useI18n({ useScope: 'global' })

const indicatorItems = ref([
  { label: 'indicator.menu', path: '/', icon: Home },
  { label: 'indicator.matchs', path: '/matchs', icon: Trophy },
  { label: 'indicator.bp', path: '/bp', icon: MapIcon },
  { label: 'indicator.intermission', path: '/intermission', icon: TvMinimalPlay },
  { label: 'indicator.players', path: '/players', icon: Users },
  { label: 'indicator.teams', path: '/teams', icon: Users },
  { label: 'indicator.settings', path: '/settings', icon: Settings }
])
const router = useRouter()
const route = useRoute()

const selectedItem = ref(route.path)

watch(
  () => route.path,
  (newPath) => {
    selectedItem.value = newPath
  }
)

const navigate = (path: string) => {
  if (path && path !== route.path) {
    router.push(path)
  }
}

// 页面仅负责导航
</script>

<style scoped lang="scss">
.sidebar-indicator-label {
  font-size: 0.9rem;
}
</style>
