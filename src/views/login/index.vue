<template>
  <div class="login-page">
    <div class="login-brand">
      <div class="brand-title">ParkMind</div>
      <div class="brand-sub">智慧园区综合运营平台</div>
      <div class="brand-line" />
      <ul class="brand-points">
        <li>· 楼宇 / 设备 / 告警 / 能耗 一体化管理</li>
        <li>· WebSocket 实时态势 · 十万级数据流畅渲染</li>
        <li>· 双角色演示:admin(全权限)/ operator(受限)</li>
      </ul>
    </div>

    <div class="login-form-wrap">
      <el-form ref="formRef" :model="form" :rules="rules" class="login-form" size="large" @keyup.enter="submit">
        <h2>账号登录</h2>
        <p class="login-tip">密码均为 <b>123456</b> · 演示按钮级权限差异请分别体验两个账号</p>
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" :prefix-icon="User" clearable />
        </el-form-item>
        <el-form-item prop="password">
          <el-input v-model="form.password" type="password" placeholder="密码" :prefix-icon="Lock" show-password />
        </el-form-item>
        <el-button type="primary" class="login-btn" :loading="loading" @click="submit">登 录</el-button>

        <div class="demo-accounts">
          <el-button size="small" @click="quick('admin')">填充 admin(超管)</el-button>
          <el-button size="small" @click="quick('operator')">填充 operator(运营)</el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { usePermissionStore } from '@/stores/permission'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const permStore = usePermissionStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const form = reactive({ username: 'admin', password: '123456' })
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

function quick(name: 'admin' | 'operator') {
  form.username = name
  form.password = '123456'
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await userStore.login(form.username, form.password)
    // 登录后按角色注册动态路由 + 按钮码(权限体系核心流程)
    await permStore.initRoutes()
    ElMessage.success('登录成功')
    const redirect = (route.query.redirect as string) || '/admin/dashboard'
    router.replace(redirect)
  } catch (e) {
    // 错误提示由 request 拦截器统一处理(silent 模式下这里兜底)
    ElMessage.error((e as Error).message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  height: 100%;
  display: flex;
  background: linear-gradient(135deg, #0b1e3f 0%, #123a6d 55%, #0b2a52 100%);
}
.login-brand {
  flex: 1;
  color: #e6f1ff;
  padding: 9vh 8vw;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.brand-title {
  font-size: 56px;
  font-weight: 700;
  letter-spacing: 2px;
  background: linear-gradient(90deg, #7dd3fc, #60a5fa 60%, #a5b4fc);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-sub {
  font-size: 20px;
  color: #93b6e8;
  margin-top: 6px;
}
.brand-line {
  width: 72px;
  height: 4px;
  border-radius: 2px;
  margin: 26px 0;
  background: linear-gradient(90deg, #38bdf8, transparent);
}
.brand-points {
  color: #7fa5d9;
  line-height: 2;
  font-size: 14px;
}
.login-form-wrap {
  width: 480px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}
html[data-theme='dark'] .login-form-wrap {
  background: var(--pm-bg-card);
}
.login-form {
  width: 320px;
}
.login-form h2 {
  margin-bottom: 4px;
  color: var(--pm-text-1);
}
.login-tip {
  font-size: 12px;
  color: var(--pm-text-3);
  margin-bottom: 26px;
}
.login-btn {
  width: 100%;
  margin-top: 4px;
  letter-spacing: 6px;
}
.demo-accounts {
  margin-top: 18px;
  display: flex;
  justify-content: space-between;
}
</style>
