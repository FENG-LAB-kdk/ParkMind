<template>
  <!-- 大屏容器:1920×1080 设计稿等比缩放(useScale),居中显示 -->
  <div ref="scaleBox" class="screen-stage">
    <div class="screen" :style="screenStyle">
      <!-- ============ 顶栏 ============ -->
      <header class="s-header">
        <div class="s-title-wrap">
          <h1 class="s-title">ParkMind 智慧园区综合态势大屏</h1>
          <p class="s-subtitle">SMART PARK OPERATION MONITORING</p>
        </div>
        <div class="s-header-right">
          <span class="ws-status" :class="wsStatus">{{ wsStatusText }}</span>
          <span class="clock">{{ clock }}</span>
          <el-button link class="back-btn" @click="$router.push('/admin/dashboard')">← 返回后台</el-button>
          <span class="perf-badge" :class="perfLevel">{{ perfText }}</span>
        </div>
      </header>

      <main class="s-main">
        <!-- ============ 左列:KPI + 功率实时曲线 ============ -->
        <section class="s-col">
          <div class="s-panel s-kpi">
            <div class="panel-title">园区关键指标</div>
            <div class="kpi-grid">
              <KpiCell v-for="k in kpis" :key="k.label" v-bind="k" />
            </div>
          </div>

          <div class="s-panel s-flex1">
            <div class="panel-title">
              园区总功率曲线(实时)
              <div class="panel-actions">
                <el-button size="small" text :type="mode === 'live' ? 'primary' : 'info'" @click="mode = 'live'"
                  >实时</el-button
                >
                <el-button
                  size="small"
                  text
                  :type="mode === 'history' ? 'primary' : 'info'"
                  :loading="historyLoading"
                  @click="loadHistory"
                >
                  10 万点历史 · Worker 降采样
                </el-button>
              </div>
            </div>
            <div ref="powerEl" class="chart-fill" />
          </div>
        </section>

        <!-- ============ 中列:楼宇分布 + 楼宇详情 ============ -->
        <section class="s-col s-col-center">
          <div class="s-panel s-flex1">
            <div class="panel-title">园区楼宇分布(点击查看楼宇详情)</div>
            <div class="map-wrap">
              <svg :viewBox="`0 0 ${MAP_W} ${MAP_H}`" class="map-svg" @click="selectedId = undefined">
                <!-- 底图只画一次:原先放在 v-for 里被重复绘制了 8 遍,而它并不依赖循环变量 -->
                <defs>
                  <pattern id="parkGrid" width="34" height="34" patternUnits="userSpaceOnUse">
                    <path d="M 34 0 L 0 0 0 34" fill="none" stroke="rgba(64,158,255,0.07)" stroke-width="1" />
                  </pattern>
                </defs>
                <!-- 园区底图:纯静态,不进 v-for(原先那个背景 rect 被重复画了 8 遍) -->
                <rect x="0" y="0" :width="MAP_W" :height="MAP_H" fill="url(#parkGrid)" />
                <rect class="park-boundary" x="10" y="10" :width="MAP_W - 20" :height="MAP_H - 20" rx="12" />
                <!-- 一条纵向主路 + 三条横向支路,把 8 栋楼分成 4 个街区 -->
                <rect class="park-road" x="318" y="20" width="44" :height="MAP_H - 40" />
                <rect class="park-road" x="20" y="167" :width="MAP_W - 40" height="34" />
                <rect class="park-road" x="20" y="337" :width="MAP_W - 40" height="34" />
                <rect class="park-road" x="20" y="507" :width="MAP_W - 40" height="34" />
                <MapBuilding
                  v-for="b in buildingPos"
                  :key="b.id"
                  :building="b"
                  :powers="powerMap"
                  :selected="selectedId === b.id"
                  @pick="selectedId = $event"
                />
              </svg>
              <div class="map-legend">
                <span><i class="dot" style="background: #22d3ee" />低功率</span>
                <span><i class="dot" style="background: #f5c542" />中功率</span>
                <span><i class="dot" style="background: #f87171" />高功率</span>
              </div>
            </div>
          </div>

          <!-- 楼宇详情面板:常驻不收起 —— v-if 展开/收起会让上半部分地图容器尺寸跳变,
               整列跟着重排;常驻后地图高度恒定(viewBox 才能与之匹配),图表实例也不必反复重建 -->
          <div class="s-panel s-detail">
            <div class="panel-title">
              {{ selected ? `${selected.name} · 实时功率` : '楼宇详情' }}
              <span class="detail-tags" v-if="selected">
                <el-tag size="small" effect="dark" type="info">{{ typeText(selected.type) }}</el-tag>
                <el-tag size="small" effect="dark" type="warning">入驻率 {{ selected.occupancyRate }}%</el-tag>
              </span>
            </div>
            <div class="detail-body">
              <div ref="detailEl" class="chart-sm" />
              <div v-if="!selected" class="detail-empty">点击上方楼宇,查看该楼实时功率曲线</div>
            </div>
          </div>
        </section>

        <!-- ============ 右列:实时告警流 + 今日统计 ============ -->
        <section class="s-col">
          <div class="s-panel s-flex1">
            <div class="panel-title">
              实时告警(虚拟列表 · 最新置顶)
              <span class="alarm-total">待处理 {{ pendingAlarms }} 条</span>
            </div>
            <AlarmStream :items="stream" :newest-id="newestAlarmId" />
          </div>

          <div class="s-panel s-stats">
            <div class="panel-title">今日园区统计</div>
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-num" style="color: #34d399">{{ visitors }}</span
                ><span class="stat-name">访客(人次)</span>
              </div>
              <div class="stat-item">
                <span class="stat-num" style="color: #f5c542">{{ cars }}</span
                ><span class="stat-name">车辆(辆次)</span>
              </div>
              <div class="stat-item">
                <span class="stat-num" style="color: #a78bfa">{{ tenants }}</span
                ><span class="stat-name">租户企业</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { apiAlarms, apiBuildings, apiEnergyHistory, apiOverview } from '@/api'
import type { Alarm, Building, ParkOverview, WsFrame } from '@/types'
import { useScale } from '@/composables/useScale'
import { useChart } from '@/composables/useChart'
import KpiCell from './components/KpiCell.vue'
import MapBuilding from './components/MapBuilding.vue'
import AlarmStream from './components/AlarmStream.vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useDownsampleWorker } from '@/utils/downsample/useDownsample'
import { createPerfMonitor } from '@/utils/perf-monitor'
import { formatTime } from '@/utils/tools'

/* ========== 一、等比缩放容器(1920×1080 设计稿) ========== */
const { container: scaleBox, screenStyle } = useScale(1920, 1080)

/* ========== 二、时钟 + WS 状态 ========== */
const clock = ref('')
const tickTimer = setInterval(() => (clock.value = formatTime(Date.now())), 1000)

const wsStatus = ref<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting')
const wsStatusText = computed(
  () => ({ connecting: '连接中', open: '实时已连接', reconnecting: '重连中…', closed: '已断开' })[wsStatus.value]
)

/* ========== 三、KPI(数字翻牌) ========== */
const totalPower = ref(0)
const todayEnergy = ref(0)
const occupancyRate = ref(0)
const runningDevices = ref(0)
// 只收集值,翻牌动画下沉到子组件 —— 否则 rAF 每帧写 display 会触发整屏重渲染(见 KpiCell)
const kpis = computed(() => [
  { label: '总功率 kW', color: '#22d3ee', value: totalPower.value },
  { label: '今日能耗 kWh', color: '#34d399', value: todayEnergy.value },
  { label: '平均入驻率 %', color: '#f5c542', value: occupancyRate.value },
  { label: '运行设备 台', color: '#a78bfa', value: runningDevices.value }
])

/* ========== 四、楼宇分布(SVG 私有坐标 —— 园区平面图是私有坐标系,自绘比地图 SDK 轻且可控) ========== */
/* 园区平面图私有坐标系。
 * 关键:viewBox 的宽高比要贴近容器实际比例,否则 SVG 的 preserveAspectRatio
 * 默认按 meet 缩放 —— 内容会被信箱化(缩成中间一条、上下大片留白)。
 * 中心列宽约 670(1920 三列 1:1.25:1 扣掉间隙与内边距),
 * 地图区高度约 710(详情面板已改为常驻,所以这个高度是恒定的)。
 * 【设计要点】SVG 是矢量,但一样受 preserveAspectRatio 支配;想"铺满不变形",
 * 只能让 viewBox 比例 = 容器比例(拉伸变形不可取)。 */
const MAP_W = 680
const MAP_H = 710
const buildings = ref<Building[]>([])
const selectedId = ref<string>()
const selected = computed(() => buildings.value.find(b => b.id === selectedId.value))
/** 实时功率字典 —— 与布局脱钩的"高频通道"。
 *  reactive 的依赖精确到 key:写 powerMap['b3'] 只会唤醒订阅了 b3 的那个子组件。
 *  (原先的做法是就地改 buildings[i].power,那会让读到它的整个大屏 render effect 全量重跑) */
const powerMap = reactive<Record<string, number>>({})

/** 楼宇 → 画布坐标(静态布局,构建期算好)
 *  只读 id/name/type 这类**不变字段**,绝不在这里读 power ——
 *  power 每秒都在变,读它等于给整个大屏组件挂上 8Hz 的重渲染 */
const buildingPos = computed(() =>
  buildings.value.map((b, i) => {
    // 2 列 × 4 行:与竖长的地图面板比例相称(4×2 的横排在这个容器里会被压得很小)
    const col = i % 2
    const row = Math.floor(i / 2)
    return {
      id: b.id,
      name: b.name,
      type: b.type,
      x: 50 + col * 320,
      y: 35 + row * 170,
      w: 260,
      h: 130
    }
  })
)
const typeText = (t: string) => ({ office: '办公', commercial: '商业', industrial: '工业', warehouse: '仓储' })[t] || t
/** 注:原先这里有两个函数 —— heatColor(楼宇热力着色)与 onMapClick(手算坐标做命中检测)。
 *  前者随渲染粒度下沉进了 MapBuilding 组件;
 *  后者被**事件委托**取代:每栋楼自己监听 click 并 .stop,点空白则由 <svg> 兜底取消选中。
 *  这比手算坐标可靠得多 —— 外层有 useScale 的 transform: scale()、SVG 内部还有 viewBox
 *  与 preserveAspectRatio 的信箱留白,手算比例在偏离中心时会算错、选错楼。 */

/* ========== 五、功率曲线图表(useChart:自动 resize/主题/销毁) ========== */
const mode = ref<'live' | 'history'>('live')
const powerEl = ref<HTMLElement>()
// 显式指定 'screen' 主题(见 config/echartsTheme.ts):大屏是固定深色场景,
// 不该跟随后台的亮/暗换肤 —— 不指定的话图表会套用全局 light 主题,tooltip 是白底
const powerChart = useChart(powerEl, 'screen')
/** 总功率实时窗口(最多 180 帧,3 分钟)
 *  刻意不用 ref:这份数据只在 renderLoop 内部消费,模板从不读它 ——
 *  套上响应式只会让每个点都被 Proxy 包一层,push/shift 全是代理开销 */
const LIVE_CAP = 180
const livePoints: Array<{ x: number; y: number }> = []
const detailEl = ref<HTMLElement>()
const detailChart = useChart(detailEl, 'screen')

// 详情面板已改为常驻,图表实例不再需要跟着 v-if 重建/销毁 ——
// 这里只需在切换楼宇时把曲线重画一次(该楼的数据要先由 energy 帧积起来,首帧可能为空)
watch(selected, () => renderDetailChart())

// 从历史切回实时:立刻重下静态配置并补画一帧,
// 否则要等下一次 renderLoop(最多 1 秒)画面才回来,点按钮像没反应
watch(mode, m => {
  if (m !== 'live') return
  liveInited = false
  renderPowerChart()
})
/** 选中楼宇实时窗口(每楼宇独立 600 帧) */
const buildingSeries = new Map<string, Array<{ x: number; y: number }>>()

function pushEnergy(buildingId: string, ts: number, power: number) {
  const arr = buildingSeries.get(buildingId) ?? []
  arr.push({ x: ts, y: power })
  if (arr.length > 600) arr.shift()
  buildingSeries.set(buildingId, arr)
}

/** 静态配置(坐标轴/网格/样式)只在初始化和"从历史切回实时"时下一次 */
let liveInited = false
function initLiveOption() {
  liveInited = true
  powerChart.setOption({
    animation: false,
    tooltip: { trigger: 'axis' },
    grid: { left: 56, right: 16, top: 18, bottom: 26 },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#7fb3e8' },
      splitLine: { lineStyle: { color: 'rgba(64,158,255,0.12)' } }
    },
    yAxis: {
      type: 'value',
      name: 'kW',
      axisLabel: { color: '#7fb3e8' },
      splitLine: { lineStyle: { color: 'rgba(64,158,255,0.12)' } }
    },
    series: [
      {
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1.6, color: '#22d3ee' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(34,211,238,0.35)' },
              { offset: 1, color: 'rgba(34,211,238,0.02)' }
            ]
          }
        },
        data: []
      }
    ]
  })
}

/** 每秒只送 series.data。
 *  setOption 默认是**深合并**:重送整棵 option 树要遍历合并所有分支,而其中
 *  坐标轴、样式每秒都没变 —— 只传变化的那一支,开销就只剩一次数据替换。 */
function renderPowerChart() {
  if (!liveInited) return initLiveOption()
  powerChart.setOption({ series: [{ data: livePoints.map(p => [p.x, p.y] as [number, number]) }] })
}

/* ========== 六、10 万点历史 + Worker 降采样(大数据曲线演示) ========== */
const historyLoading = ref(false)
const { downsample } = useDownsampleWorker()

async function loadHistory() {
  historyLoading.value = true
  try {
    const buildingId = selectedId.value ?? 'b1'
    const raw = await apiEnergyHistory(buildingId, 300, 100000) // 10 万点(约 1MB JSON)
    const t0 = performance.now()
    const pts = await downsample(raw, 1200) // Worker 降采样 → 1200 点
    const cost = Math.round(performance.now() - t0)
    // 数据就绪后才切模式:写在 await 之前的话,请求+降采样的 1~2 秒内曲线是空的
    mode.value = 'history'
    liveInited = false // 历史模式以 notMerge 整体替换过配置,切回实时时要重下静态配置
    const seriesData = pts.map(p => [p.x, p.y] as [number, number])
    powerChart.setOption(
      {
        animation: false,
        grid: { left: 56, right: 16, top: 18, bottom: 26 },
        xAxis: { type: 'time', axisLabel: { color: '#7fb3e8' } },
        yAxis: { type: 'value', name: 'kW', axisLabel: { color: '#7fb3e8' } },
        tooltip: { trigger: 'axis' },
        series: [
          {
            type: 'line',
            showSymbol: false,
            lineStyle: { width: 1, color: '#34d399' },
            data: seriesData,
            name: `降采样后 ${seriesData.length} 点`
          }
        ]
      },
      true
    )
    ElMessageBox.alert(
      `数据源:${raw.length.toLocaleString()} 个原始采样点\nLTTB 降采样后:${pts.length} 点(仅保留视觉关键点)\nWorker 计算耗时:${cost}ms,期间页面零卡顿`,
      'Worker 降采样完成',
      { confirmButtonText: '好' }
    )
  } finally {
    historyLoading.value = false
  }
}

/* ========== 七、实时告警流(useVirtualList:十万级种子 + ws 实时插入) ========== */
const pendingAlarms = ref(0)
/** 告警流容量:一次拉 3000 条,真实体现虚拟列表的价值
 *  (只渲染可视区 ~26 行;退化成百来条的话,虚拟滚动和普通 v-for 看不出差别) */
const STREAM_CAP = 3000
const stream = ref<Alarm[]>([])
// 顶层解构:模板中自动解包 computed(嵌套在对象里的 ref 不会自动解包,是常见坑)
/** 最新一条告警的 id:用于给"刚到达的那一行"加一次入场高亮(见 AlarmStream) */
const newestAlarmId = ref('')
let newestTimer: ReturnType<typeof setTimeout> | null = null

function pushAlarm(a: Alarm) {
  // 原地增删而非整体重建数组:批量少一次内存拷贝,也让虚拟列表的前缀和缓存
  // 因"行数不变"直接命中(见 useVirtualList 的缓存机制说明)
  stream.value.unshift(a)
  if (stream.value.length > STREAM_CAP) stream.value.pop()
  // 只让最新一行闪一次 —— 全屏唯一的动态焦点,平均 0.2 次/秒,开销可忽略
  newestAlarmId.value = a.id
  if (newestTimer) clearTimeout(newestTimer)
  newestTimer = setTimeout(() => {
    if (newestAlarmId.value === a.id) newestAlarmId.value = ''
  }, 1500)
}

/* ========== 八、今日统计 ========== */
const visitors = ref(0)
const cars = ref(0)
const tenants = ref(0)

/* ========== 九、WS 实时链路 + seq 补偿(核心) ========== */
const { connect } = useWebSocket({
  url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
  heartbeat: 8000,
  onMessage(frame: WsFrame) {
    wsStatus.value = 'open'
    switch (frame.type) {
      case 'energy': {
        const d = frame.data as { buildingId: string; ts: number; power: number }
        pushEnergy(d.buildingId, d.ts, d.power)
        // 高频功率写进独立字典,不回写 buildings:写 buildings 会让读到它的
        // 整个大屏 render effect 重跑,写字典只唤醒订阅该 key 的那一栋楼
        powerMap[d.buildingId] = d.power
        powerDirty = true
        // 只有当前选中楼宇的数据才需要重画详情图
        if (d.buildingId === selectedId.value) detailDirty = true
        break
      }
      case 'overview': {
        const d = frame.data as ParkOverview
        todayEnergy.value = d.todayEnergy
        occupancyRate.value = d.occupancyRate
        runningDevices.value = d.runningDevices
        pendingAlarms.value = d.activeAlarms
        visitors.value = d.todayVisitors
        cars.value = d.todayCars
        tenants.value = d.tenantCount
        break
      }
      case 'alarm': {
        pushAlarm(frame.data as Alarm)
        pendingAlarms.value++
        break
      }
      case 'sync':
        break
    }
  },
  onStatus(s) {
    wsStatus.value = s
  }
})

/* ========== 十、性能探针(自研 FPS/长任务/堆监控 → 右下角标) ========== */
const perfText = ref('')
const perfLevel = ref<'good' | 'warn' | 'bad'>('good')
let perfStop: { stop: () => void } | null = null
function startPerfMonitor() {
  perfStop = createPerfMonitor(s => {
    perfLevel.value = s.fps >= 50 ? 'good' : s.fps >= 30 ? 'warn' : 'bad'
    perfText.value = `${s.fps}fps · 掉帧${s.dropped} · 长任务${s.longTasks} · 堆${s.jsHeapMB}MB`
  })
}

/* ========== 汇总:帧驱动渲染 + 图表刷新节奏 ========== */
/** 脏标记:把"数据更新"与"画面重绘"解耦 —— 没有新数据就不重绘
 *  (WS 断线时循环照跑,但不会拿同一份数据反复 setOption) */
let powerDirty = false
let detailDirty = false

function renderLoop() {
  // 总览:每 1s 由各楼宇 energy 帧求和 —— 与后台报表同一口径
  const now = Date.now()
  let sum = 0
  for (const id in powerMap) sum += powerMap[id] // 与地图/详情同源的功率口径

  // 采集始终进行(历史模式、页面切到后台期间也采点),切回来时曲线才不断档
  livePoints.push({ x: now, y: sum })
  if (livePoints.length > LIVE_CAP) livePoints.shift()
  totalPower.value = Math.round(sum)

  // 页面不可见时直接返回:浏览器已经暂停 rAF,重绘只会白排队
  if (document.hidden) return

  // 历史模式由 loadHistory 独占绘制 —— 否则这里每秒会把刚画好的降采样曲线覆盖成空
  if (powerDirty && mode.value === 'live') {
    powerDirty = false
    renderPowerChart()
  }

  if (detailDirty && selected.value) {
    detailDirty = false
    renderDetailChart()
  }
}

/** 详情小曲线:数据量小(≤600 点),静态配置与数据一次给全。
 *  保持"最后一次 setOption 是全量 option"还有个额外好处 ——
 *  useChart.reinit() 重建实例后要靠重放它来避免白板(见 useChart 注释)。 */
function renderDetailChart() {
  if (!selected.value) return
  const arr = buildingSeries.get(selected.value.id) ?? []
  const detailSeries = arr.map(p => [p.x, p.y] as [number, number])
  detailChart.setOption({
    animation: false,
    grid: { left: 48, right: 10, top: 12, bottom: 22 },
    xAxis: { type: 'time', axisLabel: { color: '#7fb3e8', fontSize: 10 } },
    yAxis: {
      type: 'value',
      name: 'kW',
      nameTextStyle: { color: '#7fb3e8', fontSize: 10 },
      axisLabel: { color: '#7fb3e8', fontSize: 10 }
    },
    series: [{ type: 'line', showSymbol: false, lineStyle: { width: 1.5, color: '#f5c542' }, data: detailSeries }]
  })
}

/* ========== 初始化 ========== */
onMounted(async () => {
  connect() // 建立实时链路(心跳 8s,断线指数退避重连,seq 补偿见 useWebSocket)
  // REST 初值 + 最近告警 + WS 同步建立(楼宇列表先行,其余并行)
  await apiBuildingsAll()
  const [ov, aRes] = await Promise.all([apiOverview(), apiAlarms({ page: 1, limit: STREAM_CAP })])
  const ov2 = ov
  todayEnergy.value = ov2.todayEnergy
  occupancyRate.value = ov2.occupancyRate
  runningDevices.value = ov2.runningDevices
  visitors.value = ov2.todayVisitors
  cars.value = ov2.todayCars
  tenants.value = ov2.tenantCount
  pendingAlarms.value = ov2.activeAlarms
  stream.value = aRes.list
  renderPowerChart() // 首帧占位绘制(空数据也先立坐标轴)

  const timer = setInterval(renderLoop, 1000)
  cleanup.push(() => clearInterval(timer))
  startPerfMonitor()
})

async function apiBuildingsAll() {
  const res = await apiBuildings({ page: 1, limit: 100 })
  buildings.value = res.list as Building[]
  // REST 初值灌入功率字典(此后由 WS 的 energy 帧高频更新)
  res.list.forEach(b => {
    powerMap[b.id] = b.power
  })
  return res
}

const cleanup: Array<() => void> = []
onBeforeUnmount(() => {
  clearInterval(tickTimer)
  if (newestTimer) clearTimeout(newestTimer)
  cleanup.forEach(fn => fn())
  perfStop?.stop()
})
</script>

<style scoped>
/* ---- 舞台:全屏深色容器 ---- */
.screen-stage {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: radial-gradient(ellipse at 50% -20%, #0b2a5c 0%, #050d1f 60%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.screen {
  position: relative;
  color: var(--screen-text-main);
  font-family: 'DIN Alternate', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  user-select: none;
}
/* 扫描线:纯 CSS 一条重复渐变,绘制一次后不再重绘(必须静态 ——
 * JS 驱动的动态扫描线会让整个屏幕每秒重绘,得不偿失)。
 * 亮度压得很低(等效约 2.5%),再高就像显示器坏了。 */
.screen-stage::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 4px);
  opacity: 0.5;
}

/* ---- 顶栏 ---- */
.s-header {
  height: 84px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  background: linear-gradient(180deg, rgba(13, 38, 76, 0.9), transparent);
}
.s-title {
  font-size: 34px;
  letter-spacing: 6px;
  background: linear-gradient(90deg, #e0f2fe, #7dd3fc 60%, #a5b4fc);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.s-subtitle {
  font-size: 11px;
  letter-spacing: 4px;
  color: var(--screen-text-sub);
  margin-top: 4px;
}
.s-header-right {
  display: flex;
  align-items: center;
  gap: 18px;
  color: var(--screen-text-sub);
  font-size: 14px;
}
.ws-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ws-status::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #64748b;
}
.ws-status.open::before {
  background: #34d399;
  box-shadow: 0 0 8px #34d399;
}
.ws-status.reconnecting::before,
.ws-status.connecting::before {
  background: #f5c542;
  animation: blink 1s infinite;
}
@keyframes blink {
  50% {
    opacity: 0.2;
  }
}
.clock {
  font-size: 18px;
  letter-spacing: 1px;
  color: var(--screen-text-main);
  font-variant-numeric: tabular-nums;
}
.back-btn {
  color: var(--screen-text-sub);
}
.perf-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 3px;
  border: 1px solid;
  font-family: Consolas, monospace;
}
.perf-badge.good {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.4);
}
.perf-badge.warn {
  color: #f5c542;
  border-color: rgba(245, 197, 66, 0.4);
}
.perf-badge.bad {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.4);
}

/* ---- 主体三列 ---- */
.s-main {
  height: calc(100% - 84px);
  display: grid;
  grid-template-columns: 1fr 1.25fr 1fr;
  gap: 18px;
  padding: 0 26px 22px;
}
.s-col {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
}

/* ---- 面板通用 ---- */
.s-panel {
  background: var(--screen-bg-panel);
  border: 1px solid var(--screen-border);
  border-radius: 8px;
  padding: 14px 16px;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* 注:这里原本有 backdrop-filter: blur(2px)。已移除 ——
 * 7 个面板各多一层离屏合成,叠在整屏 transform: scale 与两个每秒重绘的 canvas 上,
 * 是整页最大的 GPU 开销;而面板背后是本页自己的静态渐变,模糊它几乎零视觉收益。
 * 去掉后把 --screen-bg-panel 的 alpha 从 0.55 提到 0.72 补偿通透感。 */
/* 四角 L 形角标:大屏辨识度最高的一个符号。
 * 实现:一个伪元素 + 8 层实色渐变背景,每层就是一条 14×2 或 2×14 的小色带,
 * 靠 background-position 摆到四个角拼出 L —— 零额外 DOM、零 JS、绘制一次后不再变。
 * (原先只画了左上角一个角) */
.s-panel::before {
  content: '';
  position: absolute;
  inset: -1px;
  pointer-events: none;
  background-image:
    linear-gradient(var(--screen-accent), var(--screen-accent)),
    linear-gradient(var(--screen-accent), var(--screen-accent)),
    linear-gradient(var(--screen-accent), var(--screen-accent)),
    linear-gradient(var(--screen-accent), var(--screen-accent)),
    linear-gradient(var(--screen-accent), var(--screen-accent)),
    linear-gradient(var(--screen-accent), var(--screen-accent)),
    linear-gradient(var(--screen-accent), var(--screen-accent)),
    linear-gradient(var(--screen-accent), var(--screen-accent));
  background-repeat: no-repeat;
  background-size:
    14px 2px,
    2px 14px,
    14px 2px,
    2px 14px,
    14px 2px,
    2px 14px,
    14px 2px,
    2px 14px;
  background-position:
    left top,
    left top,
    right top,
    right top,
    left bottom,
    left bottom,
    right bottom,
    right bottom;
}
.panel-title {
  font-size: 15px;
  letter-spacing: 2px;
  color: var(--screen-text-main);
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.panel-actions {
  display: flex;
  gap: 4px;
}
.chart-fill {
  flex: 1;
  min-height: 0;
}
.s-flex1 {
  flex: 1;
  min-height: 0;
}

/* ---- KPI ---- */
.s-kpi {
  flex-shrink: 0;
}
.kpi-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* ---- 楼宇地图 ---- */
.map-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
}
.map-svg {
  width: 100%;
  height: 100%;
}
/* 园区底图:纯静态填充,不进 v-for、不做动画 —— 一次绘制后长期不变 */
.park-boundary {
  fill: none;
  stroke: var(--screen-border);
  stroke-dasharray: 6 6;
}
.park-road {
  fill: rgba(64, 158, 255, 0.06);
}
.map-legend {
  position: absolute;
  right: 6px;
  bottom: 4px;
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--screen-text-sub);
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 4px;
}

/* ---- 楼宇详情 ---- */
.s-detail {
  flex-shrink: 0;
  height: 170px;
}
.detail-tags {
  display: flex;
  gap: 6px;
}
/* 图表与空态占同一块区域:空态绝对定位浮在上面,不参与布局(否则会有 0 宽度的图表初始化问题) */
.detail-body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.detail-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--screen-text-sub);
  font-size: 13px;
  letter-spacing: 1px;
}
.chart-sm {
  width: 100%;
  height: 100%;
}

.alarm-total {
  font-size: 12px;
  color: #fbbf24;
  font-weight: 400;
}

/* ---- 今日统计 ---- */
.s-stats {
  flex-shrink: 0;
}
.stats-grid {
  display: flex;
  justify-content: space-around;
  padding: 6px 0;
}
.stat-item {
  text-align: center;
}
.stat-num {
  font-size: 26px;
  font-weight: 700;
  /* Bahnschrift 是 Windows 自带的 DIN 风格字体:
   * 'DIN Alternate' 只有 macOS 有,缺了它这里会回退到比例数字,每秒跳动时宽度会抖 */
  font-family: 'DIN Alternate', 'Bahnschrift', Consolas, sans-serif;
  font-variant-numeric: tabular-nums;
  display: block;
}
.stat-name {
  font-size: 12px;
  color: var(--screen-text-sub);
}
</style>
