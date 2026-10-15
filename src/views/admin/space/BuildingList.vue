<template>
  <div class="pm-page">
    <div class="pm-card">
      <!-- 搜索栏 -->
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="按楼宇名称搜索"
          clearable
          style="width: 220px"
          @keyup.enter="onSearch"
        />
        <el-select v-model="typeFilter" placeholder="楼宇类型" clearable style="width: 140px">
          <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
        <div class="toolbar-right">
          <!-- 按钮级权限:v-permission 无权限 = 不渲染(operator 登录看不到) -->
          <el-button v-permission="'building:add'" type="primary" :icon="Plus" @click="openDialog()"
            >新增楼宇</el-button
          >
        </div>
      </div>

      <!-- 表格 -->
      <el-table v-loading="loading" :data="list" border stripe>
        <el-table-column type="index" label="#" width="52" align="center" />
        <el-table-column prop="name" label="楼宇名称" min-width="130" />
        <el-table-column prop="type" label="类型" width="90">
          <template #default="{ row }">{{ typeText(row.type) }}</template>
        </el-table-column>
        <el-table-column prop="floors" label="楼层" width="70" align="center" />
        <el-table-column prop="area" label="面积(㎡)" width="110" align="right" sortable>
          <template #default="{ row }">{{ row.area.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="tenantCount" label="租户数" width="90" align="center" sortable />
        <el-table-column prop="occupancyRate" label="入驻率" width="160" align="center">
          <template #default="{ row }">
            <el-progress :percentage="row.occupancyRate" :stroke-width="10" />
          </template>
        </el-table-column>
        <el-table-column prop="power" label="功率(kW)" width="100" align="right" sortable />
        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <el-button v-permission="'building:edit'" link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button v-permission="'building:delete'" link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.limit"
          :total="total"
          :page-sizes="[5, 10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="reload"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 新增/编辑弹窗:校验、回填、防重复提交 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑楼宇' : '新增楼宇'" width="480px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="楼宇名称" prop="name">
          <el-input v-model="form.name" placeholder="如:云麓大厦" maxlength="20" />
        </el-form-item>
        <el-form-item label="楼宇类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择" style="width: 100%">
            <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="楼层数" prop="floors">
          <el-input-number v-model="form.floors" :min="1" :max="60" />
        </el-form-item>
        <el-form-item label="总面积" prop="area">
          <el-input-number v-model="form.area" :min="100" :max="200000" :step="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <!-- 提交按钮 loading:防重复提交(连点只发一次) -->
        <el-button type="primary" :loading="submitting" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { apiBuildingAdd, apiBuildingDelete, apiBuildings, apiBuildingUpdate } from '@/api'
import type { Building } from '@/types'
import { useTable } from '@/composables/useTable'

const typeOptions = [
  { value: 'office', label: '办公' },
  { value: 'commercial', label: '商业' },
  { value: 'industrial', label: '工业' },
  { value: 'warehouse', label: '仓储' }
]
const typeText = (t: string) => typeOptions.find(o => o.value === t)?.label ?? t

/* ---- 列表:useTable 收敛 分页/搜索/竞态/删空回退 ---- */
const keyword = ref('')
const typeFilter = ref('')
const { list, loading, total, query, load, reload, search } = useTable<Building>(q =>
  apiBuildings({ ...q, keyword: keyword.value, type: typeFilter.value || undefined } as never)
)

function onSearch() {
  search()
}
function onReset() {
  keyword.value = ''
  typeFilter.value = ''
  search()
}

/* ---- 弹窗表单 ---- */
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = reactive<Partial<Building> & { id?: string }>({})
const rules: FormRules = {
  name: [
    { required: true, message: '请输入楼宇名称', trigger: 'blur' },
    { min: 2, max: 20, message: '长度 2-20 个字符', trigger: 'blur' }
  ],
  type: [{ required: true, message: '请选择楼宇类型', trigger: 'change' }]
}

function openDialog(row?: Building) {
  if (row) {
    // 编辑回填:解构拷贝,避免表单直接改表格行数据(改坏列表再点取消的经典 bug)
    Object.assign(form, { id: row.id, name: row.name, type: row.type, floors: row.floors, area: row.area })
  } else {
    Object.keys(form).forEach(k => delete form[k as keyof typeof form])
    form.type = 'office'
  }
  dialogVisible.value = true
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (form.id) {
      await apiBuildingUpdate(form as never)
      ElMessage.success('修改成功')
    } else {
      await apiBuildingAdd(form as never)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    reload()
  } finally {
    submitting.value = false
  }
}

function onDelete(row: Building) {
  ElMessageBox.confirm(`确认删除「${row.name}」?删除后不可恢复`, '删除确认', { type: 'warning' })
    .then(async () => {
      await apiBuildingDelete(row.id)
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
</style>
