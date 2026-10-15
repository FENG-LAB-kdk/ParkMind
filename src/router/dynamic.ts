import type { RouteRecordRaw } from 'vue-router'
import router from './index'
import type { MenuNode } from '@/config/menu'

/**
 * 动态路由注册 —— 菜单表 → RouteRecord
 *
 * 【双轨路由与防重复注入】
 * 与"刷新丢路由"的经典 bug 的对抗:vue-router 4 的 addRoute 同名重复注册
 * 会产生告警与不可预期的匹配。因此在注入前先 removeRoute 掉上次注入的
 * 同名路由 —— 等价于原 aiC 项目 router.matcher 重置思想,API 更干净
 */

/** 页面组件 → 懒加载:import.meta.glob 自动收集 views 下所有页面 */
const viewModules = import.meta.glob('@/views/**/*.vue')

function resolveComponent(componentPath?: string) {
  if (!componentPath) return undefined
  return viewModules[`/src/views/${componentPath}.vue`]
}

let injectedNames: string[] = []

export function registerDynamicRoutes(menus: MenuNode[]) {
  // 先清上次注入的同名路由(刷新/切换账号场景)
  injectedNames.forEach(name => {
    if (router.hasRoute(name)) router.removeRoute(name)
  })
  injectedNames = []

  const walk = (nodes: MenuNode[]) => {
    nodes.forEach(n => {
      // 全屏页只作侧边栏入口:它的路由已在静态表里,再注入一份到 AdminLayout 下
      // 会生成两条同名不同父的路由,导致访问时命中的是不带全屏布局的那条
      if (n.fullscreen) return
      if (n.component) {
        const record: RouteRecordRaw = {
          path: n.path,
          name: n.name,
          component: resolveComponent(n.component) as never,
          meta: { title: n.title }
        }
        router.addRoute('AdminLayout', record)
        injectedNames.push(n.name)
      } else if (n.children?.length) {
        // 纯目录节点:children 已有完整 path,直接挂到 AdminLayout 下
        walk(n.children)
      }
    })
  }
  walk(menus)
}

/** 菜单树 → 侧边栏渲染数据(带组件无关性:Layout 只读 title/icon/path) */
export function menuToSidebar(menus: MenuNode[]): MenuNode[] {
  return menus.map(n => ({ ...n, children: n.children ? menuToSidebar(n.children) : undefined }))
}
