<template>
  <div class="pm-page">
    <div class="pm-card">
      <div class="toolbar">
        <el-select v-model="buildingId" placeholder="全部楼宇" clearable style="width: 200px">
          <el-option v-for="b in buildings" :key="b.id" :label="b.name" :value="b.id" />
        </el-select>
        <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 140px">
          <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 130px">
          <el-option label="运行" value="running" />
          <el-option label="故障" value="fault" />
          <el-option label="离线" value="offline" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
        <div class="toolbar-right">
          <el-button v-permission="'device:add'" type="primary" :icon="Plus" @click="openDialog()">新增设备</el-button>
        </div>
      </div>

      <el-table v-loading="loading" :data="list" border stripe>
        <el-table-column type="index" label="#" width="52" align="center" />
        <el-table-column prop="name" label="设备名称" min-width="170" />
        <el-table-column label="所属楼宇" width="130">
          <template #default="{ row }">{{ buildingName(row.buildingId) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ typeText(row.type) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="读数" width="120" align="right">
          <template #default="{ row }">{{ row.type === 'meter' ? `${row.value} kW` : row.value }}</template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="170">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right" align="center">
          <template #default="{ row }">
            <el-button v-permission="'device:edit'" link type="primary" @click="openDialog(row)">编辑</el-button>
            <el-button v-permission="'device:delete'" link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.limit"
          :total="total"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50, 100]"
          @size-change="reload"
          @current-change="load"
        />
      </div>
    </div>

    <!-- 新增/编辑弹窗:与楼宇页同一套范式(校验/回填/防重复提交) -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑设备' : '新增设备'" width="460px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="设备名称" prop="name">
          <el-input v-model="form.name" maxlength="30" />
        </el-form-item>
        <el-form-item label="设备类型" prop="type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="t in typeOptions" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属楼宇" prop="buildingId">
          <el-select v-model="form.buildingId" style="width: 100%">
            <el-option v-for="b in buildings" :key="b.id" :label="b.name" :value="b.id" />
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
import { onMounted, reactive, ref } from 'vue'
import { Search, Refresh, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { apiBuildings, apiDeviceAdd, apiDeviceDelete, apiDevices, apiDeviceUpdate } from '@/api'
import type { Building, Device } from '@/types'
import { useTable } from '@/composables/useTable'
import { formatTime } from '@/utils/tools'

const typeOptions = [
  { value: 'meter', label: '智能电表' },
  { value: 'gate', label: '门禁闸机' },
  { value: 'camera', label: '监控摄像' },
  { value: 'smoke', label: '烟感探头' },
  { value: 'hvac', label: '空调机组' }
]
const typeText = (t: string) => typeOptions.find(o => o.value === t)?.label ?? t
const statusText = (s: string) => ({ running: '运行', fault: '故障', offline: '离线' })[s] || s
const statusTag = (s: string): 'success' | 'danger' | 'info' =>
  ({ running: 'success', fault: 'danger', offline: 'info' })[s as keyof typeof statusTag] || 'info'

const buildings = ref<Building[]>([])
const buildingName = (id: string) => buildings.value.find(b => b.id === id)?.name ?? '-'

/* ---- 列表:useTable 收敛 分页/搜索/竞态/删空回退(与楼宇页同款) ---- */
const buildingId = ref('')
const typeFilter = ref('')
const statusFilter = ref('')
const { list, loading, total, query, load, reload, search } = useTable<Device>(q =>
  apiDevices({
    ...q,
    buildingId: buildingId.value || undefined,
    type: typeFilter.value || undefined,
    status: statusFilter.value || undefined
  } as never)
)
function onSearch() {
  search()
}
function onReset() {
  buildingId.value = ''
  typeFilter.value = ''
  statusFilter.value = ''
  search()
}

/* ---- 新增/编辑共用弹窗:标题与提交分支由 form.id 区分 ---- */
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = reactive<Partial<Device> & { id?: string }>({})
const rules: FormRules = {
  name: [{ required: true, message: '请输入设备名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
  buildingId: [{ required: true, message: '请选择楼宇', trigger: 'change' }]
}

function openDialog(row?: Device) {
  if (row) {
    // 编辑回填:解构拷贝,避免表单直接改表格行数据(改坏再取消的经典 bug)
    Object.assign(form, { id: row.id, name: row.name, type: row.type, buildingId: row.buildingId })
  } else {
    Object.keys(form).forEach(k => delete form[k as keyof typeof form])
  }
  dialogVisible.value = true
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (form.id) {
      await apiDeviceUpdate(form as never)
      ElMessage.success('修改成功')
    } else {
      await apiDeviceAdd(form as never)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    reload()
  } finally {
    submitting.value = false
  }
}

function onDelete(row: Device) {
  ElMessageBox.confirm(`确认删除「${row.name}」?删除后不可恢复`, '删除确认', { type: 'warning' })
    .then(async () => {
      await apiDeviceDelete(row.id)
      ElMessage.success('已删除')
      reload() // 删空末页时 useTable 自动回退页码
    })
    .catch(() => {})
}

onMounted(async () => {
  // 楼宇下拉数据与设备分页并行加载
  await Promise.all([apiBuildings({ page: 1, limit: 100 }).then(r => (buildings.value = r.list))])
  load()
})
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
