import { get, post, put, del } from '@/utils/request'
import type {
  Alarm,
  Building,
  Device,
  LoginResult,
  PageResult,
  ParkInfo,
  ParkOverview,
  ParkScale,
  UserInfo,
  UserRow,
  WsFrame
} from '@/types'

/**
 * API 层 —— 一行一接口,按业务模块分区
 * (原 aiC 项目"common/api.js 一行一接口"规范,收敛为单个 index 便于通读)
 */

/* ---- 认证 ---- */
export const apiLogin = (username: string, password: string) =>
  get<LoginResult>('/auth/login', { username, password }, { silent: true })
export const apiProfile = () => get<UserInfo>('/auth/profile', undefined, { silent: true })

/* ---- 楼宇 ---- */
export interface BuildingQuery {
  page: number
  limit: number
  keyword?: string
  type?: string
}
export const apiBuildings = (q: BuildingQuery) => get<PageResult<Building>>('/building/list', q as never)
export const apiBuildingAdd = (data: Partial<Building>) => post<Building>('/building', data)
export const apiBuildingUpdate = (data: Partial<Building>) => put<Building>('/building', data)
export const apiBuildingDelete = (id: string) => del<{ ok: boolean }>(`/building/${id}`)

/* ---- 设备 ---- */
export interface DeviceQuery {
  page: number
  limit: number
  buildingId?: string
  type?: string
  status?: string
}
export const apiDevices = (q: DeviceQuery) => get<PageResult<Device>>('/device/list', q as never)
export const apiDeviceAdd = (data: Partial<Device>) => post<Device>('/device', data)
export const apiDeviceUpdate = (data: Partial<Device>) => put<Device>('/device', data)
export const apiDeviceDelete = (id: string) => del<{ ok: boolean }>(`/device/${id}`)

/* ---- 用户管理(系统管理真 CRUD,接口带鉴权) ---- */
export interface UserQuery {
  page: number
  limit: number
  keyword?: string
  role?: 'admin' | 'operator'
}
export const apiUserList = (q: UserQuery) => get<PageResult<UserRow>>('/user/list', q as never)
export const apiUserAdd = (data: {
  username: string
  nickname: string
  password: string
  role: 'admin' | 'operator'
}) => post<UserRow>('/user', data)
export interface UserUpdatePayload {
  id: string
  nickname?: string
  role?: 'admin' | 'operator'
  /** 新增必填;编辑留空 = 不修改 */
  password?: string
  disabled?: boolean
}
export const apiUserUpdate = (data: UserUpdatePayload) => put<UserRow>('/user', data)
export const apiUserDelete = (id: string) => del<{ ok: boolean }>(`/user/${id}`)

/* ---- 告警(支持十万级分页) ---- */
export interface AlarmQuery {
  page: number
  limit: number
  level?: string
  status?: string
  keyword?: string
}
export const apiAlarms = (q: AlarmQuery) => get<PageResult<Alarm>>('/alarm/list', q as never)
export const apiAlarmHandled = (id: string) => put<Alarm>(`/alarm/${id}/handled`)

/* ---- 历史能耗(大屏历史曲线 / 后台报表;服务端返回 {x,y} 点集,直接可喂图表与降采样) ---- */
export const apiEnergyHistory = (buildingId: string, minutes: number, limit = 20000) =>
  get<Array<{ x: number; y: number }>>(`/energy/history`, { buildingId, minutes, limit } as never)

/* ---- 园区总览(大屏 REST 初值) ---- */
export const apiOverview = () => get<ParkOverview>('/overview')

/* ---- 园区分布(地图页) ---- */
/** 全部园区(含经纬度与运营数据) */
export const apiParkList = () => get<ParkInfo[]>('/park/list')
/** 各省园区数(全国视图省份着色) */
export const apiParkProvinceStats = () => get<Record<string, number>>('/park/province-stats')
/** 规模分档阈值(与后端同口径) */
export const apiParkScale = () => get<ParkScale>('/park/scale')

/* ---- WebSocket 断线补偿(REST 补拉,配合 useWebSocket 的 seq) ---- */
export const apiReplayFrames = (afterSeq: number, types?: string) =>
  get<WsFrame[]>('/ws-miss', { afterSeq, types } as never)

/* ---- 智能运维助手 ----
 * 对话主体是一条 SSE 流,不能用 axios(axios 等整个响应体到齐才 resolve,拿不到逐字过程),
 * 所以只有这个"配置探针"走常规 REST,真正的流式在 composables/useChatStream.ts 里用原生 fetch 读。
 */
export const apiAiStatus = () => get<{ configured: boolean }>('/ai/status', undefined, { silent: true })
