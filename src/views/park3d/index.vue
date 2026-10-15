<template>
  <div class="park3d">
    <!-- Three.js 的 canvas 会被挂到这里 -->
    <div ref="canvasEl" class="scene" />

    <!-- ========== 顶部标题与实时指标 ========== -->
    <header class="hud hud-top">
      <div class="brand">
        <span class="brand-dot" />
        <h1>园区三维态势</h1>
        <span class="brand-sub">WebGL · 数据驱动的数字孪生</span>
      </div>
      <div class="metrics">
        <div class="metric">
          <b>{{ totalPower.toLocaleString() }}</b>
          <span>kW 总功率</span>
        </div>
        <div class="metric">
          <b>{{ buildings.length }}</b>
          <span>栋楼宇</span>
        </div>
        <div class="metric">
          <b :class="{ warn: alarmCount > 0 }">{{ alarmCount }}</b>
          <span>本次告警</span>
        </div>
        <div class="metric">
          <b>{{ fps }}</b>
          <span>FPS</span>
        </div>
      </div>
    </header>

    <!-- ========== 左下角图例 ========== -->
    <div class="hud hud-legend">
      <p class="legend-title">楼体配色 = 实时功率</p>
      <p class="legend-row"><i style="background: #22d3ee" />正常运行</p>
      <p class="legend-row"><i style="background: #f5c542" />功率偏高</p>
      <p class="legend-row"><i style="background: #f87171" />功率越限</p>
      <p class="legend-note">楼体高度 = 实际楼层数</p>
    </div>

    <!-- ========== 右侧:选中楼宇详情 ========== -->
    <aside v-if="selected" class="hud hud-detail">
      <div class="detail-head">
        <h2>{{ selected.name }}</h2>
        <button class="close" title="取消选中" @click="selectedId = undefined">✕</button>
      </div>
      <p class="detail-sub">{{ typeText(selected.type) }} · {{ selected.floors }} 层</p>
      <dl class="detail-grid">
        <div>
          <dt>实时功率</dt>
          <dd class="hl">{{ Math.round(currentPower) }} kW</dd>
        </div>
        <div>
          <dt>建筑面积</dt>
          <dd>{{ selected.area.toLocaleString() }} ㎡</dd>
        </div>
        <div>
          <dt>入驻率</dt>
          <dd>{{ selected.occupancyRate }}%</dd>
        </div>
        <div>
          <dt>租户数</dt>
          <dd>{{ selected.tenantCount }} 家</dd>
        </div>
      </dl>
    </aside>

    <!-- ========== 右下角:最近告警 ========== -->
    <div v-if="recentAlarms.length" class="hud hud-alarms">
      <p class="alarm-title">最近告警</p>
      <p v-for="a in recentAlarms" :key="a.id" class="alarm-row">
        <i :class="'lv' + a.level" />
        <span class="alarm-name">{{ a.buildingName }}</span>
        <span class="alarm-msg text-ellipsis">{{ a.message }}</span>
      </p>
    </div>

    <!-- ========== 底部操作栏 ========== -->
    <footer class="hud hud-bottom">
      <span class="tips">左键拖拽旋转 · 滚轮缩放 · 右键平移 · 点击楼体查看详情</span>
      <div class="actions">
        <span class="ws" :class="wsStatus">{{ wsText }}</span>
        <button @click="resetCamera">复位视角</button>
        <button @click="router.push('/screen')">返回大屏</button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import { apiBuildings } from '@/api'
import { useThreeScene } from '@/composables/useThreeScene'
import { useWebSocket, type WsStatus } from '@/composables/useWebSocket'
import type { Alarm, Building, WsFrame } from '@/types'
import { heatColorSolid } from '@/config/buildingHeat'
import { BUILDING_DEPTH, BUILDING_WIDTH, buildingHeight, toWorldPosition } from './parkLayout'

/**
 * 园区三维态势 —— 数据驱动的数字孪生
 *
 * 【这一页解决什么实际问题】
 * 大屏上原本已经有 2D 的楼宇平面图,但它表达不了两件事:
 *   ① **楼有多高** —— 平面上 6 层的楼和 21 层的楼画出来一样大,看不出体量差异
 *   ② **空间关系** —— 谁在前谁在后、疏密如何,俯视图里是平的
 * 三维把"楼层数"变成真实高度、"功率"变成楼体颜色,再叠加告警定位,
 * 让指挥中心能一眼看出"哪栋楼体量大、哪栋楼现在负荷高、哪里刚出事"。
 *
 * 【为什么这不是"为了炫技加个 3D"】
 * 所有视觉元素都由**已有的真实数据**驱动,不新增任何假数据:
 *   楼层数(服务端下发) → 楼体高度
 *   实时功率(WebSocket 每秒推送) → 楼体颜色
 *   告警帧(WebSocket) → 对应楼体闪烁
 *   平面坐标 x/z(服务端下发,单位米) → 三维世界坐标
 * 新增的代码只做"渲染",数据链路一条没动。
 */

const router = useRouter()
const canvasEl = ref<HTMLElement>()

/* ==================== 业务数据 ==================== */
const buildings = ref<Building[]>([])
/** 实时功率字典:key = buildingId。高频写入,和 2D 大屏一样用独立字典而不是回写 buildings */
const powerMap = reactive<Record<string, number>>({})
const selectedId = ref<string>()
const wsStatus = ref<WsStatus>('connecting')
const fps = ref(60)
const alarmCount = ref(0)
const recentAlarms = ref<Alarm[]>([])

const selected = computed(() => buildings.value.find(b => b.id === selectedId.value))
/** 选中楼宇的实时功率优先读 powerMap(它每秒更新),回退到楼宇自带的初始值 */
const currentPower = computed(() => {
  const id = selectedId.value
  if (!id) return 0
  return powerMap[id] ?? buildings.value.find(b => b.id === id)?.power ?? 0
})
const totalPower = computed(() => Object.values(powerMap).reduce((s, v) => s + v, 0))
const typeText = (t: string) => ({ office: '办公', commercial: '商业', industrial: '工业', warehouse: '仓储' })[t] || t

/* ==================== 三维节点表 ==================== */
/** 一栋楼在三维场景里对应的全部对象。用普通 Map 而不是 reactive ——
 *  这些对象只在渲染循环里被命令式地读写,不需要 Vue 的响应式代理参与 */
interface BuildingNode {
  mesh: THREE.Mesh
  material: THREE.MeshLambertMaterial
  label: THREE.Sprite
  /** 当前应显示的基色(由功率推导)。告警闪烁时是在它和红色之间插值 */
  baseColor: THREE.Color
  /** 告警闪烁的截止时间戳(performance.now() 口径),0 = 不闪 */
  flashUntil: number
  height: number
}
const nodes = new Map<string, BuildingNode>()

/** 告警闪烁色 */
const ALARM_COLOR = new THREE.Color('#ff3b3b')

/* ==================== 场景 ==================== */
const { scene, camera, renderer, resetCamera } = useThreeScene({
  container: canvasEl,
  cameraPosition: [0, 155, 235],
  target: [0, 14, 0],
  onFrame: onFrame
})

/** 帧回调:处理告警闪烁 + FPS 统计 */
let fpsAcc = 0
let fpsFrames = 0
function onFrame(delta: number) {
  const now = performance.now()

  nodes.forEach(node => {
    if (now < node.flashUntil) {
      // 告警中:在基色和红色之间做正弦振荡,做出"闪"的效果
      const t = (Math.sin(now * 0.012) + 1) / 2
      node.material.color.copy(node.baseColor).lerp(ALARM_COLOR, t * 0.92)
    } else {
      node.material.color.copy(node.baseColor)
    }
  })

  // FPS:每 0.5 秒统计一次,避免数字疯狂跳动看不清
  fpsAcc += delta
  fpsFrames++
  if (fpsAcc >= 0.5) {
    fps.value = Math.round(fpsFrames / fpsAcc)
    fpsAcc = 0
    fpsFrames = 0
  }
}

/** 给楼宇做一块文字标签(Sprite + Canvas 贴图)—— Three.js 里显示文字的标准做法 */
function makeLabel(name: string, floors: number): THREE.Sprite {
  const W = 256
  const H = 84
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = 'rgba(10, 18, 34, 0.78)'
    ctx.fillRect(4, 4, W - 8, H - 8)
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.45)'
    ctx.lineWidth = 2
    ctx.strokeRect(4, 4, W - 8, H - 8)

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#d8f0ff'
    ctx.font = 'bold 30px sans-serif'
    ctx.fillText(name, W / 2, 32)
    ctx.fillStyle = '#7fb3e8'
    ctx.font = '22px sans-serif'
    ctx.fillText(`${floors} 层`, W / 2, 62)
  }

  const texture = new THREE.CanvasTexture(canvas)
  // 不指定色彩空间的话贴图会偏亮/偏灰(Three.js 默认按线性空间解释)
  texture.colorSpace = THREE.SRGBColorSpace

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  // 保持和画布一致的 256:84 宽高比,否则文字会被拉扁
  sprite.scale.set(30, 30 * (H / W), 1)
  return sprite
}

/** 地面网格 —— 给三维空间一个"地"的参照,否则楼像浮在空中 */
function buildGround(scene: THREE.Scene) {
  const grid = new THREE.GridHelper(420, 21, 0x22d3ee, 0x1b3350)
  const mats = Array.isArray(grid.material) ? grid.material : [grid.material]
  mats.forEach(m => {
    m.transparent = true
    m.opacity = 0.28
  })
  grid.position.y = 0.02 // 抬高一点点,避免和楼底面 z-fighting(共面闪烁)
  scene.add(grid)
}

/** 把楼宇数据摆进三维场景 */
function buildBuildings(list: Building[]) {
  const s = scene.value
  if (!s) return

  // 先清掉上一批(重新加载数据时不会叠加)
  nodes.forEach(n => {
    s.remove(n.mesh)
    s.remove(n.label)
    n.mesh.geometry.dispose()
    n.material.dispose()
    n.label.material.map?.dispose()
    n.label.material.dispose()
  })
  nodes.clear()

  list.forEach(b => {
    const height = buildingHeight(b.floors)
    const geometry = new THREE.BoxGeometry(BUILDING_WIDTH, height, BUILDING_DEPTH)
    const color = new THREE.Color(heatColorSolid(b.power, b.type))
    const material = new THREE.MeshLambertMaterial({ color })
    const mesh = new THREE.Mesh(geometry, material)

    const pos = toWorldPosition(b)
    mesh.position.set(pos.x, pos.y, pos.z)
    // 点击拾取时靠它把 Mesh 还原成业务对象 —— Raycaster 只能告诉你命中了哪个 Mesh
    mesh.userData.buildingId = b.id
    s.add(mesh)

    const label = makeLabel(b.name, b.floors)
    label.position.set(pos.x, height + 13, pos.z)
    s.add(label)

    nodes.set(b.id, { mesh, material, label, baseColor: color, flashUntil: 0, height })
  })
}

/* ==================== 实时数据 ==================== */
function applyPower(buildingId: string, power: number) {
  powerMap[buildingId] = power
  const node = nodes.get(buildingId)
  const b = buildings.value.find(x => x.id === buildingId)
  if (!node || !b) return
  // 只改"基色",不直接改材质颜色 —— 闪烁逻辑在帧回调里统一算,避免两边打架
  node.baseColor.set(heatColorSolid(power, b.type))
}

function triggerAlarm(alarm: Alarm) {
  const node = nodes.get(alarm.buildingId)
  if (node) node.flashUntil = performance.now() + 3000
  alarmCount.value++
  // 只留最近 5 条,避免无限增长
  recentAlarms.value = [alarm, ...recentAlarms.value].slice(0, 5)
}

const { connect } = useWebSocket({
  url: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
  heartbeat: 8000,
  onMessage(frame: WsFrame) {
    if (frame.type === 'energy') {
      const d = frame.data as { buildingId: string; power: number }
      applyPower(d.buildingId, d.power)
    } else if (frame.type === 'alarm') {
      triggerAlarm(frame.data as Alarm)
    }
  },
  onStatus: s => (wsStatus.value = s)
})

const wsText = computed(
  () => ({ connecting: '连接中', open: '实时', reconnecting: '重连中', closed: '已断开' })[wsStatus.value]
)

/* ==================== 点击拾取 ==================== */
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
/** 记录按下位置:用来区分"点击选中"和"拖拽旋转" */
let pointerDownAt = { x: 0, y: 0 }

function onPointerDown(e: PointerEvent) {
  pointerDownAt = { x: e.clientX, y: e.clientY }
}

function onPointerUp(e: PointerEvent) {
  // 位移超过 5px 视为拖拽 —— 不加这个判断的话,每次旋转视角都会误触发选中
  if (Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y) > 5) return

  const r = renderer.value
  const cam = camera.value
  if (!r || !cam) return

  const rect = r.domElement.getBoundingClientRect()
  // 屏幕坐标 → 归一化设备坐标(NDC):x/y 都映射到 [-1, 1],y 轴要翻转
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, cam)

  const meshes = [...nodes.values()].map(n => n.mesh)
  const hits = raycaster.intersectObjects(meshes, false)
  selectedId.value = hits.length ? (hits[0].object.userData.buildingId as string) : undefined
}

/* ==================== 生命周期 ==================== */
/** 组件是否还活着 —— 用来拦住"异步加载还没回来、组件已经卸载"的竞态 */
let alive = true
/** 自己持有的 canvas 引用:卸载时 useThreeScene 已经把 renderer 置空,不能再从它取 */
let canvasElement: HTMLCanvasElement | undefined

onMounted(async () => {
  // 场景在这一刻已就绪 —— useThreeScene 的 onMounted 比本组件先注册、先执行
  const s = scene.value
  if (s) buildGround(s)

  // 交互事件的注册与摘除成对管理,避免"注册了却没摘"这类内存泄漏
  canvasElement = renderer.value?.domElement
  canvasElement?.addEventListener('pointerdown', onPointerDown)
  canvasElement?.addEventListener('pointerup', onPointerUp)

  const res = await apiBuildings({ page: 1, limit: 100 })
  // 请求返回时组件可能已经被卸载(用户秒退),此时场景已销毁,再往里塞东西会报错
  if (!alive) return
  buildings.value = res.list
  res.list.forEach(b => (powerMap[b.id] = b.power))
  buildBuildings(res.list)

  connect()
})

onUnmounted(() => {
  alive = false
  canvasElement?.removeEventListener('pointerdown', onPointerDown)
  canvasElement?.removeEventListener('pointerup', onPointerUp)
  canvasElement = undefined
})
</script>

<style scoped>
.park3d {
  position: fixed;
  inset: 0;
  background: #0b1120;
  overflow: hidden;
  color: #d8f0ff;
  font-size: 13px;
}
.scene {
  position: absolute;
  inset: 0;
}
/**
 * canvas 必须显式撑满容器。
 * 【坑】useThreeScene 里调的是 `renderer.setSize(w, h, false)` —— 第三个参数关掉了
 * Three.js 自动写内联样式。而 setPixelRatio(2) 会让绘制缓冲变成容器的 2 倍,
 * 若不给 canvas 指定 CSS 宽高,它在高分屏上就会按缓冲尺寸显示,直接撑破容器。
 * 所以这里由 CSS 负责显示尺寸,Three.js 只负责绘制缓冲尺寸,两边各管一段。
 */
.scene :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

/* HUD 通用:浮在三维场景之上的信息层 */
.hud {
  position: absolute;
  background: rgba(10, 18, 34, 0.68);
  border: 1px solid rgba(34, 211, 238, 0.22);
  border-radius: 8px;
  padding: 10px 14px;
  backdrop-filter: blur(6px);
  pointer-events: none; /* 默认不挡鼠标,让拖拽旋转能穿透;需要点的元素单独打开 */
}
.hud button {
  pointer-events: auto;
}

/* ---------- 顶部 ---------- */
.hud-top {
  top: 16px;
  left: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22d3ee;
  box-shadow: 0 0 10px #22d3ee;
}
.brand h1 {
  margin: 0;
  font-size: 17px;
  letter-spacing: 1px;
}
.brand-sub {
  font-size: 12px;
  color: #5f7ea3;
}
.metrics {
  display: flex;
  gap: 22px;
}
.metric {
  text-align: right;
}
.metric b {
  display: block;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  color: #22d3ee;
}
.metric b.warn {
  color: #f87171;
}
.metric span {
  font-size: 11px;
  color: #5f7ea3;
}

/* ---------- 图例 ---------- */
.hud-legend {
  left: 16px;
  bottom: 72px;
}
.legend-title {
  margin: 0 0 6px;
  font-size: 12px;
  color: #7fb3e8;
}
.legend-row {
  margin: 4px 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: #9fc3e0;
}
.legend-row i {
  width: 11px;
  height: 11px;
  border-radius: 2px;
  display: inline-block;
}
.legend-note {
  margin: 9px 0 0;
  padding-top: 8px;
  border-top: 1px dashed rgba(34, 211, 238, 0.22);
  font-size: 11px;
  color: #5f7ea3;
}

/* ---------- 详情 ---------- */
.hud-detail {
  right: 16px;
  top: 92px;
  width: 236px;
}
.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.detail-head h2 {
  margin: 0;
  font-size: 15px;
}
.close {
  pointer-events: auto;
  background: none;
  border: none;
  color: #5f7ea3;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
}
.close:hover {
  color: #f87171;
}
.detail-sub {
  margin: 4px 0 10px;
  font-size: 12px;
  color: #5f7ea3;
}
.detail-grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px 8px;
}
.detail-grid dt {
  font-size: 11px;
  color: #5f7ea3;
}
.detail-grid dd {
  margin: 2px 0 0;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.detail-grid dd.hl {
  color: #22d3ee;
}

/* ---------- 最近告警 ---------- */
.hud-alarms {
  right: 16px;
  bottom: 72px;
  width: 250px;
}
.alarm-title {
  margin: 0 0 6px;
  font-size: 12px;
  color: #7fb3e8;
}
.alarm-row {
  margin: 4px 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.alarm-row i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.alarm-row i.lv1 {
  background: #f87171;
}
.alarm-row i.lv2 {
  background: #fbbf24;
}
.alarm-row i.lv3 {
  background: #7fb3e8;
}
.alarm-row i.lv4 {
  background: #5f7ea3;
}
.alarm-name {
  color: #9fc3e0;
  flex-shrink: 0;
}
.alarm-msg {
  flex: 1;
  min-width: 0;
  color: #5f7ea3;
}

/* ---------- 底部 ---------- */
.hud-bottom {
  left: 16px;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.tips {
  font-size: 12px;
  color: #5f7ea3;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.actions button {
  background: rgba(34, 211, 238, 0.12);
  border: 1px solid rgba(34, 211, 238, 0.35);
  color: #9fc3e0;
  border-radius: 5px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.actions button:hover {
  background: rgba(34, 211, 238, 0.24);
  color: #d8f0ff;
}
.ws {
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 10px;
  border: 1px solid transparent;
}
.ws.open {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.4);
}
.ws.reconnecting,
.ws.connecting {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.4);
}
.ws.closed {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.4);
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
