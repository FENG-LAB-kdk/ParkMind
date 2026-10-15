<template>
  <div class="pm-page">
    <div class="pm-card">
      <h3>双角色权限矩阵(本项目动态路由 + 按钮权限演示)</h3>
      <el-table :data="matrix" border>
        <el-table-column prop="module" label="功能域" min-width="140" />
        <el-table-column label="admin(超管)">
          <template #default="{ row }">
            <el-tag v-for="p in row.admin" :key="p" size="small" class="tag" type="success">{{ p }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="operator(运营)">
          <template #default="{ row }">
            <el-tag v-for="p in row.operator" :key="p" size="small" class="tag" type="info">{{ p }}</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <el-descriptions :column="1" border class="mt16">
        <el-descriptions-item label="菜单差异"
          >admin 可见「系统管理」(用户/角色),operator 无此菜单 —— 未注册的路由无法访问</el-descriptions-item
        >
        <el-descriptions-item label="按钮差异"
          >删除楼宇/设备、导出等按钮码仅 admin 拥有;operator 仅 alarm:handled —— v-permission 无权限移除
          DOM</el-descriptions-item
        >
        <el-descriptions-item label="实现位置"
          >菜单:src/config/menu.ts ｜ 按钮码:src/config/buttonPerms.ts ｜ 注册:src/router/dynamic.ts ｜
          守卫:src/router/guard.ts</el-descriptions-item
        >
      </el-descriptions>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const matrix = ref([
  {
    module: '工作台',
    admin: ['查看统计'],
    operator: ['查看统计']
  },
  {
    module: '楼宇列表',
    admin: ['新增 / 编辑 / 删除', '导入'],
    operator: ['查看']
  },
  {
    module: '设备台账',
    admin: ['新增 / 删除'],
    operator: ['查看']
  },
  {
    module: '告警中心',
    admin: ['标记处理', '导出'],
    operator: ['标记处理']
  },
  {
    module: '系统管理',
    admin: ['用户 / 角色'],
    operator: ['(无菜单)']
  }
])
</script>

<style scoped>
h3 {
  margin-bottom: 14px;
}
.tag {
  margin: 2px 4px 2px 0;
}
.mt16 {
  margin-top: 16px;
}
</style>
