import { ref, onUnmounted } from 'vue'
import type { WsFrame } from '@/types'
import { apiReplayFrames } from '@/api'

/**
 * useWebSocket —— 实时链路前端核心
 *
 * 【可靠性三件套】
 * 1. 心跳保活:每 HEARTBEAT_INTERVAL 发 ping,后端回 pong;连续 N 次无响应
 *    判定假死,主动断开重连 —— 解决 NAT 静默断链、服务端半开连接
 * 2. 指数退避重连:1s → 2s → 4s … 上限 30s,随机抖动 ±20%,防止
 *    多客户端同时重连打爆服务端(惊群问题)
 * 3. 断线补偿:每条消息带全局自增 seq;重连成功后前端把 lastSeq 上报,
 *    后端从消息环回放缺失区间 —— 实时链路与 REST 互补,一条不丢
 *
 * 【实现思路】部分来源于原 aiC 项目 STOMP 订阅,改良:自研 ws + seq 补偿协议,
 * 去掉对 STOMP 中间件的依赖
 */
export interface UseWsOptions {
  url: string
  heartbeat?: number
  onMessage: (frame: WsFrame) => void
  /** 连接状态变化回调(UI 可显示"已断开/重连中") */
  onStatus?: (status: WsStatus) => void
}

export type WsStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

export function useWebSocket(options: UseWsOptions) {
  const { url, heartbeat = 10000, onMessage } = options
  const status = ref<WsStatus>('closed')
  /** 最后一条消息序号 —— 重连补偿锚点 */
  const lastSeq = ref(0)
  const connected = ref(false)

  let ws: WebSocket | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let pingCount = 0
  let closedByUser = false

  const setStatus = (s: WsStatus) => {
    status.value = s
    options.onStatus?.(s)
  }

  const startHeartbeat = () => {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState !== WebSocket.OPEN) return
      pingCount++
      // 连续 2 个心跳周期未收到 pong → 假死,强制重连
      if (pingCount > 2) {
        ws.close()
        return
      }
      ws.send(JSON.stringify({ type: 'heartbeat', seq: 0, data: 'ping' } satisfies WsFrame))
    }, heartbeat)
  }
  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = null
    pingCount = 0
  }

  const scheduleReconnect = () => {
    if (closedByUser) return
    setStatus('reconnecting')
    // 指数退避 + 抖动:1s,2s,4s,8s,16s,30s 封顶
    const delay = Math.min(30000, 1000 * 2 ** reconnectAttempts) * (0.8 + Math.random() * 0.4)
    reconnectAttempts++
    reconnectTimer = setTimeout(connect, delay)
  }

  const applyFrame = (frame: WsFrame) => {
    if (typeof frame.seq === 'number' && frame.seq > lastSeq.value) lastSeq.value = frame.seq
    onMessage(frame)
  }

  /** 重连成功后补偿:从 lastSeq 之后补拉丢失消息(REST 补拉,规避海量重推) */
  const replayMissed = async () => {
    if (!lastSeq.value) return
    try {
      // 走 api 层而不是裸路径:接口定义集中在一处,改路径不用全仓搜字符串
      const frames = await apiReplayFrames(lastSeq.value)
      frames.forEach(applyFrame)
    } catch {
      /* 补偿失败由下一次心跳周期自然兜底,不阻断连接 */
    }
  }

  function connect() {
    setStatus(reconnectAttempts ? 'reconnecting' : 'connecting')
    ws = new WebSocket(url)
    ws.onopen = () => {
      connected.value = true
      reconnectAttempts = 0
      setStatus('open')
      startHeartbeat()
      replayMissed()
    }
    ws.onmessage = ev => {
      try {
        const frame = JSON.parse(ev.data as string) as WsFrame
        if (frame.type === 'heartbeat' && frame.data === 'pong') pingCount = 0
        else applyFrame(frame)
      } catch {
        /* 非 JSON 帧忽略 */
      }
    }
    ws.onclose = () => {
      connected.value = false
      stopHeartbeat()
      if (!closedByUser) scheduleReconnect()
      else setStatus('closed')
    }
    ws.onerror = () => ws?.close()
  }

  /** 组件卸载必须清理:关连接、清定时器 —— 内存泄漏防治(常见陷阱) */
  function destroy() {
    closedByUser = true
    stopHeartbeat()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
    ws = null
  }

  onUnmounted(destroy)

  return {
    status,
    connected,
    lastSeq,
    connect,
    destroy,
    /** 主动断开(如退出登录) */
    close() {
      closedByUser = true
      destroy()
    }
  }
}
