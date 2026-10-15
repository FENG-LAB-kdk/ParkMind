import router from './index'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'

/**
 * 全局路由守卫 —— 登录态 + 动态路由注入
 *
 * 【刷新恢复】动态路由存在内存(Pinia),刷新即失。
 * 每轮导航前 ensureRoutes:未注入则按当前用户角色重新注册,
 * 随后若目标路由此前未注册成功(首帧时序问题),replace 重进一次。
 * 相比原 aiC 项目的 sessionStorage 压缩路由表缓存,本项目菜单表在前端
 * config 层,重建成本可忽略,故不需要持久化路由(架构取舍:真实后端下发
 * 时再引入缓存策略)。
 */
const WHITE_LIST = ['Login', 'NotFound']

router.beforeEach(async to => {
  const userStore = useUserStore()
  const permStore = usePermissionStore()

  // 未登录:仅放行白名单,其余回登录页并记住来源
  if (!userStore.token) {
    if (WHITE_LIST.includes(to.name as string) || to.path === '/login') return true
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // 已登录访问登录页 → 回首页
  if (to.path === '/login') return { path: '/admin/dashboard' }

  await permStore.ensureRoutes()

  // 动态页刚注册(首次进入 /admin/xxx 时 to 是注册前解析的)→ replace 重进
  if (to.name && !router.hasRoute(to.name) && to.name !== 'NotFound' && to.path.startsWith('/admin')) {
    return { ...to, replace: true }
  }
  return true
})

router.afterEach(to => {
  const title = (to.meta.title as string) || ''
  document.title = title ? `${title} - ParkMind 智慧园区` : 'ParkMind 智慧园区'
})
