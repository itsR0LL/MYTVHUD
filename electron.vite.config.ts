import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      // 将 HUD 静态资源复制到主进程构建目录
      viteStaticCopy({
        targets: [
          {
            src: 'src/main/overlay/file/**/*',
            dest: 'overlay/file'
          },
          {
            src: 'src/main/bp/file/**/*',
            dest: 'bp/file'
          },
          {
            src: 'src/main/intermission-next/file',
            dest: 'intermission-next'
          },
          {
            src: 'src/main/intermission-next/assets/brand',
            dest: 'intermission-next/assets'
          },
          {
            src: 'src/main/intermission-next/assets/maps',
            dest: 'intermission-next/assets'
          },
          {
            src: 'src/main/intermission-next/assets/backgrounds',
            dest: 'intermission-next/assets'
          },
          {
            src: 'src/renderer/src/assets/chinese_fonts/HarmonyOS_Sans_SC_Regular.ttf',
            dest: 'bp/file/fonts'
          },
          {
            src: 'src/renderer/src/assets/chinese_fonts/HarmonyOS_Sans_SC_Bold.ttf',
            dest: 'bp/file/fonts'
          },
          {
            src: 'src/gamestate_integration_mytvhud.cfg',
            dest: 'gsi'
          }
        ]
      })
    ],
    build: {
      rollupOptions: {
        external: ['ws']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [vue() as any, vueDevTools(), tailwindcss()]
  }
})
