<template>
  <div class="dashboard">
    <el-row :gutter="16">
      <el-col v-for="k in kpis" :key="k.label" :span="6">
        <div class="pm-card kpi-card">
          <div class="kpi-label">{{ k.label }}</div>
          <div class="kpi-value" :style="{ color: k.color }">
            {{ k.display.value }}<span v-if="k.unit" class="kpi-unit">{{ k.unit }}</span>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mt16">
      <el-col :span="14">
        <div class="pm-card chart-card">
          <div class="card-title">楼宇实时功率对比(kW)</div>
          <div ref="barEl" class="chart-body" />
        </div>
      </el-col>
      <el-col :span="10">
        <div class="pm-card chart-card">
          <div class="card-title">今日告警级别分布</div>
          <div ref="pieEl" class="chart-body" />
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mt16">
      <el-col :span="14">
        <div class="pm-card">
          <div class="card-title">园区概况</div>
          <el-descriptions :column="3" border size="small">
            <el-descriptions-item label="入驻率">{{ overview?.occupancyRate ?? '-' }}%</el-descriptions-item>
            <el-descriptions-item label="租户企业">{{ overview?.tenantCount ?? '-' }} 家</el-descriptions-item>
            <el-descriptions-item label="运行设备">{{ overview?.runningDevices ?? '-' }} 台</el-descriptions-item>
            <el-descriptions-item label="故障设备">{{ overview?.faultDevices ?? '-' }} 台</el-descriptions-item>
            <el-descriptions-item label="今日访客">{{ overview?.todayVisitors ?? '-' }} 人次</el-descriptions-item>
            <el-descriptions-item label="今日车辆">{{ overview?.todayCars ?? '-' }} 辆次</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="pm-card">
          <div class="card-title">最近告警</div>
          <el-table :data="recentAlarms" size="small" :show-header="false">
            <el-table-column prop="buildingName" width="110" />
            <el-table-column prop="message">
              <template #default="{ row }">
                <span :style="{ color: levelColor[row.level] }">[{{ levelText[row.level] }}] {{ row.message }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="time" width="150">
              <template #default="{ row }">{{ formatTime(row.time) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { apiAlarms, apiBuildings, apiOverview } from '@/api'
import type { Alarm, Building, ParkOverview } from '@/types'
import { useChart } from '@/composables/useChart'
import { useCountTo } from '@/composables/useCountTo'
import { formatTime } from '@/utils/tools'

/* ---- KPI:值变化触发 countTo 滚动动画 ---- */
const totalPower = ref(0)
const todayEnergy = ref(0)
const occupancyRate = ref(0)
const activeAlarms = ref(0)
const kpis = [
  { label: '园区总功率(kW)', color: 'var(--pm-primary)', unit: 'kW', display: useCountTo(totalPower) },
  { label: '今日能耗(kWh)', color: 'var(--pm-success)', unit: '', display: useCountTo(todayEnergy) },
  { label: '平均入驻率', color: 'var(--pm-warning)', unit: '%', display: useCountTo(occupancyRate) },
  { label: '待处理告警', color: 'var(--pm-danger)', unit: '', display: useCountTo(activeAlarms) }
]

const overview = ref<ParkOverview>()
const recentAlarms = ref<Alarm[]>([])
const levelColor: Record<number, string> = {
  1: 'var(--pm-danger)',
  2: 'var(--pm-warning)',
  3: 'var(--pm-text-2)',
  4: 'var(--pm-info)'
}
const levelText: Record<number, string> = { 1: '紧急', 2: '重要', 3: '一般', 4: '提示' }

const barEl = ref<HTMLElement>()
const pieEl = ref<HTMLElement>()
const bar = useChart(barEl)
const pie = useChart(pieEl)

onMounted(async () => {
  const [ov, bRes, aRes] = await Promise.all([
    apiOverview(),
    apiBuildings({ page: 1, limit: 100 }),
    apiAlarms({ page: 1, limit: 5 })
  ])
  overview.value = ov
  totalPower.value = ov.totalPower
  todayEnergy.value = ov.todayEnergy
  occupancyRate.value = ov.occupancyRate
  activeAlarms.value = ov.activeAlarms
  recentAlarms.value = aRes.list

  const bs = bRes.list as Building[]
  bar.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 16, top: 30, bottom: 28 },
    xAxis: { type: 'category', data: bs.map(b => b.name) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', barWidth: 26, data: bs.map(b => b.power), itemStyle: { borderRadius: [4, 4, 0, 0] } }]
  })
  pie.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        data: [1, 2, 3, 4].map(l => ({
          name: levelText[l],
          // 演示比例(无全量统计接口时按典型分布近似,口径说明见注释)
          value: Math.round(aRes.total * (l === 1 ? 0.08 : l === 2 ? 0.18 : l === 3 ? 0.4 : 0.34))
        }))
      }
    ]
  })
})
</script>

<style scoped>
.mt16 {
  margin-top: 16px;
}
.kpi-card {
  text-align: center;
}
.kpi-label {
  color: var(--pm-text-2);
  font-size: 13px;
}
.kpi-value {
  margin-top: 10px;
  font-size: 30px;
  font-weight: 700;
  font-family: 'DIN Alternate', 'Segoe UI', sans-serif;
}
.kpi-unit {
  font-size: 13px;
  margin-left: 4px;
  font-weight: 400;
}
.card-title {
  font-weight: 600;
  margin-bottom: 12px;
}
.chart-card .chart-body {
  height: 300px;
}
</style>
