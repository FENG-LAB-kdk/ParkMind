import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import VxeUI from 'vxe-pc-ui'
import VxeUITable from 'vxe-table'
import App from './App.vue'
import router from './router'
import './router/guard'
import { permission } from '@/directives/permission'
import { initEchartsThemes } from '@/config/echartsTheme'

import 'element-plus/dist/index.css'
import 'vxe-pc-ui/lib/style.css'
import 'vxe-table/lib/style.css'
import '@/styles/theme.css'
import '@/styles/base.css'

/**
 * 入口 —— 对比原 aiC 项目 main.js(443 行,15 个全局组件 + 12 个指令 +
 * 20+ 原型属性 + 全局 mixin)的收敛原则:
 * 1. 不再全局注册组件(按需局部引入,摇树友好)
 * 2. 不再挂 Vue.prototype(Vue3 组合式 API 取代;工具直接 import)
 * 3. 指令只留权限一个(其余按需在页面内实现)
 */
const app = createApp(App)

initEchartsThemes()
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.use(VxeUI)
app.use(VxeUITable)
app.directive('permission', permission)

app.mount('#app')
