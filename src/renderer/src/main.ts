// 全局样式
import './assets/main.scss'
import './assets/globals.css'

// Vue 应用及插件
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './components/routers'
import { i18n } from './i18n'

// 字体资源
import './assets/chinesefonts.scss'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/inter/latin-800.css'
import '@fontsource/inter/latin-900.css'

const app = createApp(App)
app.use(router)
app.use(i18n)
app.mount('#app')
