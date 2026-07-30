<template>
  <div class="menu-container">
    <div class="menu-title">{{ t('menu.title') }}</div>
    <div class="menu-item">
      <div class="menu-item-title">{{ t('menu.step1.title') }}</div>
      <div class="menu-item-content">
        {{ t('menu.step1.content1_prefix') }}<span>CS2.exe</span
        >{{ t('menu.step1.content1_suffix') }}
      </div>
      <Button variant="secondary" style="margin-top: 0.5rem" @click="autoPlaceGSI">
        {{ t('common.select') }}
      </Button>
    </div>
    <div class="menu-item">
      <div class="menu-item-title">{{ t('menu.step2.title') }}</div>
      <div class="menu-item-content">
        {{ t('menu.step2.content1_beforeIcon') }}
        <Blend style="margin: 0 0.25rem" color="var(--color-rose-800)" :size="16" />{{
          t('menu.step2.content1_afterIcon')
        }}
      </div>
      <div class="menu-item-content">
        {{ t('menu.step2.content2_prefix') }} <span>cl_draw_only_deathnotices 1</span>
        {{ t('menu.step2.content2_suffix') }}
      </div>
    </div>
    <div class="menu-item">
      <div class="menu-item-title">{{ t('menu.step3.title') }}</div>
      <div class="menu-item-content">
        {{ t('menu.step3.content1_prefix') }}<span>http://localhost:5031/overlay</span
        >{{ t('menu.step3.content1_suffix') }}
      </div>
      <div class="menu-item-content">
        {{ t('menu.step3.content3_prefix') }}<span>http://localhost:5031/bp</span
        >{{ t('menu.step3.content3_suffix') }}
      </div>
      <div class="menu-item-content">{{ t('menu.step3.content2') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Blend } from 'lucide-vue-next'

const { t } = useI18n({ useScope: 'global' })

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function autoPlaceGSI(): Promise<void> {
  try {
    const res = await window.api.autoPlaceGSI()
    if (res?.success) {
      toast.success('配置完成', { description: res.message })
    } else {
      toast.warning('未完成配置', { description: res?.message ?? '操作已取消或失败' })
    }
  } catch (error: unknown) {
    toast.error('操作失败', { description: getErrorMessage(error) })
  }
}
</script>

<style scoped lang="scss">
.menu-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 0.55rem;
  width: 100%;
  height: 100%;
  padding: 1rem;

  .menu-title {
    width: 100%;
    text-align: center;
    font-size: 1.2rem;
    font-weight: 600;
    opacity: 0.7;
  }

  .menu-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    min-height: 4rem;
    padding: 1rem;
    border-radius: 0.5rem;
    background-color: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    transition: all 0.3s ease-in-out;

    .menu-item-title {
      font-size: 1rem;
      font-weight: 500;
      color: #fff;
    }

    .menu-item-content {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;

      span {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
        font-weight: 500;
        color: #fff;
        font-family: 'Consolas', monospace;
        background: var(--background);
        padding: 0.1rem 0.5rem;
        border-radius: var(--radius);
      }
    }

    &:hover {
      border-color: var(--color-primary);
    }
  }
}
</style>
