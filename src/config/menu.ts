/**
 * 模拟"后端下发的菜单表"
 *
 * 【权限模型】企业项目菜单由后端按角色下发,前端只做两件事:
 * 1) 菜单树 → 侧边栏渲染;2) 菜单树 → 动态注册路由。
 * 本项目无真实后端,故菜单表写在 config 层模拟,但流程与真实后端下发完全一致:
 * 登录 → 按角色过滤 → 注册动态路由 → 刷新后由守卫重新注入(防刷新丢路由)。
 */
export interface MenuNode {
  path: string
  name: string
  title: string
  icon?: string
  /** 页面组件相对路径(相对 src/views),由路由层映射为懒加载 */
  component?: string
  /** 可见角色:缺省 = 全部角色可见 */
  roles?: Array<'admin' | 'operator'>
  /**
   * 全屏页:只作为侧边栏入口,**不注册成 AdminLayout 的子路由**。
   * 大屏 / 园区分布这类页面自带全屏布局,嵌进后台框架里会打架;
   * 它们的路由已经在静态路由表(router/index.ts)里注册好了。
   */
  fullscreen?: boolean
  children?: MenuNode[]
}

/** 全量菜单树(模拟后端全量数据) */
export const fullMenuTree: MenuNode[] = [
  {
    path: '/admin/dashboard',
    name: 'Dashboard',
    title: '运营工作台',
    icon: 'Odometer',
    component: 'admin/dashboard/index'
  },
  {
    path: '/admin/space',
    name: 'Space',
    title: '楼宇空间',
    icon: 'OfficeBuilding',
    children: [
      { path: '/admin/building', name: 'BuildingList', title: '楼宇列表', component: 'admin/space/BuildingList' },
      { path: '/admin/device', name: 'DeviceList', title: '设备台账', component: 'admin/space/DeviceList' }
    ]
  },
  {
    path: '/admin/alarm',
    name: 'Alarm',
    title: '告警中心',
    icon: 'Bell',
    component: 'admin/alarm/index'
  },
  {
    path: '/admin/assistant',
    name: 'Assistant',
    title: '智能运维助手',
    icon: 'MagicStick',
    component: 'admin/assistant/index'
  },
  {
    // 全屏页:路由在 router/index.ts 静态注册,这里只提供侧边栏入口
    path: '/park',
    name: 'ParkDist',
    title: '园区分布',
    icon: 'MapLocation',
    fullscreen: true
  },
  {
    // 全屏页:三维场景需要独占整屏,套在后台框架里会被侧边栏挤变形
    path: '/park3d',
    name: 'Park3D',
    title: '园区三维',
    icon: 'Box',
    fullscreen: true
  },
  {
    path: '/admin/system',
    name: 'System',
    title: '系统管理',
    icon: 'Setting',
    roles: ['admin'],
    children: [
      { path: '/admin/user', name: 'SysUser', title: '用户管理', component: 'admin/system/User' },
      { path: '/admin/role', name: 'SysRole', title: '角色权限', component: 'admin/system/Role' }
    ]
  }
]

/** 按角色过滤出可见菜单(模拟后端 role_menus 下发) */
export function getMenuByRole(role: 'admin' | 'operator'): MenuNode[] {
  const filter = (nodes: MenuNode[]): MenuNode[] =>
    nodes
      .filter(n => !n.roles || n.roles.includes(role))
      .map(n => ({ ...n, children: n.children ? filter(n.children) : undefined }))
  return filter(fullMenuTree)
}
