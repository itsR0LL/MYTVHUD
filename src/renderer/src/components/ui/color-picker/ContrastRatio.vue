<template>
  <div class="flex items-center justify-between gap-4 pt-2 select-none">
    <div class="flex items-center gap-4">
      <div
        class="flex size-10 items-center justify-center rounded border"
        :style="{
          backgroundColor: `rgba(${rgbaColor.r}, ${rgbaColor.g}, ${rgbaColor.b}, ${rgbaColor.a})`,
          backgroundSize: '8px 8px'
        }"
      >
        <span
          class="font-medium"
          :style="{
            color: shouldUseWhiteText ? 'white' : 'black'
          }"
          >A</span
        >
      </div>
      <div class="flex flex-col justify-between">
        <span class="whitespace-nowrap text-nowrap text-xs text-muted-foreground"> 对比度 </span>
        <span class="text-sm">{{ currentContrastRatio }}</span>
      </div>
    </div>
    <div class="flex items-center justify-end gap-1 *:select-none">
      <span class="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs">
        <Check v-if="isAccessible.aa" class="size-3" />
        <X v-else class="size-3" />
        AA
      </span>
      <span class="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs">
        <Check v-if="isAccessible.aaa" class="size-3" />
        <X v-else class="size-3" />
        AAA
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, ref, computed } from 'vue'
import { Check, X } from 'lucide-vue-next'
import type { HsvaColor } from '@uiw/color-convert'
import { hsvaToRgba } from '@uiw/color-convert'

export interface ContrastRatioProps {
  color: HsvaColor
}

const props = defineProps<ContrastRatioProps>()

const darkModeContrastRatio = ref(0)
const lightModeContrastValue = ref(0)

const rgbaColor = computed(() => hsvaToRgba(props.color))

const shouldUseWhiteText = computed(() => {
  const rgb = rgbaColor.value
  // 计算背景颜色的相对亮度
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255

  const rLinear = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4)
  const gLinear = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4)
  const bLinear = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4)

  const luminance = 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear

  // 背景较暗时使用白色文字
  return luminance < 0.5
})

const currentContrastRatio = computed(() => {
  // 取深色和浅色模式中的较高对比度，评估不同背景下的可读性
  return Math.max(darkModeContrastRatio.value, lightModeContrastValue.value)
})

const isAccessible = computed(() => {
  return {
    aa: currentContrastRatio.value >= 4.5,
    aaa: currentContrastRatio.value >= 7
  }
})

function calculateContrastRatios(color: HsvaColor) {
  const rgb = hsvaToRgba(color)

  function toSRGB(c: number) {
    const channel = c / 255
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  }

  function alphaBlend(foreground: number, background: number, alpha: number) {
    return foreground * alpha + background * (1 - alpha)
  }

  // 在白色背景上进行 Alpha 混合
  const lightR = alphaBlend(rgb.r, 255, rgb.a)
  const lightG = alphaBlend(rgb.g, 255, rgb.a)
  const lightB = alphaBlend(rgb.b, 255, rgb.a)

  // 在深灰色背景上进行 Alpha 混合
  const darkR = alphaBlend(rgb.r, 32, rgb.a)
  const darkG = alphaBlend(rgb.g, 32, rgb.a)
  const darkB = alphaBlend(rgb.b, 32, rgb.a)

  // 计算与浅色背景混合后的亮度
  const lightRSRGB = toSRGB(lightR)
  const lightGSRGB = toSRGB(lightG)
  const lightBSRGB = toSRGB(lightB)
  const lightLuminance = 0.2126 * lightRSRGB + 0.7152 * lightGSRGB + 0.0722 * lightBSRGB

  // 计算与深色背景混合后的亮度
  const darkRSRGB = toSRGB(darkR)
  const darkGSRGB = toSRGB(darkG)
  const darkBSRGB = toSRGB(darkB)
  const darkLuminance = 0.2126 * darkRSRGB + 0.7152 * darkGSRGB + 0.0722 * darkBSRGB

  // 计算对比度时使用的黑白文字亮度
  const whiteTextLuminance = 1.0
  const blackTextLuminance = 0.0

  // 深色模式：计算白色文字与混合背景的对比度
  const darkModeRatio =
    (Math.max(whiteTextLuminance, darkLuminance) + 0.05) /
    (Math.min(whiteTextLuminance, darkLuminance) + 0.05)
  // 浅色模式：计算黑色文字与混合背景的对比度
  const lightModeRatio =
    (Math.max(blackTextLuminance, lightLuminance) + 0.05) /
    (Math.min(blackTextLuminance, lightLuminance) + 0.05)

  darkModeContrastRatio.value = Number(darkModeRatio.toFixed(2))
  lightModeContrastValue.value = Number(lightModeRatio.toFixed(2))
}

watch(() => props.color, calculateContrastRatios, { immediate: true, deep: true })
</script>
