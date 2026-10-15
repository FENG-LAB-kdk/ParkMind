import { ref } from 'vue'

/**
 * useChatStream —— 大模型流式对话(SSE + ReadableStream + 中断)
 *
 * 【技术选型】
 * 1. 不能用 EventSource:它只支持 GET,而对话必须 POST(要发 messages 数组);
 *    而且它不能自定义请求头、不能主动中断。
 * 2. 不能用 axios:axios 的响应模型是"整个响应体到齐才 resolve",
 *    而大模型是边算边吐的流,用 axios 拿不到中间过程 —— 逐字效果直接没了。
 * 3. 所以用原生 fetch + `response.body.getReader()`:拿到的是一个可增量读取的
 *    ReadableStream,读一段渲染一段。
 *
 * 【SSE 分帧与粘包】
 * TCP 是字节流,没有"消息边界"。上游发的一帧
 *     data: {"delta":"你"}\n\n
 * 可能被切成两次到达(`data: {"delt` + `a":"你"}\n\n`),也可能两帧挤在一次
 * read() 里一起到达。处理办法是**攒缓冲 + 按分隔符切 + 尾段留到下一轮**:
 *     buffer += decoder.decode(value, { stream: true })
 *     const frames = buffer.split('\n\n')
 *     buffer = frames.pop()!        // ← 关键:最后一段可能不完整,塞回缓冲
 * 漏掉 pop 这一步,就会出现"偶尔丢字"或 JSON.parse 报错 —— 而且是偶发的,
 * 本地跑不出来、线上才出现。
 * `{ stream: true }` 同理:一个中文字 3 个字节,可能被劈成 1+2 两次到达,
 * 不加这个参数就会解出乱码。
 *
 * 【中断处理】AbortController 的 signal 透传给 fetch,abort() 会同时
 * 掐断浏览器侧的连接;服务端 res 的 close 事件随即触发,把上游请求也 abort 掉
 * (见 server/src/ai.js)—— 否则用户以为停了,服务端还在烧 token。
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** 本轮的报错信息;有值时界面上单独渲染成一行提示,不与正文混在一起 */
  error?: string
}

/** 服务端约定的三种帧(见 server/src/ai.js 的注释) */
interface DeltaFrame {
  delta?: string
  done?: boolean
  error?: string
}

export function useChatStream() {
  const messages = ref<ChatMessage[]>([])
  const streaming = ref(false)
  /** 首字延迟:从发出请求到收到第一个 delta 的毫秒数,流式体验的核心指标 */
  const firstTokenMs = ref<number | null>(null)

  let controller: AbortController | null = null

  function stop() {
    controller?.abort()
  }

  function reset() {
    stop()
    messages.value = []
    firstTokenMs.value = null
  }

  async function send(text: string) {
    const question = text.trim()
    if (!question || streaming.value) return

    messages.value.push({ role: 'user', content: question })
    // 先把助手这条占位推进去,后续 delta 直接往它身上累加 ——
    // 界面不需要"重新渲染整条消息",只更新这一条的文本
    const reply: ChatMessage = { role: 'assistant', content: '' }
    messages.value.push(reply)
    const replyIndex = messages.value.length - 1

    streaming.value = true
    firstTokenMs.value = null
    const startedAt = performance.now()

    controller = new AbortController()

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 多轮对话要把历史整体带上(大模型接口无状态,见 DeepSeek 多轮对话文档);
        // 出错的那几条不进历史,避免把错误信息当成模型说过的话喂回去
        body: JSON.stringify({
          messages: messages.value
            .slice(0, replyIndex)
            .filter(m => !m.error)
            .map(m => ({ role: m.role, content: m.content }))
        }),
        signal: controller.signal
      })

      if (!res.ok) {
        // 后端在流开始前返回的错误是 JSON(比如 503 未配置 key)
        const body = await res.json().catch(() => null)
        throw new Error(body?.message || `请求失败(HTTP ${res.status})`)
      }
      if (!res.body) throw new Error('响应没有可读流,当前环境可能不支持 ReadableStream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      /** 跨 chunk 残留:一个 SSE 帧可能被切开,尾段留到下一轮再拼 */
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break

        // stream: true —— 暂存被切断的多字节字符(一个汉字 3 字节),否则会解出乱码
        buffer += decoder.decode(value, { stream: true })

        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? '' // 最后一段可能不完整,塞回缓冲等下一轮

        for (const frame of frames) {
          const dataLine = frame.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          const payload = dataLine.slice(5).trim()
          if (!payload) continue

          let parsed: DeltaFrame
          try {
            parsed = JSON.parse(payload)
          } catch {
            continue // 非 JSON 帧(心跳等)跳过
          }

          if (parsed.error) {
            reply.error = parsed.error
            break
          }
          if (parsed.delta) {
            if (firstTokenMs.value === null) {
              firstTokenMs.value = Math.round(performance.now() - startedAt)
            }
            reply.content += parsed.delta
          }
        }
      }
    } catch (err) {
      // 用户主动点"停止"会触发 AbortError —— 这是预期行为,不算错误,
      // 已经收到的半截回答要保留(用户看到的应该就是"说到哪算哪")
      if ((err as Error)?.name !== 'AbortError') {
        reply.error = (err as Error)?.message || String(err)
      }
    } finally {
      streaming.value = false
      controller = null
    }
  }

  return { messages, streaming, firstTokenMs, send, stop, reset }
}
