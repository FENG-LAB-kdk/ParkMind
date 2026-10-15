<template>
  <div class="notfound">
    <div class="code">404</div>
    <div class="tip">页面不存在或无权访问</div>
    <el-button type="primary" @click="$router.replace('/admin/dashboard')">返回工作台</el-button>
  </div>
</template>

<script setup lang="ts">
// 404 兜底:未登录访问会先被守卫拦去登录页;此页承载动态路由外的未知路径
</script>

<style scoped>
.notfound {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.code {
  font-size: 90px;
  font-weight: 800;
  background: linear-gradient(90deg, var(--pm-primary), var(--pm-primary-light));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.tip {
  color: var(--pm-text-2);
}
</style>
