import type { Directive } from 'vue'
import { usePermissionStore } from '@/stores/permission'

/**
 * v-permission —— 按钮级权限指令
 *
 * 【按钮权限】用法 <el-button v-permission="'building:delete'">删除</el-button>
 * 无权限时移除整个 DOM:比 disabled 更彻底 —— 不渲染即不占位、不误点,
 * 也避免"知道有这功能但没权限"的体验。改良自原 aiC 项目同名指令
 * (原实现混合 disabled/DOM 移除两套逻辑,本项目收敛为 DOM 移除一种,
 * 语义更简单);副作用:动态切换权限需重新渲染 —— 用 v-if 包裹或
 * 在权限变更处调用 nextTick 重挂(本项目角色登录即固定,无此场景)
 */
export const permission: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const permStore = usePermissionStore()
    const code = binding.value
    if (!code) return
    if (!permStore.hasPerm(code)) {
      el.remove()
    }
  }
}
