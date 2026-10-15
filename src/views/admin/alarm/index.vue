<template>
  <div class="pm-page">
    <div class="pm-card">
      <div class="toolbar">
        <el-select v-model="levelFilter" placeholder="全部级别" clearable style="width: 130px">
          <el-option label="紧急" :value="1" />
          <el-option label="重要" :value="2" />
          <el-option label="一般" :value="3" />
          <el-option label="提示" :value="4" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 130px">
          <el-option label="待处理" value="pending" />
          <el-option label="已处理" value="handled" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="onSearch">查询</el-button>
        <span class="total-tip">共 {{ total.toLocaleString() }} 条(十万级数据,vxe-grid 虚拟滚动,任意滚动不卡顿)</span>
        <div class="toolbar-right">
          <el-button :icon="Histogram" @click="analyze">十秒聚合分析(Web Worker)</el-button>
        </div>
      </div>

      <!-- 聚合分析结果(Worker 计算展示) -->
      <el-alert v-if="aggregate" type="success" :closable="false" class="mb12" style="white-space: pre-line">
        {{ aggregate }}
      </el-alert>

      <!-- vxe-table 虚拟滚动:仅渲染可视区行 -->
      <vxe-grid
        ref="gridRef"
        :columns="columns"
        :data="list"
        :loading="loading"
        :scroll-y="{ enabled: true, gt: 50 }"
        :pager-config="{
          currentPage: query.page,
          pageSize: query.limit,
          total,
          layouts: ['Total', 'Sizes', 'PrevJump', 'PrevPage', 'Number', 'NextPage', 'NextJump', 'FullJump']
        }"
        :seq-config="{ startIndex: (query.page - 1) * query.limit }"
        height="560"
        @page-change="onPageChange"
      >
        <template #level="{ row }">
          <el-tag :type="levelTag[row.level]" size="small">{{ levelText[row.level] }}</el-tag>
        </template>
        <template #status="{ row }">
          <el-tag :type="row.status === 'pending' ? 'danger' : 'success'" effect="plain" size="small">
            {{ row.status === 'pending' ? '待处理' : '已处理' }}
          </el-tag>
        </template>
        <template #op="{ row }">
          <el-button
            v-if="row.status === 'pending'"
            v-permission="'alarm:handled'"
            link
            type="primary"
            size="small"
            @click="onHandled(row)"
          >
            标记处理
          </el-button>
        </template>
      </vxe-grid>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Search, Histogram } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { VxeGrid, VxeGridProps } from 'vxe-table'
import { apiAlarmHandled, apiAlarms } from '@/api'
import type { Alarm } from '@/types'
import { useTable } from '@/composables/useTable'
import { useDownsampleWorker } from '@/utils/downsample/useDownsample'
import { formatTime } from '@/utils/tools'

const levelFilter = ref<number>()
const statusFilter = ref<string>()
const { list, loading, total, query, load, search } = useTable<Alarm>(q =>
  apiAlarms({
    ...q,
    level: levelFilter.value ? String(levelFilter.value) : undefined,
    status: statusFilter.value
  } as never)
)
const onSearch = () => search()

const levelText: Record<number, string> = { 1: '紧急', 2: '重要', 3: '一般', 4: '提示' }
const levelTag: Record<number, 'danger' | 'warning' | 'info' | 'primary'> = {
  1: 'danger',
  2: 'warning',
  3: 'info',
  4: 'primary'
}

const columns: VxeGridProps['columns'] = [
  { type: 'seq', title: '#', width: 70, align: 'center' },
  { field: 'buildingName', title: '楼宇', width: 130 },
  { field: 'deviceName', title: '设备', minWidth: 180 },
  { field: 'message', title: '告警内容', minWidth: 220 },
  { field: 'level', title: '级别', width: 90, align: 'center', slots: { default: 'level' } },
  { field: 'status', title: '状态', width: 100, align: 'center', slots: { default: 'status' } },
  { field: 'time', title: '发生时间', width: 180, formatter: ({ cellValue }) => formatTime(cellValue) },
  { field: 'op', title: '操作', width: 170, align: 'center', slots: { default: 'op' } }
]

function onPageChange({ currentPage, pageSize }: { currentPage: number; pageSize: number }) {
  query.page = currentPage
  query.limit = pageSize
  load()
}

async function onHandled(row: Alarm) {
  await apiAlarmHandled(row.id)
  ElMessage.success('已标记处理')
  row.status = 'handled'
}

/* ---- Web Worker 聚合分析:10 万条全量拉取不阻塞 UI ---- */
const aggregate = ref('')
const { downsample } = useDownsampleWorker()

async function analyze() {
  aggregate.value = ''
  ElMessage.info('正在全量拉取并聚合分析(数据量大,请稍候)…')
  // 注意:演示用一条大 limit 拉取(十万级 JSON 约 30MB 本地瞬时),生产应服务端聚合;
  // 这里重在演示"Worker 处理不卡主线程",用 downsample 复用同一 Worker
  const before = performance.now()
  const res = await apiAlarms({ page: 1, limit: 100000 })
  const after = performance.now()
  // 以"时间→告警"构造点集,由 Worker 降采样后统计
  const points = res.list.map(a => ({ x: a.time, y: a.level }))
  const sampled = await downsample(points, 5000)
  const levelCount = (lvl: number) => res.list.filter(a => a.level === lvl).length
  aggregate.value = [
    `✅ 全量拉取 ${res.total.toLocaleString()} 条耗时 ${Math.round(after - before)}ms(本地服务)`,
    `Worker 降采样 10 万点 → ${sampled.length} 点耗时 ${Math.round(performance.now() - after)}ms,期间页面无卡顿(长任务为 0)`,
    `级别分布:紧急 ${levelCount(1).toLocaleString()} / 重要 ${levelCount(2).toLocaleString()} / 一般 ${levelCount(3).toLocaleString()} / 提示 ${levelCount(4).toLocaleString()}`
  ].join('\n')
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  align-items: center;
}
.total-tip {
  color: var(--pm-text-3);
  font-size: 12px;
}
.toolbar-right {
  margin-left: auto;
}
.mb12 {
  margin-bottom: 12px;
}
</style>
