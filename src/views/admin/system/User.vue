<template>
  <div class="pm-page">
    <div class="pm-card">
      <!-- 搜索 + 工具栏 -->
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="按账号/姓名搜索"
          clearable
          style="width: 200px"
          @keyup.enter="onSearch"
        />
        <el-select v-model="roleFilter" placeholder="全部角色" clearable style="width: 130px">
          <el-option label="超级管理员" value="admin" />
          <el-option label="运营专员" value="operator" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
        <div class="toolbar-right">
          <el-button v-permission="'user:add'" type="primary" :icon="Plus" @click="openDialog()">新增用户</el-button>
        </div>
      </div>

      <!-- 列表 -->
      <el-table v-loading="loading" :data="list" border stripe>
        <el-table-column prop="username" label="账号" width="140" />
        <el-table-column prop="nickname" label="姓名" min-width="160" />
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">{{
              row.role === 'admin' ? '超级管理员' : '运营专员'
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.disabled ? 'warning' : 'success'" size="small" effect="plain">{{
              row.disabled ? '已停用' : '正常'
            }}</el-tag>
            <span v-if="row.builtin" class="tip">内置</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right" align="center">
          <template #default="{ row }">
            <el-button v-permission="'user:edit'" link type="primary" @click="openDialog(row)">编辑</el-button>
            <!-- 内置账号禁停用;不能停用/删除自己(与后端规则双层兜底) -->
            <el-button
              v-if="!row.builtin && row.username !== currentUser"
              v-permission="'user:edit'"
              link
              :type="row.disabled ? 'success' : 'warning'"
              @click="onToggle(row)"
            >
              {{ row.disabled ? '启用' : '停用' }}
            </el-button>
            <el-button
              v-if="!row.builtin && row.username !== currentUser"
              v-permission="'user:delete'"
              link
              type="danger"
              @click="onDelete(row)"
            >
              删除
            </el-button>
            <span v-if="row.username === currentUser" class="tip">当前账号</span>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.limit"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="reload"
          @current-change="load"
        />
      </div>

      <el-alert class="mt16" type="info" :closable="false" title="本页演示口径">
        <p>1. 用户数据走真实接口 /api/user/*(server 内存表,新增账号可直接登录,刷新不丢);</p>
        <p>2. admin / operator 为内置种子:仅可改昵称,禁停用/删除/改角色(防锁死演示账号);</p>
        <p>3. 按钮码区分 user:add / user:edit / user:delete —— operator 角色无系统管理菜单,自然看不到本页。</p>
      </el-alert>
    </div>

    <!-- 新增/编辑弹窗:账号编辑时锁定;密码仅新增必填(编辑留空 = 不改) -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑用户' : '新增用户'" width="440px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" placeholder="登录账号,创建后不可改" maxlength="20" :disabled="!!form.id" />
        </el-form-item>
        <el-form-item label="姓名" prop="nickname">
          <el-input v-model="form.nickname" placeholder="显示名称" maxlength="20" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="form.id ? '留空则不修改密码' : '至少 6 位'"
            maxlength="20"
          />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" style="width: 100%" :disabled="!!form.builtin">
            <el-option label="超级管理员" value="admin" />
            <el-option label="运营专员" value="operator" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { apiUserAdd, apiUserDelete, apiUserList, apiUserUpdate } from '@/api'
import type { UserRow } from '@/types'
import { useTable } from '@/composables/useTable'
import { useUserStore } from '@/stores/user'

/**
 * 用户管理 —— 系统管理真实 CRUD
 * 【设计要点】登录的 users 表在 server(内存态),与 /auth/login 同源:
 * 在这里新增的用户能真实登录,停用后登录被拦,角色决定菜单/按钮可见性。
 * 后端规则:内置账号(builtin)仅可改昵称;不可删除自己 —— 前端按钮与后端接口双层兜底。
 */
const userStore = useUserStore()
const currentUser = computed(() => userStore.user?.username ?? '')

/* ---- 列表:useTable 收敛 分页/搜索/竞态/删空回退 ---- */
const keyword = ref('')
const roleFilter = ref('')
const { list, loading, total, query, load, reload, search } = useTable<UserRow>(q =>
  apiUserList({
    ...q,
    keyword: keyword.value || undefined,
    role: (roleFilter.value || undefined) as 'admin' | 'operator' | undefined
  })
)
function onSearch() {
  search()
}
function onReset() {
  keyword.value = ''
  roleFilter.value = ''
  search()
}

/* ---- 弹窗表单:新增/编辑共用(与楼宇/设备页同范式) ---- */
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = reactive<Partial<UserRow> & { id?: string; password?: string }>({})
const rules: FormRules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { min: 3, max: 20, message: '长度 3-20 个字符', trigger: 'blur' }
  ],
  nickname: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  // 编辑时密码可空(留空 = 不修改),故不做 required;新增必填在 onSubmit 手动拦
  password: [
    { validator: (_r, v: string, cb) => (v && v.length < 6 ? cb(new Error('密码至少 6 位')) : cb()), trigger: 'blur' }
  ],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
}

function openDialog(row?: UserRow) {
  Object.keys(form).forEach(k => delete form[k as keyof typeof form])
  if (row) {
    // 编辑回填:解构拷贝,避免表单直接改表格行数据
    Object.assign(form, {
      id: row.id,
      username: row.username,
      nickname: row.nickname,
      role: row.role,
      builtin: row.builtin
    })
  } else {
    form.role = 'operator'
  }
  dialogVisible.value = true
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!form.id && !form.password) {
    ElMessage.warning('请填写初始密码')
    return
  }
  submitting.value = true
  try {
    if (form.id) {
      // builtin 账号 role 锁定:不回传 role(后端兜底:传了也拒绝)
      await apiUserUpdate({
        id: form.id,
        nickname: form.nickname,
        role: form.builtin ? undefined : (form.role as 'admin' | 'operator'),
        password: form.password || undefined
      })
      ElMessage.success('修改成功')
    } else {
      await apiUserAdd({
        username: form.username as string,
        nickname: form.nickname as string,
        password: form.password as string,
        role: form.role as 'admin' | 'operator'
      })
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    reload()
  } finally {
    submitting.value = false
  }
}

/** 停用/启用:行内动作,单字段 PUT(不整行编辑) */
function onToggle(row: UserRow) {
  const action = row.disabled ? '启用' : '停用'
  ElMessageBox.confirm(
    `确认${action}「${row.nickname}」?${action === '停用' ? '停用后该账号将无法登录' : ''}`,
    '操作确认',
    { type: 'warning' }
  )
    .then(async () => {
      await apiUserUpdate({ id: row.id, disabled: !row.disabled })
      ElMessage.success(`已${action}`)
      reload()
    })
    .catch(() => {})
}

function onDelete(row: UserRow) {
  ElMessageBox.confirm(`确认删除「${row.username}」?删除后不可恢复`, '删除确认', { type: 'warning' })
    .then(async () => {
      await apiUserDelete(row.id)
      ElMessage.success('已删除')
      reload() // 删空末页时 useTable 自动回退页码
    })
    .catch(() => {})
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.toolbar-right {
  margin-left: auto;
}
.pager {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}
.tip {
  color: var(--pm-text-3);
  font-size: 12px;
}
.mt16 {
  margin-top: 16px;
  line-height: 1.9;
}
</style>
