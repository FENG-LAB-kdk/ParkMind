import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import type { ApiResponse } from '@/types'

/**
 * axios 全链路封装
 *
 * 【请求层设计】原 aiC 项目拦截器用 5 个散落 URL 数组做特判,
 * 每加一个特例页面就要改全局拦截器 —— 这是典型的"配置污染全局"。
 * 改良:引入 config.meta 元数据,错误策略随请求走,拦截器只保留通用逻辑。
 *
 * 约定:后端返回 { code, data, message },code === 0 视为成功。
 */
const service = axios.create({ baseURL: '/api', timeout: 15000 })

/** 请求级元数据:错误策略下放到单请求,拦截器保持纯净 */
export interface RequestMeta {
  /** 静默失败:不弹全局错误(由调用方自行处理) */
  silent?: boolean
  /** 自定义错误回调(如局部提示) */
  onError?: (msg: string) => void
}

declare module 'axios' {
  export interface AxiosRequestConfig {
    meta?: RequestMeta
  }
}

/* ---- 请求拦截:注入 token(登录态演示闭环) ---- */
service.interceptors.request.use(config => {
  const token = localStorage.getItem('pm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/* ---- 响应拦截:统一错误收敛 ---- */
service.interceptors.response.use(
  res => {
    const body = res.data as ApiResponse
    if (body.code === 0) return res
    const meta = res.config.meta
    const msg = body.message || '请求失败'
    if (!meta?.silent) ElMessage.error(msg)
    meta?.onError?.(msg)
    return Promise.reject(new Error(msg))
  },
  error => {
    const meta = error.config?.meta
    // 401:token 失效 → 清登录态回登录页
    if (error.response?.status === 401) {
      localStorage.removeItem('pm_token')
      localStorage.removeItem('pm_user')
      if (!location.hash.includes('/login')) {
        ElMessage.warning('登录已过期,请重新登录')
        location.hash = '#/login'
      }
      return Promise.reject(error)
    }
    if (axios.isCancel(error)) return Promise.reject(error)
    const msg =
      error.response?.data?.message || (error.code === 'ECONNABORTED' ? '请求超时,请稍后重试' : '网络异常,请检查连接')
    if (!meta?.silent) ElMessage.error(msg)
    meta?.onError?.(msg)
    return Promise.reject(error)
  }
)

/** 泛型请求方法:返回业务 data 部分 */
export async function request<T>(cfg: AxiosRequestConfig): Promise<T> {
  const res = await service.request<ApiResponse<T>>(cfg)
  return res.data.data
}

export const get = <T>(url: string, params?: Record<string, unknown>, meta?: RequestMeta) =>
  request<T>({ url, method: 'get', params, meta })

export const post = <T>(url: string, data?: unknown, meta?: RequestMeta) =>
  request<T>({ url, method: 'post', data, meta })

export const put = <T>(url: string, data?: unknown, meta?: RequestMeta) =>
  request<T>({ url, method: 'put', data, meta })

export const del = <T>(url: string, meta?: RequestMeta) => request<T>({ url, method: 'delete', meta })

export default service
