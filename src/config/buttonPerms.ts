/**
 * 角色 → 按钮权限码表(模拟后端 role_menu 下发的 buttons)
 *
 * 【按钮级权限】与路由权限分层:菜单决定"能进哪个页面",
 * 按钮码决定"页面里哪些操作可用"。真实后端登录时随用户信息下发 buttons 集合,
 * v-permission 指令读取后:无权限 = 移除 DOM(减少视觉噪音且防误点)。
 * 演示闭环:admin 登录可见"删除楼宇/删除设备/导出",operator 登录看不到
 */
export const ROLE_BUTTONS: Record<'admin' | 'operator', string[]> = {
  admin: [
    'building:add',
    'building:edit',
    'building:delete',
    'device:add',
    'device:edit',
    'device:delete',
    'alarm:handled',
    'alarm:export',
    'user:add',
    'user:edit',
    'user:delete'
  ],
  operator: ['alarm:handled']
}
