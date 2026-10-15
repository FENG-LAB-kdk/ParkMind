/**
 * 园区数据模型与生成器 —— 全链路唯一数据真相
 *
 * 【数据口径】大屏实时值、告警、后台分页报表全部派生自这里的
 * 同一份状态:server 启动时按种子生成楼宇/设备/历史告警,运行时定时推进
 * (能耗演化、告警产生、出入园计数),REST 与 WebSocket 都只读这份状态。
 * 保证"大屏点 A 楼宇的能耗 == 后台报表的 A 楼宇能耗"。
 *
 * 本文件刻意保持纯 JS + 无框架:职责单一(造数与状态演化),讲起来清晰
 */

const N_BUILDINGS = 8
const N_DEVICES_PER_BUILDING = 25
/** 园区平面网格(米):4 列 × 2 行。
 *  楼宇坐标的**唯一真相**放在服务端 —— 前端 3D 场景、无人车站点计算都用它,
 *  避免"前端算一套、服务端算一套"导致两边对不上(这个坑踩过一次) */
const CELL_X = 42
const CELL_Z = 68
/** 历史告警总量:10 万+ 条,虚拟滚动/大数据页的演示数据 */
const N_ALARMS = 100_000

export const BUILDING_TYPES = ['office', 'commercial', 'industrial', 'warehouse']
export const BUILDING_TYPE_LABEL = { office: '办公', commercial: '商业', industrial: '工业', warehouse: '仓储' }
export const DEVICE_TYPES = ['meter', 'gate', 'camera', 'smoke', 'hvac']
export const DEVICE_TYPE_LABEL = {
  meter: '智能电表',
  gate: '门禁闸机',
  camera: '监控摄像',
  smoke: '烟感探头',
  hvac: '空调机组'
}
export const ALARM_LEVEL_LABEL = { 1: '紧急', 2: '重要', 3: '一般', 4: '提示' }

let idSeed = 0
const nextId = (p = '') => `${p}${(++idSeed).toString(36).padStart(6, '0')}`

/* ---------------- 楼宇 ---------------- */
const buildings = Array.from({ length: N_BUILDINGS }, (_, i) => {
  const types = BUILDING_TYPES
  const names = ['云麓', '智汇', '星港', '创芯', '远航', '数谷', '联晟', '博雅']
  return {
    id: `b${i + 1}`,
    name: `${names[i]}大厦`,
    type: types[i % types.length],
    /** 园区平面坐标(米,x 向东、z 向南) */
    x: ((i % 4) - 1.5) * CELL_X,
    z: (Math.floor(i / 4) - 0.5) * CELL_Z,
    floors: 6 + ((i * 3) % 18),
    area: 8000 + i * 2600,
    occupancyRate: 62 + ((i * 7) % 36),
    tenantCount: 12 + i * 4,
    power: 0, // 运行时演化
    status: 'normal'
  }
})

/* ---------------- 设备 ---------------- */
const devices = buildings.flatMap(b =>
  Array.from({ length: N_DEVICES_PER_BUILDING }, (_, i) => ({
    id: nextId('d'),
    buildingId: b.id,
    name: `${b.name}-${DEVICE_TYPE_LABEL[DEVICE_TYPES[i % DEVICE_TYPES.length]]}-${String(i + 1).padStart(2, '0')}`,
    type: DEVICE_TYPES[i % DEVICE_TYPES.length],
    status: 'running',
    value: 0,
    updatedAt: Date.now()
  }))
)
// 初始分布:2% 故障 / 3% 离线
devices.forEach((d, i) => {
  const r = (i * 7) % 100
  if (r < 2) d.status = 'fault'
  else if (r < 5) d.status = 'offline'
})

/* ---------------- 告警(种子 10 万条 + 运行时新增) ---------------- */
const alarmSeed = Array.from({ length: N_ALARMS }, (_, i) => {
  const d = devices[(i * 13) % devices.length]
  const b = buildings.find(x => x.id === d.buildingId)
  const level = (i % 4) + 1 // 1..4
  return {
    id: `a${N_ALARMS - i}`,
    seq: N_ALARMS - i,
    buildingId: b.id,
    buildingName: b.name,
    deviceId: d.id,
    deviceName: d.name,
    level,
    type: DEVICE_TYPE_LABEL[d.type],
    message: d.status === 'fault' ? `${d.name}运行异常` : `${d.name}数据波动超阈值`,
    time: Date.now() - (N_ALARMS - i) * 1200,
    status: i % 3 === 0 ? 'pending' : 'handled'
  }
}) // 天然最新在前(seq 递减),运行时 unshift 与之一致

/** 待处理告警计数:运行时维护,避免每次 O(n) filter 十万级数组
 * (export let 活绑定:产生/处理两处修改都收敛在本模块) */
export let pendingAlarmCount = alarmSeed.filter(a => a.status === 'pending').length

/** 处理告警(唯一修改点:防止 import 方对活绑定的误写) */
export function markAlarmHandled(id) {
  const a = alarmSeed.find(x => x.id === id)
  if (!a) return null
  if (a.status !== 'handled') {
    a.status = 'handled'
    pendingAlarmCount--
  }
  return a
}

/* ---------------- 能耗采样环(seq 消息环) ---------------- */
/** 最近帧环:energy/alarm/overview 三类帧统一序号,断线补偿按 seq 回放 */
export const frameRing = []
export const MAX_RING = 4000
let seq = alarmSeed.length // 从历史 seq 之后开始编号,保证全站序号单调

export const nextSeq = () => ++seq

/* ---------------- 运行时演化 ---------------- */
const rnd = (min, max) => min + Math.random() * (max - min)

/** 能耗推进:每 tick 更新每楼宇功率(与后端历史口径一致:同一份 buildings) */
export function evolveEnergy() {
  buildings.forEach((b, i) => {
    // 楼宇功率 = 基线(类型相关) + 正弦昼夜波动 + 噪声
    const base = b.type === 'industrial' ? 520 : b.type === 'commercial' ? 380 : b.type === 'office' ? 240 : 160
    const wave = Math.sin((Date.now() / 1000 / 600 + i) * 1.2) * 80
    b.power = Math.max(60, Math.round(base + wave + rnd(-30, 30)))
  })
}

/** 设备健康演化:概率性故障/恢复(改变 devices 状态 → 大屏设备分布同步) */
export function evolveDevices() {
  devices.forEach((d, i) => {
    const r = Math.random()
    if (d.status === 'fault') {
      if (r < 0.3) d.status = 'running' // 30% 自愈
      return
    }
    if (d.status === 'running' && r < 0.0025) d.status = 'fault'
    else if (d.status === 'running' && r < 0.004) d.status = 'offline'
    else if (d.status === 'offline' && r < 0.1) d.status = 'running'
    void i
  })
}

/** 总览计数演化:能耗单调递增、访客/车辆随机游走 —— 不再每次调用随机重掷,
 * 否则大屏"今日能耗"会倒退、客流会瞬移,明眼人一看即假 */
export const counters = { todayEnergy: 68000, todayVisitors: 2300, todayCars: 860 }

export function evolveCounters() {
  counters.todayEnergy += Math.round(rnd(1, 5))
  counters.todayVisitors = Math.max(0, counters.todayVisitors + Math.round(rnd(-2, 8)))
  counters.todayCars = Math.max(0, counters.todayCars + Math.round(rnd(-1, 4)))
}

/** 告警产生:故障设备发出新告警,入环并推送 */
const alarmMessages = {
  meter: '功率越限报警',
  gate: '非法闯入告警',
  camera: '画面丢失告警',
  smoke: '烟感浓度超限',
  hvac: '运行参数异常'
}

export function produceAlarm() {
  const fault = devices.filter(d => d.status === 'fault')
  if (!fault.length) return null
  const d = fault[Math.floor(Math.random() * fault.length)]
  const b = buildings.find(x => x.id === d.buildingId)
  const level = Math.random() < 0.3 ? 2 : Math.random() < 0.7 ? 3 : 4
  const alarm = {
    id: `a_${Date.now().toString(36)}`,
    seq: nextSeq(),
    buildingId: b.id,
    buildingName: b.name,
    deviceId: d.id,
    deviceName: d.name,
    level,
    type: DEVICE_TYPE_LABEL[d.type],
    message: alarmMessages[d.type],
    time: Date.now(),
    status: 'pending'
  }
  alarmSeed.unshift(alarm)
  pendingAlarmCount++
  if (alarmSeed.length > N_ALARMS + 200) alarmSeed.pop() // 只淘汰最老,头部新增 O(1) 均摊
  pushFrame({ type: 'alarm', seq: alarm.seq, data: alarm })
  return alarm
}

/**
 * 生成一条业务告警(供其他模块把告警接入统一体系)。
 *
 * 【设计取舍】车辆异常**不另起一套告警**,而是写进同一个列表 ——
 * 这样告警中心的级别筛选、状态流转、"标记处理"、大屏实时告警流全部白送;
 * 运维也不用在两个地方看告警。这是"复用而非重复"的一个具体例子。
 */
export function produceAlarmFrom(payload) {
  const alarm = {
    id: `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    seq: nextSeq(),
    time: Date.now(),
    status: 'pending',
    ...payload
  }
  alarmSeed.unshift(alarm)
  pendingAlarmCount++
  if (alarmSeed.length > N_ALARMS + 200) alarmSeed.pop()
  pushFrame({ type: 'alarm', seq: alarm.seq, data: alarm })
  return alarm
}

/* ---------------- 环形帧(供 seq 补偿回放 + 实时广播出口) ---------------- */
/** 广播器由 index.js 注入(依赖倒置:本模块只负责"入环",不认识 WebSocket) */
let frameSink = null
export function setFrameSink(fn) {
  frameSink = fn
}

export function pushFrame(frame) {
  frameRing.push(frame)
  if (frameRing.length > MAX_RING) frameRing.splice(0, frameRing.length - MAX_RING)
  // 入环后同步广播:energy/overview/alarm 三类帧共用同一条出口,
  // 新增帧类型不会再出现"只入环不推送"的漏接线
  frameSink?.(frame)
}

/** 供 index.js 一次性取引用(数组内容共享可变;原语计数请用顶层活绑定) */
export const getState = () => ({
  buildings,
  devices,
  alarms: alarmSeed,
  nextSeq,
  produceAlarm,
  evolveEnergy,
  evolveDevices,
  evolveCounters,
  markAlarmHandled
})
