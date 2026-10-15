/// <reference lib="webworker" />
import { lttb } from '@/utils/downsample/lttb'

/**
 * 降采样 Worker —— 大数据曲线抽稀放到独立线程
 *
 * 【Web Worker】10 万点 lttb 单次约 10~40ms,若在主线程执行会
 * 阻塞滚动与动画(可用性能探针的 longtask 观测)。Worker 独立线程,
 * 主线程只收最终 ~千级个点渲染。传输层说明:十万点结构化克隆约 1.6MB,
 * 可接受;若上百万点可改 Float64Array + transferable 零拷贝(见注释),
 * 本项目实测场景未到该量级,不引入无谓复杂度(简单优先)。
 */
export interface DownsampleRequest {
  id: number
  points: Array<{ x: number; y: number }>
  threshold: number
}

export interface DownsampleResponse {
  id: number
  points: Array<{ x: number; y: number }>
}

self.onmessage = (e: MessageEvent<DownsampleRequest>) => {
  const { id, points, threshold } = e.data
  const resp: DownsampleResponse = { id, points: lttb(points, threshold) }
  self.postMessage(resp)
}
