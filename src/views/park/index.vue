<template>
  <div class="park-page">
    <!-- 顶栏:标题 + 面包屑下钻路径 -->
    <header class="park-header">
      <div class="ph-left">
        <h1>全国园区分布</h1>
        <p>PARK DISTRIBUTION OVERVIEW</p>
      </div>
      <div class="ph-crumb">
        <span
          v-for="(lv, i) in levels"
          :key="lv.code ?? 'china'"
          class="crumb"
          :class="{ active: i === levels.length - 1 }"
          @click="backTo(i)"
        >
          {{ lv.name }}<b v-if="i < levels.length - 1"> ›</b>
        </span>
      </div>
      <div class="ph-stats">
        <span class="phs"
          ><b>{{ stats.total }}</b> 园区</span
        >
        <span class="phs"
          ><b>{{ stats.devices.toLocaleString() }}</b> 设备</span
        >
        <span class="phs"
          ><b :class="{ warn: stats.alarms > 100 }">{{ stats.alarms }}</b> 今日告警</span
        >
      </div>
      <el-button link class="ph-back" @click="$router.push('/admin/dashboard')">← 返回后台</el-button>
    </header>

    <main class="park-main">
      <!-- 左:地图 -->
      <section class="park-map-panel">
        <div ref="mapEl" class="park-map" />
        <div v-if="mapLoading" class="map-loading"><i class="spin" />地图加载中…</div>
        <!-- 图例:规模分级(与后端同一口径) -->
        <div class="map-legend">
          <span><i class="lg-dot large" />大型 ≥{{ scale.large }}</span>
          <span><i class="lg-dot medium" />中型 ≥{{ scale.medium }}</span>
          <span><i class="lg-dot small" />小型</span>
        </div>
      </section>

      <!-- 右:联动面板 -->
      <aside class="park-side">
        <!-- 选中园区:详情卡片 -->
        <div v-if="selected" class="side-card">
          <div class="sc-title">{{ selected.name }}</div>
          <div class="sc-sub">{{ selected.province }} · {{ selected.city }}</div>
          <div class="sc-grid">
            <div class="sc-item">
              <b>{{ selected.devices.toLocaleString() }}</b>
              <span>设备总数</span>
            </div>
            <div class="sc-item">
              <b :class="{ warn: selected.alarms > 20 }">{{ selected.alarms }}</b>
              <span>今日告警</span>
            </div>
            <div class="sc-item">
              <b>{{ selected.occupancy }}%</b>
              <span>入驻率</span>
            </div>
            <div class="sc-item">
              <b>{{ scaleText(selected.devices) }}</b>
              <span>规模</span>
            </div>
          </div>
          <div class="sc-close" @click="clearSelection">取消选中</div>
        </div>

        <!-- 未选中:全国态势统计 -->
        <div v-else class="side-card">
          <div class="sc-title">全国态势</div>
          <div class="sc-grid">
            <div class="sc-item">
              <b>{{ stats.total }}</b>
              <span>园区总数</span>
            </div>
            <div class="sc-item">
              <b>{{ stats.devices.toLocaleString() }}</b>
              <span>设备总量</span>
            </div>
            <div class="sc-item">
              <b :class="{ warn: stats.alarms > 100 }">{{ stats.alarms }}</b>
              <span>今日告警</span>
            </div>
            <div class="sc-item">
              <b>{{ stats.provinces }}</b>
              <span>覆盖省份</span>
            </div>
          </div>
          <div class="sc-hint">点击地图上的园区查看详情</div>
        </div>

        <!-- 当前视图园区列表(小字) -->
        <div class="side-list">
          <div class="sl-title">当前视图 · {{ visibleParks.length }} 个园区</div>
          <div
            v-for="p in visibleParks"
            :id="`park-row-${p.id}`"
            :key="p.id"
            class="sl-row"
            :class="{ active: selected?.id === p.id }"
            @click="selectPark(p)"
          >
            <i class="sl-dot" :style="{ background: scaleColor(p.devices) }" />
            <span class="sl-name">{{ p.name }}</span>
            <span class="sl-val">{{ p.devices }}</span>
          </div>
          <!-- 空态:该区域没有园区时给明确提示,而不是一片空白(可点面包屑返回) -->
          <div v-if="!visibleParks.length" class="sl-empty">
            该区域暂无园区<br />
            <span>点击上方面包屑返回上级</span>
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { registerMap } from 'echarts/core'
import { ElMessage } from 'element-plus'
import { apiParkList, apiParkProvinceStats, apiParkScale } from '@/api'
import type { ParkInfo, ParkScale } from '@/types'
import { useChart } from '@/composables/useChart'

/**
 * 园区分布 —— 全国园区地图(ECharts + GeoJSON 三级下钻)
 *
 * 【这一页的定位】"实用的 GIS 功能"而不是"炫技的 3D":
 * 真实业务里,集团管理层需要一眼看到"全国园区分布与运营态势",
 * 点省份能钻下去看某个区域,点园区能联动看详情 —— 这是数据大屏最常见的
 * 地图模式(借鉴公司项目的"数据中心态势地图"与"中国地图下钻")。
 *
 * 【下钻的本质】三件事:
 *   ① 行政区划的层级关系(adcode:省 = 前2位+0000,市 = 前4位+00)
 *   ② 点区域 → 加载下一级 GeoJSON → registerMap → setOption 替换
 *   ③ 历史栈(面包屑)记录层级,支持返回
 *
 * 【为什么 GeoJSON 放本地】三级地图 569KB + 70KB + 76KB,
 * 按需加载(进页面只拉全国,下钻才拉省/市)比一次全下更合理;
 * 且本地文件无跨域、无第三方依赖风险(DataV 线上接口可能 403)。
 */

const mapEl = ref<HTMLElement>()
const mapLoading = ref(false)
const selected = ref<ParkInfo | null>(null)
const scale = ref<ParkScale>({ large: 2000, medium: 800 })
const parks = ref<ParkInfo[]>([])
const provinceStats = ref<Record<string, number>>({})

/* ---- 下钻层级栈:levels[i] = { name, code, mapName } ---- */
const levels = ref<Array<{ name: string; code: number | null }>>([{ name: '中国', code: null }])

/** 当前视图的园区(按层级过滤)。
 *  层级判定以"尾数是否为 0000"为准:省级(610000/110000)匹配前 2 位,
 *  市级(610100)匹配前 4 位 —— 直辖市(110000)也是省级,不能按位数判断 */
const visibleParks = computed(() => {
  const code = levels.value[levels.value.length - 1].code
  if (!code) return parks.value // 全国视图
  const prefix = code % 10000 === 0 ? String(code).slice(0, 2) : String(code).slice(0, 4)
  return parks.value.filter(p => String(p.adcode).slice(0, prefix.length) === prefix)
})

/**
 * 当前视图的区域着色数据:有园区的区域按数量亮色分档,无园区的保持暗色。
 * 这样"哪些区域有园区"一眼可见 —— 也解决了"地图信息量不足"的问题
 * (20 个园区只覆盖 15 个省,纯灰色地图会显得空旷)。
 */
const regionData = computed(() => {
  const level = levels.value[levels.value.length - 1]
  const code = level.code
  if (!code) return provinceStats.value // 全国视图:直接用接口下发的省统计
  // 省/市视图:按当前园区列表就地聚合(省视图 → 各市数量;市视图 → 空,城市自身亮起)
  const isCity = code % 10000 !== 0
  const count: Record<string, number> = {}
  visibleParks.value.forEach(p => {
    const key = isCity ? p.city : p.name
    count[key] = (count[key] || 0) + 1
  })
  return count
})

const stats = computed(() => ({
  total: parks.value.length,
  devices: parks.value.reduce((s, p) => s + p.devices, 0),
  alarms: parks.value.reduce((s, p) => s + p.alarms, 0),
  provinces: new Set(parks.value.map(p => p.province)).size
}))

function scaleText(devices: number) {
  return devices >= scale.value.large ? '大型' : devices >= scale.value.medium ? '中型' : '小型'
}
function scaleColor(devices: number) {
  return devices >= scale.value.large ? '#f5c542' : devices >= scale.value.medium ? '#22d3ee' : '#7fb3e8'
}

/* ==================== GeoJSON 加载与缓存 ==================== */
const geoCache = new Map<number, unknown>()
/** 已注册过的地图名:registerMap 会重新处理整个 GeoJSON(慢),同名只注册一次 */
const registeredMaps = new Set<string>()
/** 区域名 → adcode 的映射:从 GeoJSON 自身的 features 里现取,不硬编码 */
const nameToCode = new Map<string, number>()

/** 加载 + 注册一步到位。registerMap 是"点一下卡 1-2 秒"的真凶:
 *  它要把 GeoJSON 的全部边界坐标转成 ECharts 内部数据(省级地图几千个点),
 *  所以必须缓存"已注册"状态,并且放进预加载阶段提前做掉 */
async function prepareGeo(code: number): Promise<string> {
  const mapName = `map-${code}`
  if (registeredMaps.has(mapName)) return mapName
  let json = geoCache.get(code)
  if (!json) {
    const res = await fetch(`/geo/${code}.json`)
    if (!res.ok) throw new Error(`GeoJSON ${code} 加载失败:${res.status}`)
    json = await res.json()
    // 用这份 GeoJSON 建立 名称→adcode 映射(供下钻时反查)
    const features = (json as { features?: Array<{ properties: { name: string; adcode: number } }> }).features ?? []
    features.forEach(f => nameToCode.set(f.properties.name, f.properties.adcode))
    geoCache.set(code, json)
  }
  registerMap(mapName, json as never)
  registeredMaps.add(mapName)
  return mapName
}

/** 直辖市(11北京/12天津/31上海/50重庆):省级下面直接是区县,没有市级 GeoJSON */
function isMunicipality(provCode: number) {
  return [11, 12, 31, 50].includes(Math.floor(provCode / 10000))
}

/**
 * 空闲预加载:全国图渲染后,分批预取省级 GeoJSON **并完成 registerMap**。
 * 这样点击下钻时两个最重的步骤(下载 + 注册)都已完成,
 * 只剩 setOption 的纯渲染(几十毫秒),而不是"点了才开始处理"。
 * 用 requestIdleCallback(浏览器空闲时执行),不抢占主线程。
 */
function preloadProvinceGeo() {
  const provCodes = [...new Set(parks.value.map(p => Math.floor(p.adcode / 10000) * 10000))]
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
  let i = 0
  const step = () => {
    if (i >= provCodes.length) return
    const code = provCodes[i++]
    prepareGeo(code).catch(() => {}) // 失败不阻塞(点下钻时再兜底提示)
    if (idle) idle(() => step())
    else setTimeout(step, 200)
  }
  step()
}

/* ==================== 地图渲染 ==================== */
const chart = useChart(mapEl, 'screen')

/** 按当前层级画地图(geo 底图 + 园区涟漪散点) */
async function renderMap() {
  const level = levels.value[levels.value.length - 1]
  mapLoading.value = true
  try {
    const mapName = await prepareGeo(level.code ?? 100000)

    chart.setOption(
      {
        tooltip: {
          trigger: 'item',
          backgroundColor: 'rgba(6,18,38,0.92)',
          borderColor: 'rgba(64,158,255,0.4)',
          textStyle: { color: '#d8f0ff' },
          formatter: (p: { seriesType?: string; name: string; value?: number[] }) => {
            if (p.seriesType === 'effectScatter') {
              const park = parks.value.find(x => x.name === p.name)
              if (!park) return p.name
              return `<b>${park.name}</b><br/>设备 ${park.devices.toLocaleString()} 台<br/>今日告警 ${park.alarms} 条 · 入驻率 ${park.occupancy}%`
            }
            return p.name
          }
        },
        geo: {
          map: mapName,
          roam: true,
          label: {
            show: true,
            color: 'rgba(127,179,232,0.55)',
            fontSize: level.code ? 10 : 9
          },
          itemStyle: {
            areaColor: 'rgba(13,38,76,0.85)',
            borderColor: 'rgba(64,158,255,0.45)',
            borderWidth: 1
          },
          emphasis: {
            label: { show: true, color: '#22d3ee' },
            itemStyle: { areaColor: 'rgba(34,211,238,0.22)' }
          }
        },
        visualMap: {
          show: false, // 隐藏图例条(页面右下角有自定义图例),只保留颜色映射能力
          min: 0,
          max: Math.max(1, ...Object.values(regionData.value)),
          inRange: { color: ['rgba(13,38,76,0.85)', 'rgba(34,211,238,0.45)'] }
        },
        series: [
          {
            // 着色层:geoIndex 引用上面的 geo 底图,不重复画边界,
            // 只负责"有数据的区域亮起来"(无园区的省保持暗色)
            type: 'map',
            geoIndex: 0,
            data: Object.entries(regionData.value).map(([name, value]) => ({ name, value }))
          },
          scatterSeries()
        ]
      },
      true // notMerge:切换地图级别时整体替换,避免残留上一级的配置
    )
  } finally {
    mapLoading.value = false
  }
}

/** 散点系列配置(渲染与刷新共用一份,避免两处写不一致) */
function scatterSeries() {
  return {
    type: 'effectScatter' as const,
    coordinateSystem: 'geo' as const,
    data: visibleParks.value.map(p => ({
      name: p.name,
      value: [p.lng, p.lat, p.devices]
    })),
    // 选中态:选中园区金色放大 + 白描边;未选中按规模分级
    symbolSize: (val: number[], p: { name?: string }) =>
      p.name === selected.value?.name ? 20 : val[2] >= scale.value.large ? 16 : val[2] >= scale.value.medium ? 11 : 7,
    itemStyle: {
      color: (p: { name?: string; value?: number[] }) =>
        p.name === selected.value?.name ? '#f5c542' : scaleColor((p.value?.[2] as number) ?? 0),
      borderColor: '#fff',
      borderWidth: (p: { name?: string }) => (p.name === selected.value?.name ? 1.5 : 0)
    },
    rippleEffect: { brushType: 'stroke', scale: 3 },
    zlevel: 2
  }
}

/**
 * 同步散点样式与地图定位(一次 setOption 完成)。
 * 注意:useChart 的 setOption 是"最后一次覆盖",所以定位和样式必须合并成一次调用,
 * 否则后一次会把前一次的配置冲掉。
 */
function syncScatter(focus?: ParkInfo) {
  chart.setOption({
    ...(focus ? { geo: { center: [focus.lng, focus.lat], zoom: 3 } } : {}),
    series: [{}, scatterSeries()] // index 0 空对象 = 着色层不变;index 1 刷新散点
  })
}

/* ==================== 下钻与联动交互 ==================== */
function backTo(index: number) {
  if (index === levels.value.length - 1) return
  levels.value = levels.value.slice(0, index + 1)
  selected.value = null
  renderMap()
}

/**
 * 选中园区 —— **双向联动的核心**。
 * 无论从列表点、还是从地图散点点,最终都走这里:
 *   ① 右侧面板切到该园区详情
 *   ② 地图散点高亮(金色放大 + 光环)
 *   ③ 若当前层级看不到该园区(比如还在全国视图),自动重建层级到它所在区域
 *   ④ 地图定位(geo.center/zoom)到该园区
 */
async function selectPark(park: ParkInfo) {
  selected.value = park
  const provCode = Math.floor(park.adcode / 10000) * 10000
  // 目标层级:普通城市 → 中国/省/市;直辖市 → 中国/省(它没有市级 GeoJSON)
  const target = isMunicipality(provCode)
    ? [
        { name: '中国', code: null },
        { name: park.province, code: provCode }
      ]
    : [
        { name: '中国', code: null },
        { name: park.province, code: provCode },
        { name: park.city, code: park.adcode }
      ]
  const sameLevel = levels.value.length === target.length && levels.value.every((lv, i) => lv.code === target[i].code)
  if (!sameLevel) {
    levels.value = target
    await renderMap()
  }
  // 散点高亮 + 地图定位到该园区(一次 setOption 合并完成,见 syncScatter 注释)
  syncScatter(park)
  // 列表滚动到对应行(保证两边视觉同步)
  document.getElementById(`park-row-${park.id}`)?.scrollIntoView({ block: 'nearest' })
}

/**
 * 取消选中:清掉选中态 + 复位散点高亮。
 *
 * 【为什么抽成具名方法,不写在模板里】原本模板里写的是
 *   `@click="selected = null; syncScatter()"`
 * Prettier(semi: false)会把这类多语句内联处理器折成多行,并**顺手删掉分号**:
 *   @click="
 *     selected = null
 *     syncScatter()
 *   "
 * Vue 的内联处理器按"表达式"解析,没有分号就不是合法表达式 → 整个 SFC 编译失败
 * (这页因此 500 过一次)。抽成方法后处理器只剩一个标识符,Prettier 无从改坏。
 * 这也是 Vue 官方文档里多语句场景推荐的做法。
 */
function clearSelection() {
  selected.value = null
  syncScatter()
}

function setupClick() {
  const c = chart.chart.value
  if (!c) return
  /** 点击去重:ECharts 对同一次区域点击可能同时触发 geo 和 map 两个事件,
   *  不拦截的话 renderMap 会重复执行(表现就是"点了像卡住") */
  let lastDrillAt = 0
  c.on('click', (params: { componentType?: string; seriesType?: string; name: string }) => {
    // 点在散点(园区)上 → 走统一选中逻辑(联动列表与面板)
    if (params.seriesType === 'effectScatter') {
      const park = parks.value.find(p => p.name === params.name)
      if (park) selectPark(park)
      return
    }
    // 点在地图区域上 → 下钻。
    // 注意:加了"着色层"map series 后,区域点击命中在 seriesType === 'map'
    // (而不是 componentType === 'geo'),两个都要兼容
    if (params.componentType === 'geo' || params.seriesType === 'map') {
      // 同一时间窗口内的重复事件(geo + map 双触发)只处理一次
      const now = Date.now()
      if (now - lastDrillAt < 250) return
      lastDrillAt = now
      const code = nameToCode.get(params.name)
      if (!code) return
      const level = levels.value[levels.value.length - 1]
      if (code === level.code) return // 点的是当前层级本身

      // 是否还能往下钻:全国 → 省(全部);省 → 市(仅非直辖市,直辖市无市级 GeoJSON)
      const canDrill = level.code
        ? isMunicipality(level.code) // 直辖市省级到头
          ? false
          : level.code % 10000 === 0 // 普通省(尾号 0000)→ 可钻到市
        : true // 全国视图 → 可钻到省
      if (!canDrill) return

      // 目标区域有没有园区:没有就拦在点击处提示,而不是钻进去看一个空页面
      const hasParks = parks.value.some(p => {
        if (!level.code) return Math.floor(p.adcode / 10000) * 10000 === code // 全国:点省
        return p.adcode === code // 省视图:点市
      })
      if (!hasParks) {
        ElMessage.info('该区域暂无园区')
        return
      }

      levels.value.push({ name: params.name, code })
      selected.value = null
      renderMap().catch(() => {
        // GeoJSON 加载失败:回滚层级并明确提示(而不是地图卡在加载态)
        levels.value.pop()
        ElMessage.error('地图数据加载失败,请重试')
      })
    }
  })
}

onMounted(async () => {
  const [list, statsData, scaleData] = await Promise.all([apiParkList(), apiParkProvinceStats(), apiParkScale()])
  parks.value = list as ParkInfo[]
  provinceStats.value = statsData as Record<string, number>
  scale.value = scaleData as ParkScale
  await renderMap()
  setupClick()
  preloadProvinceGeo() // 空闲时预取省级 GeoJSON,让下钻"零等待"
})
</script>

<style scoped>
.park-page {
  position: fixed;
  inset: 0;
  background: #050d1f;
  display: flex;
  flex-direction: column;
  font-family: 'DIN Alternate', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  user-select: none;
}

/* ---- 顶栏 ---- */
.park-header {
  height: 76px;
  display: flex;
  align-items: center;
  padding: 0 32px;
  background: linear-gradient(180deg, rgba(13, 38, 76, 0.95), transparent);
}
.ph-left h1 {
  font-size: 24px;
  letter-spacing: 4px;
  color: #d8f0ff;
  margin: 0;
}
.ph-left p {
  margin: 4px 0 0;
  font-size: 10px;
  letter-spacing: 3px;
  color: #4a7ba8;
}
.ph-crumb {
  margin-left: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.crumb {
  font-size: 14px;
  color: #7fb3e8;
  cursor: pointer;
  letter-spacing: 1px;
}
.crumb b {
  color: #3d6285;
  margin-left: 8px;
}
.crumb.active {
  color: #22d3ee;
  font-weight: 600;
}
.crumb:not(.active):hover {
  text-decoration: underline;
}
.ph-stats {
  margin-left: auto;
  display: flex;
  gap: 26px;
}
.phs {
  font-size: 13px;
  color: #7fb3e8;
  white-space: nowrap;
}
.phs b {
  font-size: 18px;
  color: #22d3ee;
  font-variant-numeric: tabular-nums;
  font-family: 'DIN Alternate', 'Bahnschrift', Consolas, sans-serif;
  margin-right: 3px;
}
.phs b.warn {
  color: #f5c542;
}
.ph-back {
  margin-left: 32px;
  color: #7fb3e8;
}

/* ---- 主体 ---- */
.park-main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 18px;
  padding: 0 26px 26px;
  min-height: 0;
}

/* ---- 地图面板 ---- */
.park-map-panel {
  position: relative;
  background: rgba(13, 38, 76, 0.55);
  border: 1px solid rgba(64, 158, 255, 0.28);
  border-radius: 10px;
  overflow: hidden;
  min-height: 0;
}
.park-map {
  position: absolute;
  inset: 0;
}
.map-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #7fb3e8;
  font-size: 14px;
  letter-spacing: 2px;
  background: rgba(5, 13, 31, 0.5);
  pointer-events: none;
}
.spin {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(34, 211, 238, 0.25);
  border-top-color: #22d3ee;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.map-legend {
  position: absolute;
  left: 16px;
  bottom: 14px;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: #7fb3e8;
  pointer-events: none;
}
.lg-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.lg-dot.large {
  background: #f5c542;
}
.lg-dot.medium {
  background: #22d3ee;
}
.lg-dot.small {
  background: #7fb3e8;
  width: 7px;
  height: 7px;
}

/* ---- 右侧面板 ---- */
.park-side {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 0;
}
.side-card {
  background: rgba(13, 38, 76, 0.55);
  border: 1px solid rgba(64, 158, 255, 0.28);
  border-radius: 10px;
  padding: 18px;
  position: relative;
}
.sc-title {
  font-size: 17px;
  color: #d8f0ff;
  letter-spacing: 1px;
}
.sc-sub {
  font-size: 12px;
  color: #7fb3e8;
  margin-top: 4px;
}
.sc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 16px;
}
.sc-item b {
  display: block;
  font-size: 22px;
  color: #22d3ee;
  font-variant-numeric: tabular-nums;
  font-family: 'DIN Alternate', 'Bahnschrift', Consolas, sans-serif;
}
.sc-item b.warn {
  color: #f5c542;
}
.sc-item span {
  font-size: 12px;
  color: #7fb3e8;
}
.sc-hint {
  margin-top: 16px;
  font-size: 12px;
  color: #3d6285;
  letter-spacing: 1px;
}
.sc-close {
  position: absolute;
  top: 16px;
  right: 16px;
  font-size: 12px;
  color: #7fb3e8;
  cursor: pointer;
}
.sc-close:hover {
  color: #22d3ee;
}

.side-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: rgba(13, 38, 76, 0.55);
  border: 1px solid rgba(64, 158, 255, 0.28);
  border-radius: 10px;
  padding: 14px;
}
.sl-title {
  font-size: 12px;
  color: #7fb3e8;
  letter-spacing: 1px;
  margin-bottom: 10px;
}
.sl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #d8f0ff;
}
.sl-row:hover,
.sl-row.active {
  background: rgba(34, 211, 238, 0.12);
}
.sl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.sl-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sl-val {
  font-size: 12px;
  color: #7fb3e8;
  font-variant-numeric: tabular-nums;
}
.sl-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: #5f88b0;
  line-height: 2;
}
.sl-empty span {
  font-size: 11px;
  color: #3d6285;
}
</style>
