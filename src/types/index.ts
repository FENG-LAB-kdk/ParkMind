/**
 * 业务领域模型 —— 全项目唯一数据真相
 *
 * 【数据口径】server 数据生成器、REST 接口、WebSocket 推送、
 * 大屏与后台报表全部派生自这一套类型,保证"点楼宇 A 看到的能耗与后台报表一致"。
 * 这是 demo 类项目最容易翻车、而企业项目必须保证的地方。
 */

/** 楼宇类型 */
export type BuildingType = 'office' | 'commercial' | 'industrial' | 'warehouse'

/** 楼宇 */
export interface Building {
  id: string
  name: string
  /** 楼宇类型:办公/商业/工业/仓储 */
  type: BuildingType
  /** 园区平面坐标(米,x 向东、z 向南)—— 服务端下发,前端不再自己算布局 */
  x: number
  z: number
  floors: number
  /** 总面积 m² */
  area: number
  /** 入驻率 0-100 */
  occupancyRate: number
  /** 租户企业数 */
  tenantCount: number
  /** 当前总功率 kW */
  power: number
  /** 状态:运行/部分故障/停用 */
  status: 'normal' | 'partial' | 'offline'
}

/** 设备类型 */
export type DeviceType = 'meter' | 'gate' | 'camera' | 'smoke' | 'hvac'

/** 园区设备 */
export interface Device {
  id: string
  buildingId: string
  name: string
  type: DeviceType
  /** 运行/故障/离线 */
  status: 'running' | 'fault' | 'offline'
  /** 设备实时读数(电表=功率kW,门禁=今日通行数,…) */
  value: number
  updatedAt: number
}

/** 告警级别 1-紧急 2-重要 3-一般 4-提示 */
export type AlarmLevel = 1 | 2 | 3 | 4

/** 告警记录 */
export interface Alarm {
  id: string
  /** 序号:全链路递增,断线补偿的锚点(useWebSocket 依据) */
  seq: number
  buildingId: string
  buildingName: string
  deviceId: string
  deviceName: string
  level: AlarmLevel
  type: string
  message: string
  time: number
  /** 待处理/已处理 */
  status: 'pending' | 'handled'
}

/** 能耗采样点(历史,秒级一条) */
export interface EnergySample {
  buildingId: string
  ts: number
  /** 瞬时功率 kW */
  power: number
}

/** 大屏 KPI 总览 */
export interface ParkOverview {
  ts: number
  totalPower: number
  todayEnergy: number
  runningDevices: number
  faultDevices: number
  occupancyRate: number
  tenantCount: number
  todayVisitors: number
  todayCars: number
  activeAlarms: number
}

/** WebSocket 消息帧(应用层协议) */
export interface WsFrame<T = unknown> {
  type: 'energy' | 'alarm' | 'overview' | 'heartbeat' | 'sync'
  /** 消息序号:每连接递增;断线重连后前端以 lastSeq 向后端补拉 */
  seq: number
  data: T
}

/** 通用分页响应 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  limit: number
}

/** 通用接口响应体(与 server 约定) */
export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message: string
}

/** 登录用户 */
export interface UserInfo {
  id: string
  username: string
  nickname: string
  /** admin / operator —— 权限演示闭环的两个角色 */
  role: 'admin' | 'operator'
  avatar: string
}

/** 登录返回 */
export interface LoginResult {
  token: string
  user: UserInfo
}

/** 用户管理列表行(server /user/list 返回;password 永不下发) */
export interface UserRow {
  id: string
  username: string
  nickname: string
  role: 'admin' | 'operator'
  /** 已停用:停用账号不可登录 */
  disabled: boolean
  /** 内置种子账号:禁删、禁停用、禁改角色 */
  builtin: boolean
}

/* ==================== 园区分布(地图页) ==================== */

/** 园区(服务端下发,含经纬度与运营数据) */
export interface ParkInfo {
  id: string
  name: string
  province: string
  city: string
  /** 行政区划编码(GB/T 2260):下钻定位的依据 */
  adcode: number
  /** 经纬度(WGS84) */
  lng: number
  lat: number
  /** 设备总数(决定图标分级) */
  devices: number
  /** 今日告警数 */
  alarms: number
  /** 入驻率 0-100 */
  occupancy: number
}

/** 规模分档阈值(与后端同一份数据,避免两处写死) */
export interface ParkScale {
  large: number
  medium: number
}
