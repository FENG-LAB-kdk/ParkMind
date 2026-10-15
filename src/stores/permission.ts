import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getMenuByRole, type MenuNode } from '@/config/menu'
import { ROLE_BUTTONS } from '@/config/buttonPerms'
import { registerDynamicRoutes } from '@/router/dynamic'
import { useUserStore } from './user'

/**
 * 权限状态 —— 动态路由 + 按钮码
 *
 * 【权限模型】全流程:
 * 登录成功 → 按角色取"后端下发"的菜单表 → 注册为 /admin 子路由
 *  → 同源菜单渲染侧边栏;刷新 → user store 恢复 → 守卫 ensureRoutes 重注
 * 加页面只需在 config/menu.ts 加一行,路由与菜单天然同源
 */
export const usePermissionStore = defineStore('permission', () => {
  const menus = ref<MenuNode[]>([])
  const routesInjected = ref(false)

  /** 当前用户按钮码(演示双账号差异) */
  const buttons = ref<string[]>([])

  async function initRoutes() {
    const userStore = useUserStore()
    if (!userStore.user) return
    menus.value = getMenuByRole(userStore.user.role)
    buttons.value = ROLE_BUTTONS[userStore.user.role]
    registerDynamicRoutes(menus.value)
    routesInjected.value = true
  }

  function hasPerm(code: string): boolean {
    return buttons.value.includes(code)
  }

  async function ensureRoutes() {
    if (!routesInjected.value) await initRoutes()
  }

  function reset() {
    menus.value = []
    buttons.value = []
    routesInjected.value = false
  }

  return { menus, buttons, routesInjected, hasPerm, initRoutes, ensureRoutes, reset }
})
