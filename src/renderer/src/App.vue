<script setup lang="ts">
import WindowControls from './components/window-controls/window-controls.vue'
import Pages from './pages.vue'
import { Toaster } from '@/components/ui/sonner'
import 'vue-sonner/style.css'
</script>

<template>
  <Toaster position="top-center" />
  <div class="VHApp">
    <WindowControls />
    <Pages />
  </div>
</template>

<style lang="scss">
.VHApp {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-direction: column;
  width: 100%;
  height: 100%;
}

.input-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  width: 50%;

  .inp-lab {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;

    &.center {
      align-items: center;
      justify-content: center;

      .title {
        transform: translateY(-50%);
      }
    }

    &.right {
      align-items: flex-end;
      justify-content: flex-end;
    }

    .title {
      font-size: 0.8rem;
      font-weight: 500;
      opacity: 0.7;

      &.right {
        margin-left: auto;
      }
    }
  }
}

.form-title {
  font-size: 1.2rem;
  font-weight: 600;
  opacity: 0.7;

  &.top {
    position: absolute;
    top: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}

.transform-in-enter-active,
.transform-in-leave-active {
  transition: transform 0.3s ease;
}

.transform-in-enter-from,
.transform-in-leave-to {
  transform: translateY(-5%);
}

.transform-in-enter-to,
.transform-in-leave-from {
  transform: translateY(0);
}
</style>
