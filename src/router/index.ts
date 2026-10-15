import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

/**
 * 路由表:静态壳 + 动态注入(permission store)
 * /admin 用父路由 + children 动态 addRoute 挂载(见 router/dynamic.ts)
 * /screen 是独立全屏路由,不经 admin 布局(大屏不登录也可经 /login 进入演示)
 */
const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'Login', component: () => import('@/views/login/index.vue'), meta: { title: '登录' } },
  {
    path: '/admin',
    name: 'AdminLayout',
    component: () => import('@/views/admin/layout/index.vue'),
    redirect: '/admin/dashboard',
    children: [
      {
        path: '/admin/dashboard',
        name: 'Dashboard',
        component: () => import('@/views/admin/dashboard/index.vue'),
        meta: { title: '运营工作台' }
      }
    ]
  },
  {
    path: '/screen',
    name: 'Screen',
    component: () => import('@/views/screen/index.vue'),
    meta: { title: '园区态势大屏' }
  },
  {
    path: '/park',
    name: 'ParkDist',
    component: () => import('@/views/park/index.vue'),
    meta: { title: '园区分布' }
  },
  {
    path: '/park3d',
    name: 'Park3D',
    component: () => import('@/views/park3d/index.vue'),
    meta: { title: '园区三维' }
  },
  { path: '/', redirect: '/admin/dashboard' },
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('@/views/admin/error/NotFound.vue') }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
