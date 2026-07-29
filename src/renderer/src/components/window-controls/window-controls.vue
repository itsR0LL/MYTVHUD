<template>
  <div class="window-controls">
    <div class="window-controls-logo">
      <img src="./logo.png" :alt="t('app.logoAlt')" />
      MYTVHUD
    </div>
    <div class="title">{{ $route.path }}</div>
    <div @click="handleOverlay" class="open-overlay">
      <Blend :color="overlayColor" />
      <div class="hover-tips">{{ overlayStatus ? '关闭 Overlay' : '打开 Overlay' }}</div>
    </div>
    <div class="window-controls-button">
      <Minimize2 @click="handleMinimize" style="opacity: 0.6" />
      <X @click="handleClose" style="opacity: 0.6" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.hover-tips {
  position: absolute;
  top: 120%;
  left: 0;
  padding: 0.5rem 0.75rem;
  text-wrap: nowrap;
  font-size: 0.8rem;
  font-weight: 600;
  opacity: 0;
  transition: var(--transition);
  z-index: 2;
  transform: translateX(-15%);
  border-radius: var(--radius);
  background: var(--background-glass);
  pointer-events: none;
}

.window-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-direction: row;
  width: 100%;
  height: var(--header-height);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(25px);
  border-bottom: 1px solid var(--color-zinc-900);
  padding: 0.25rem;
  -webkit-app-region: drag;
  position: fixed;
  z-index: 5;

  .title {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-zinc-400);
    margin-left: 32px;
    padding: 0 12px;
    background: var(--glass);
    border-radius: 4px;
    width: 240px;
    height: 24px;
  }

  .window-controls-logo {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;

    img {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 2rem;
      object-fit: contain;
    }

    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-zinc-400);
  }

  .open-overlay {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    margin-left: auto;
    margin-right: 8px;
    border-radius: var(--radius);
    -webkit-app-region: no-drag;
    cursor: pointer;
    transition: var(--transition);
    position: relative;

    &:hover {
      background: var(--glass);
      transition: var(--transition);

      .hover-tips {
        opacity: 1;
      }
    }
  }

  .window-controls-button {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: row;
    gap: 0.3rem;
    height: 100%;
    padding: 0 5px;
    border-left: 1px solid var(--border-color-weak);
    -webkit-app-region: no-drag;

    .lucide {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 32px;
      width: 32px;
      padding: 4px;
      border-radius: var(--radius);
      transition: var(--transition);
      cursor: pointer;
      position: relative;

      &:hover {
        background: var(--background);
        transition: var(--transition);

        .hover-tips {
          opacity: 1;
        }
      }
    }
  }
}
</style>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Blend } from 'lucide-vue-next'
import { ref, onMounted, computed } from 'vue'
import { X, Minimize2 } from 'lucide-vue-next'

const { t } = useI18n({ useScope: 'global' })
const handleMinimize = () => {
  window.api.minimize()
}

const handleClose = () => {
  window.api.close()
}

const overlayStatus = ref(false)
const handleOverlay = () => {
  if (overlayStatus.value) {
    window.api.closeWindow()
    overlayStatus.value = false
  } else {
    window.api.openWindow()
    overlayStatus.value = true
  }
}

onMounted(async () => {
  const status = await window.api.getOverlayStatus()
  overlayStatus.value = status.isOpen
})

const overlayColor = computed(() => {
  if (overlayStatus.value) {
    return 'var(--chart-1)'
  } else {
    return 'var(--color-primary)'
  }
})
</script>
