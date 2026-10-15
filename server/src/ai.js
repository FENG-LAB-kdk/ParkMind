/**
 * 园区智能运维助手 —— 大模型接入层(只在服务端运行)
 *
 * 【密钥为什么不能给前端】
 * 前端产物(dist/)是浏览器可直接下载的静态文件。任何写进 `import.meta.env.VITE_*`
 * 的东西都会被打进 js 里明文可见 —— 等于把 key 公示。所以链路设计成:
 *   浏览器 → 自己的 /api/ai/chat(SSE) → 服务端持 key 调 DeepSeek
 * 前端从头到尾不知道上游是哪家模型、用什么鉴权,换供应商只改这一层。
 *
 * 【为什么不能用 axios 接流】
 * 大模型是"边算边吐"的,响应体是持续增长的流。axios 的模型是"等整个响应体到齐
 * 再 resolve",用它拿流会在浏览器里失去逐字效果。所以服务端用原生 fetch 拿到
 * ReadableStream 边读边转发,前端也用原生 fetch + response.body.getReader()。
 *
 * 【为什么要拆帧重组】
 * 直接 pipe 上游字节流最省事,但会把前端和 DeepSeek 的响应格式焊死 ——
 * 以后换智谱/通义,前端解析代码全得跟着改。这里做一层**协议适配**:
 * 上游的 `choices[0].delta.content` 被拆出来,重新封装成本项目自己的极简帧:
 *   data: {"delta":"文本"}    逐字增量
 *   data: {"done":true}       正常结束
 *   data: {"error":"..."}     出错
 * 前端只认这三种帧,与上游协议解耦。
 *
 * 【key 从哪来】项目根的 .env(已被 .gitignore 忽略),变量清单见 .env.example
 */

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getState, counters, pendingAlarmCount } from './data.js'

/* ---------------- 加载 .env ---------------- */
// Node 20.12+ 提供 process.loadEnvFile,先用平台能力,失败再忽略(不引 dotenv 依赖)
const ENV_PATH = fileURLToPath(new URL('../../.env', import.meta.url))
if (typeof process.loadEnvFile === 'function' && existsSync(ENV_PATH)) {
  try {
    process.loadEnvFile(ENV_PATH)
  } catch {
    /* .env 里有语法问题时不要卡住整个数据服务 */
  }
}

const API_KEY = process.env.DEEPSEEK_API_KEY || ''
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'

/** 是否配置了 key:没配就前端只提示"未配置",而不是抛 500 */
export const aiConfigured = () => !!API_KEY

/** 单次请求最多带几轮历史(多轮对话要把历史全带上,但不该无限增长) */
const MAX_HISTORY = 12

/**
 * 把当前园区数据压成一段纯文本,作为 system prompt 的一部分
 *
 * 【为什么要做这一步】大模型不知道"云麓大厦今天多少度电"。把真实数据放进
 * prompt(业界叫 grounding / 上下文注入),回答才有依据,否则它会一本正经地
 * 编数字 —— 运维场景里编数字比不回答更危险。
 */
export function buildParkContext() {
  const { buildings, devices, alarms } = getState()
  const running = devices.filter(d => d.status === 'running').length
  const fault = devices.filter(d => d.status === 'fault').length
  const offline = devices.filter(d => d.status === 'offline').length

  const lines = []
  lines.push('【园区实时数据】')
  lines.push(
    `总功率 ${buildings.reduce((s, b) => s + b.power, 0)} kW;` +
      `今日能耗 ${counters.todayEnergy} kWh;` +
      `今日访客 ${counters.todayVisitors} 人;今日车辆 ${counters.todayCars} 辆`
  )
  lines.push(`设备共 ${devices.length} 台:运行 ${running}、故障 ${fault}、离线 ${offline}`)
  lines.push(`未处理告警 ${pendingAlarmCount} 条`)

  lines.push('')
  lines.push(`【楼宇清单(共 ${buildings.length} 栋)】`)
  buildings.forEach(b => {
    const bd = devices.filter(d => d.buildingId === b.id)
    const bf = bd.filter(d => d.status === 'fault').length
    lines.push(
      `- ${b.name}(id=${b.id},${b.type}):功率 ${b.power} kW,入住率 ${b.occupancyRate}%,` +
        `租户 ${b.tenantCount} 家,${b.floors} 层,设备 ${bd.length} 台(故障 ${bf} 台)`
    )
  })

  lines.push('')
  lines.push('【最近告警(最新在前,最多 20 条)】')
  const levelText = { 1: '紧急', 2: '重要', 3: '一般', 4: '提示' }
  alarms.slice(0, 20).forEach(a => {
    const t = new Date(a.time).toLocaleString('zh-CN', { hour12: false })
    lines.push(`- [${levelText[a.level] || a.level}] ${t} ${a.buildingName} ${a.deviceName || ''} ${a.message}`)
  })

  return lines.join('\n')
}

/**
 * 系统提示词
 *
 * 【为什么要约束模型】园区运维场景下,模型编一个
 * "3 号楼昨天用电 1200 度"比它答不上来危害大得多 —— 运营人员可能据此做决策。
 * 明确禁止编造 + 要求引用数据来源,是这类 RAG/上下文注入应用的标配约束。
 */
function buildSystemPrompt() {
  return [
    '你是 ParkMind 智慧园区运营平台的智能运维助手,面向园区运营人员。',
    '',
    '回答要求:',
    '1. 只依据下面《园区实时数据》作答;数据里没有的信息,直接回答"当前数据里没有相关信息",绝不编造数字',
    '2. 回答简洁,先给结论再给依据;涉及数量必须带单位',
    '3. 问"哪栋/哪个"时,要给出具体的楼宇名或设备名,不要只说"某栋"',
    '4. 涉及建议时,给出可执行的下一步(比如"建议排查 X 号设备")',
    '',
    buildParkContext()
  ].join('\n')
}

/**
 * 处理一次流式对话
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function handleChat(req, res) {
  /**
   * 【为什么要整段包 try/catch,而不是只包 fetch】
   * Express 4 不接管 async 处理函数返回的 Promise —— 里面抛出的异常不会变成
   * 500 响应,而是变成 unhandledRejection/uncaughtException 直接把进程带走。
   * 这一点是真踩过的:一个变量名拼错就让整个数据服务(连同 WebSocket 推送)全停了。
   * 所以这里把函数体整段兜住,任何意外都退化成一条 error 帧 + 正常收尾。
   */
  try {
    return await chat(req, res)
  } catch (err) {
    if (err?.name === 'AbortError') return res.end()
    if (!res.headersSent) {
      return res.status(500).json({ code: 1, data: null, message: String(err?.message || err) })
    }
    res.write(`data: ${JSON.stringify({ error: String(err?.message || err) })}\n\n`)
    res.end()
  }
}

async function chat(req, res) {
  if (!aiConfigured()) {
    return res.status(503).json({ code: 1, data: null, message: '未配置 DEEPSEEK_API_KEY,请参考 .env.example' })
  }

  const incoming = Array.isArray(req.body?.messages) ? req.body.messages : []
  if (!incoming.length) {
    return res.status(400).json({ code: 1, data: null, message: 'messages 不能为空' })
  }

  /** SSE 响应头 —— 每一项都有原因,少一个就会出现"假流式" */
  res.writeHead(200, {
    // 事件流 MIME;charset 必须写,否则中文在某些代理下会乱码
    'Content-Type': 'text/event-stream; charset=utf-8',
    // 事件流不能被缓存,no-transform 顺带禁止中间代理压缩改写
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx 默认会缓冲后端响应,不关掉的话逐字流会被攒成一坨再下发
    'X-Accel-Buffering': 'no'
  })

  const send = obj => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  /**
   * 客户端断开(用户点了"停止"/关了页面)时要主动掐断上游请求。
   * 不做这件事的后果:用户以为停了,服务端还在为它烧 token 直到模型跑完。
   *
   * 【必须是 res 而不是 req —— 这是实测踩出来的坑】
   * Node 18+ 里 `req.on('close')` 在**请求体读完就会触发**,并不代表客户端断开。
   * express.json() 一读完 body,close 就来了;拿它当"用户走了"的信号,
   * 会在请求刚进来的几毫秒内就把自己发往上游的 fetch 给 abort 掉。
   * 现象极具迷惑性:接口 200、Content-Type 正确、但流里一个字节都没有。
   *
   * 最小复现(Express 4 + Node 24 + 带 JSON body 的 POST)实测时间线:
   *   [handler 进入] → [req close] +2ms → [res close] +2007ms (writableEnded=true)
   *
   * res 的 close 才对应"响应流关闭",再用 writableEnded 区分两种收场:
   *   正常跑完   → writableEnded=true,什么都不用做
   *   客户端跑了 → writableEnded=false,abort 上游止损
   */
  const ac = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) ac.abort()
  })

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...incoming.slice(-MAX_HISTORY).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '')
    }))
  ]

  try {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`
      },
      // 运维问答要的是准确而不是创意,温度调低
      body: JSON.stringify({ model: MODEL, messages, stream: true, temperature: 0.3 }),
      signal: ac.signal
    })

    if (!upstream.ok) {
      const detail = await upstream.text()
      send({ error: `上游返回 ${upstream.status}:${detail.slice(0, 300)}` })
      return res.end()
    }

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    /** 跨 chunk 的残留:一个 SSE 帧可能被 TCP 切成两半,尾段必须留到下一轮 */
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      // stream: true 让 TextDecoder 暂存被切断的多字节字符,避免中文被劈成乱码
      buffer += decoder.decode(value, { stream: true })

      // SSE 规范用空行分隔帧;最后一段多半是不完整的,pop 出来等下一轮
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''

      for (const frame of frames) {
        // 一帧里可能有多行,只认 data: 行(上游还会发 : 开头的注释心跳)
        const dataLine = frame.split('\n').find(l => l.startsWith('data:'))
        if (!dataLine) continue
        const payload = dataLine.slice(5).trim()
        if (!payload) continue
        if (payload === '[DONE]') {
          send({ done: true })
          return res.end()
        }
        try {
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content
          if (delta) send({ delta })
        } catch {
          /* 非 JSON 帧(心跳等)直接跳过 */
        }
      }
    }

    // 上游没发 [DONE] 就断了(网络闪断),也要给前端一个明确的收尾
    send({ done: true })
    res.end()
  } catch (err) {
    // 客户端主动断开时 ac.abort() 会让 fetch 抛 AbortError —— 这是我们自己要的,不用报错
    if (err?.name === 'AbortError') return res.end()
    send({ error: String(err?.message || err) })
    res.end()
  }
}
