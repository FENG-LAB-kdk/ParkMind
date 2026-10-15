<template>
  <el-container class="admin-layout">
    <!-- 侧边菜单:由 permission store 的同源菜单树渲染 -->
    <el-aside :width="collapsed ? '64px' : '220px'" class="layout-aside">
      <div class="aside-logo" @click="$router.push('/admin/dashboard')">
        <span class="logo-dot" />
        <span v-show="!collapsed" class="logo-text">ParkMind</span>
      </div>
      <el-scrollbar>
        <el-menu :default-active="activePath" :collapse="collapsed" router unique-opened class="aside-menu">
          <template v-for="item in permStore.menus" :key="item.path">
            <el-sub-menu v-if="item.children?.length" :index="item.path">
              <template #title>
                <el-icon><component :is="iconOf(item.icon)" /></el-icon>
                <span>{{ item.title }}</span>
              </template>
              <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
                <el-icon><component :is="iconOf(child.icon)" /></el-icon>
                <span>{{ child.title }}</span>
              </el-menu-item>
            </el-sub-menu>
            <el-menu-item v-else :index="item.path">
              <el-icon><component :is="iconOf(item.icon)" /></el-icon>
              <template #title>{{ item.title }}</template>
            </el-menu-item>
          </template>
        </el-menu>
      </el-scrollbar>
    </el-aside>

    <el-container>
      <el-header class="layout-header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="collapsed = !collapsed">
            <Expand v-if="collapsed" /><Fold v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="b in breadcrumbs" :key="b">{{ b }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-tooltip content="园区态势大屏" placement="bottom">
            <el-button link @click="$router.push('/screen')"
              ><el-icon><Monitor /></el-icon>&nbsp;大屏</el-button
            >
          </el-tooltip>
          <el-tooltip :content="isDark ? '切换亮色' : '切换暗色'" placement="bottom">
            <el-button link @click="theme.toggle()">
              <el-icon><Sunny v-if="!isDark" /><Moon v-else /></el-icon>
            </el-button>
          </el-tooltip>
          <el-dropdown @command="onCommand">
            <span class="user-chip">
              <el-avatar :size="26" class="user-avatar">{{ (userStore.user?.nickname || 'U')[0] }}</el-avatar>
              {{ userStore.user?.nickname }}
              <el-tag size="small" :type="userStore.user?.role === 'admin' ? 'danger' : 'info'" effect="plain">
                {{ userStore.user?.role === 'admin' ? '超管' : '运营' }}
              </el-tag>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="layout-main">
        <router-view v-slot="{ Component }">
          <keep-alive :include="['Dashboard']">
            <component :is="Component" />
          </keep-alive>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Expand,
  Fold,
  Monitor,
  Sunny,
  Moon,
  Odometer,
  OfficeBuilding,
  Bell,
  Setting,
  MagicStick,
  Box,
  User as UserIcon
} from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'
import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const permStore = usePermissionStore()
const theme = useTheme()
const isDark = theme.isDark

const collapsed = ref(false)
const activePath = computed(() => route.path)

/** 面包屑:由路由 meta.title 链生成(当前仅取当前页) */
const breadcrumbs = computed(() => {
  const matched = route.matched.filter(r => r.meta.title)
  return matched.map(r => r.meta.title as string)
})

/** icon 字符串 → 组件:注册表方式替代全局注册全部图标 */
const iconMap: Record<string, unknown> = {
  Odometer,
  OfficeBuilding,
  Bell,
  Setting,
  MagicStick,
  Box,
  User: UserIcon
}
const iconOf = (name?: string) => iconMap[name || ''] || Odometer

async function onCommand(cmd: string) {
  if (cmd === 'logout') {
    userStore.logout()
    permStore.reset()
    router.replace('/login')
  }
}
</script>

<style scoped>
.admin-layout {
  height: 100%;
}
.layout-aside {
  background: var(--pm-bg-card);
  border-right: 1px solid var(--pm-border);
  transition: width 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.aside-logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  font-weight: 700;
  font-size: 17px;
  color: var(--pm-primary);
  cursor: pointer;
  white-space: nowrap;
}
.logo-dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(135deg, #38bdf8, #2563eb);
}
.aside-menu {
  border-right: none;
}
.layout-header {
  height: 56px;
  background: var(--pm-bg-card);
  border-bottom: 1px solid var(--pm-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.collapse-btn {
  font-size: 18px;
  cursor: pointer;
  color: var(--pm-text-2);
}
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.user-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--pm-text-1);
  outline: none;
}
.user-avatar {
  background: var(--pm-primary);
  color: #fff;
  font-size: 13px;
}
.layout-main {
  padding: 16px;
  overflow: auto;
  background: var(--pm-bg-page);
}
</style>
