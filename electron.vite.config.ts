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
