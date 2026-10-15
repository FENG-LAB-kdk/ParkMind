/**
 * ParkMind 数据服务 —— Express REST + WebSocket 实时推送
 *
 * 【整体链路】
 * 1. 为什么有服务端:演示 WebSocket 的可靠性设计必须有真实对端
 *    (心跳 pong、seq 回放),纯前端 mock 无法讲通
 * 2. 推送节奏:能耗帧 1s/次 × 8 楼宇、总览帧 3s/次、告警帧随机产生;
 *    前端在 1s 渲染循环里做**增量更新**(只推 series.data,不重建整个 option);
 *    Worker + LTTB 只服务"10 万点历史曲线"那个手动按钮,实时窗口(180 点)不做降采样
 *    —— 180 个点做降采样没有意义,只会凭空引入一层延迟
 * 3. 断线补偿:所有帧进 seq 环(上限 4000),前端重连后带 lastSeq
 *    访问 /api/ws-miss 回放缺口 —— 不丢数
 * 4. 登录:users 内存表(种子 admin/operator,密码 123456)+ /api/user CRUD,
 *    系统管理新增的用户可真实登录;密码明文仅演示(生产 BCrypt 哈希 + JWT 验签)
 */

import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import {
  getState,
  frameRing,
  pushFrame,
  pendingAlarmCount,
  markAlarmHandled,
  setFrameSink,
  counters,
  evolveCounters
} from './data.js'
import { getParks, getProvinceParkCount, PARK_SCALE } from './park.js'
import { handleChat, aiConfigured } from './ai.js'

const app = express()
app.use(cors())
app.use(express.json())

const ok = data => ({ code: 0, data, message: 'ok' })
const fail = (message, code = 1) => ({ code, data: null, message })

/* ============ 认证与用户表(演示:内存态,重启回种子) ============ */
const users = [
  {
    id: 'u1',
    username: 'admin',
    nickname: '系统管理员',
    role: 'admin',
    password: '123456',
    disabled: false,
    builtin: true
  },
  {
    id: 'u2',
    username: 'operator',
    nickname: '运营专员',
    role: 'operator',
    password: '123456',
    disabled: false,
    builtin: true
  }
]
const findUser = username => users.find(x => x.username === username)

/** 登录/个人资料:对外字段白名单(password/disabled/builtin 永不下发 —— 企业惯例) */
const publicUser = u => ({ id: u.id, username: u.username, nickname: u.nickname, role: u.role, avatar: '' })
/** 用户管理列表行:附带 disabled/builtin 供前端控制按钮,但同样不含 password */
const listUser = u => ({
  id: u.id,
  username: u.username,
  nickname: u.nickname,
  role: u.role,
  disabled: !!u.disabled,
  builtin: !!u.builtin
})

app.get('/api/auth/login', (req, res) => {
  const { username, password } = req.query
  const user = findUser(username)
  if (!user || user.password !== password)
    return res.status(200).json(fail('账号或密码错误(演示种子:admin/operator,密码 123456)'))
  if (user.disabled) return res.status(200).json(fail('账号已停用,请联系管理员'))
  res.json(ok({ token: `demo_${username}_${Date.now()}`, user: publicUser(user) }))
})

/** 鉴权中间件:演示用,生产应验签 JWT(拦截器 401 场景用) */
function auth(req, res, next) {
  const token = req.headers.authorization || ''
  if (!token.startsWith('Bearer demo_')) return res.status(401).json(fail('登录已过期', 401))
  const username = token.replace('Bearer demo_', '').split('_')[0]
  const user = findUser(username)
  if (!user) return res.status(401).json(fail('登录已过期', 401))
  req.user = user
  next()
}

app.get('/api/auth/profile', auth, (req, res) => res.json(ok(req.user)))

/* ============ 用户管理 CRUD(系统管理:带鉴权,演示"管理级接口需登录态") ============ */
app.get('/api/user/list', auth, (req, res) => {
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 10
  const keyword = String(req.query.keyword || '').trim()
  let list = users
  if (keyword) list = list.filter(u => u.username.includes(keyword) || u.nickname.includes(keyword))
  if (req.query.role) list = list.filter(u => u.role === req.query.role)
  res.json(ok({ list: list.slice((page - 1) * limit, page * limit).map(listUser), total: list.length, page, limit }))
})

app.post('/api/user', auth, (req, res) => {
  const { username, nickname, password, role } = req.body || {}
  if (!username || !nickname || !password || !role)
    return res.json(fail('参数不完整:username/nickname/password/role 必填'))
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(username)) return res.json(fail('账号需以字母开头,3-20 位字母/数字/下划线'))
  if (password.length < 6) return res.json(fail('密码至少 6 位'))
  if (!['admin', 'operator'].includes(role)) return res.json(fail('角色不合法'))
  if (findUser(username)) return res.json(fail('账号已存在')) // 唯一性校验
  const u = { id: `u${Date.now().toString(36)}`, username, nickname, role, password, disabled: false, builtin: false }
  users.push(u)
  res.json(ok(listUser(u)))
})

app.put('/api/user', auth, (req, res) => {
  const { id, nickname, role, password, disabled } = req.body || {}
  const u = users.find(x => x.id === id)
  if (!u) return res.json(fail('用户不存在'))
  // 内置种子账号只允许改昵称 —— 防停用/降权后把自己锁在门外
  if (u.builtin && (role !== undefined || disabled !== undefined)) return res.json(fail('内置账号仅可修改昵称'))
  if (role !== undefined && !['admin', 'operator'].includes(role)) return res.json(fail('角色不合法'))
  if (password !== undefined && password !== '' && password.length < 6) return res.json(fail('密码至少 6 位'))
  if (nickname !== undefined) u.nickname = nickname
  if (!u.builtin && role !== undefined) u.role = role
  if (!u.builtin && disabled !== undefined) u.disabled = !!disabled
  if (password) u.password = password // 空串 = 不修改
  res.json(ok(listUser(u)))
})

app.delete('/api/user/:id', auth, (req, res) => {
  const i = users.findIndex(x => x.id === req.params.id)
  if (i < 0) return res.json(fail('用户不存在'))
  if (users[i].builtin) return res.json(fail('内置账号不可删除'))
  if (users[i].username === req.user.username) return res.json(fail('不能删除当前登录账号'))
  users.splice(i, 1)
  res.json(ok({ ok: true }))
})

/* ============ 楼宇 CRUD ============ */
const { buildings, devices, alarms, produceAlarm, evolveEnergy, evolveDevices, nextSeq: seqFn } = getState()
// pendingAlarmCount / markAlarmHandled 走顶层 ESM 活绑定(实时读到最新值)

app.get('/api/building/list', (req, res) => {
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 10
  let list = buildings
  const keyword = String(req.query.keyword || '').trim()
  if (keyword) list = list.filter(b => b.name.includes(keyword))
  if (req.query.type) list = list.filter(b => b.type === req.query.type)
  res.json(ok({ list: list.slice((page - 1) * limit, page * limit), total: list.length, page, limit }))
})

app.post('/api/building', (req, res) => {
  const { name, type, floors, area } = req.body || {}
  if (!name || !type) return res.json(fail('参数不完整:name/type 必填'))
  const b = {
    id: `b${Date.now().toString(36)}`,
    name,
    type,
    floors: Number(floors) || 6,
    area: Number(area) || 5000,
    occupancyRate: Math.round(30 + Math.random() * 60),
    tenantCount: Math.round(2 + Math.random() * 30),
    power: 100,
    status: 'normal'
  }
  buildings.push(b)
  res.json(ok(b))
})

app.put('/api/building', (req, res) => {
  const b = buildings.find(x => x.id === (req.body || {}).id)
  if (!b) return res.json(fail('楼宇不存在'))
  Object.assign(b, req.body)
  res.json(ok(b))
})

app.delete('/api/building/:id', (req, res) => {
  const i = buildings.findIndex(x => x.id === req.params.id)
  if (i < 0) return res.json(fail('楼宇不存在'))
  buildings.splice(i, 1)
  res.json(ok({ ok: true }))
})

/* ============ 设备 CRUD ============ */
app.get('/api/device/list', (req, res) => {
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 10
  let list = devices
  if (req.query.buildingId) list = list.filter(d => d.buildingId === req.query.buildingId)
  if (req.query.type) list = list.filter(d => d.type === req.query.type)
  if (req.query.status) list = list.filter(d => d.status === req.query.status)
  res.json(ok({ list: list.slice((page - 1) * limit, page * limit), total: list.length, page, limit }))
})

app.post('/api/device', (req, res) => {
  const { name, type, buildingId } = req.body || {}
  if (!name || !type || !buildingId) return res.json(fail('参数不完整:name/type/buildingId 必填'))
  if (!buildings.some(b => b.id === buildingId)) return res.json(fail('所属楼宇不存在')) // 关联完整性校验
  const d = {
    id: `d_${Date.now().toString(36)}`,
    name,
    type,
    buildingId,
    status: 'running',
    value: 0,
    updatedAt: Date.now()
  }
  devices.push(d)
  res.json(ok(d))
})

app.put('/api/device', (req, res) => {
  const { id, buildingId } = req.body || {}
  const d = devices.find(x => x.id === id)
  if (!d) return res.json(fail('设备不存在'))
  if (buildingId !== undefined && !buildings.some(b => b.id === buildingId)) return res.json(fail('所属楼宇不存在'))
  Object.assign(d, req.body) // 字段白名单由前端约束,演示简化
  res.json(ok(d))
})

app.delete('/api/device/:id', (req, res) => {
  const i = devices.findIndex(x => x.id === req.params.id)
  if (i < 0) return res.json(fail('设备不存在'))
  devices.splice(i, 1)
  res.json(ok({ ok: true }))
})

/* ============ 告警(十万级分页) ============ */
app.get('/api/alarm/list', (req, res) => {
  const page = Number(req.query.page) || 1
  const limit = Number(req.query.limit) || 10
  let list = alarms
  if (req.query.level) list = list.filter(a => a.level === Number(req.query.level))
  if (req.query.status) list = list.filter(a => a.status === req.query.status)
  if (req.query.buildingId) list = list.filter(a => a.buildingId === req.query.buildingId)
  const keyword = String(req.query.keyword || '').trim()
  if (keyword) list = list.filter(a => a.message.includes(keyword) || a.buildingName.includes(keyword))
  res.json(ok({ list: list.slice((page - 1) * limit, page * limit), total: list.length, page, limit }))
})

app.put('/api/alarm/:id/handled', (req, res) => {
  const a = markAlarmHandled(req.params.id)
  if (!a) return res.json(fail('告警不存在'))
  res.json(ok(a))
})

/* ============ 能耗历史(十万级采样,供 Worker 降采样演示) ============ */
app.get('/api/energy/history', (req, res) => {
  const { buildingId, minutes = 60, limit = 20000 } = req.query
  const b = buildings.find(x => x.id === buildingId)
  const n = Math.min(Number(limit) || 20000, 120_000)
  const now = Date.now()
  const span = Math.min(Number(minutes) || 60, 600) * 60_000
  const points = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = now - span + (span * i) / n
    const base = b ? b.power : 300
    const wave = Math.sin(i / 40) * base * 0.12 // 周期波动(视觉上更像真实曲线)
    const noise = (Math.random() - 0.5) * base * 0.06
    points[i] = { x: t, y: Math.max(10, Math.round(base + wave + noise)) }
  }
  res.json(ok(points))
})

/* ============ 总览(REST 初值) ============ */
function buildOverview() {
  return {
    ts: Date.now(),
    totalPower: buildings.reduce((s, b) => s + b.power, 0),
    todayEnergy: counters.todayEnergy,
    runningDevices: devices.filter(d => d.status === 'running').length,
    faultDevices: devices.filter(d => d.status === 'fault').length,
    occupancyRate: Math.round(buildings.reduce((s, b) => s + b.occupancyRate, 0) / buildings.length),
    tenantCount: buildings.reduce((s, b) => s + b.tenantCount, 0),
    todayVisitors: counters.todayVisitors,
    todayCars: counters.todayCars,
    activeAlarms: pendingAlarmCount
  }
}

app.get('/api/overview', (req, res) => res.json(ok(buildOverview())))

/* ============ 园区分布(地图页) ============ */
/** 全部园区(静态态势数据,含经纬度/规模/设备/告警) */
app.get('/api/park/list', (req, res) => res.json(ok(getParks())))
/** 各省园区数(全国视图的省份着色用) */
app.get('/api/park/province-stats', (req, res) => res.json(ok(getProvinceParkCount())))
/** 规模分档阈值(前端图标分级与这里保持一致,避免两处写死不同口径) */
app.get('/api/park/scale', (req, res) => res.json(ok(PARK_SCALE)))

/* ============ 园区无人车(3D 监控页) ============ */

/* ============ 智能运维助手(流式对话) ============ */
/** 配置探针:前端据此决定是"可用"还是提示去配 .env —— 不带 key 的 500 对用户没有信息量 */
app.get('/api/ai/status', (req, res) => res.json(ok({ configured: aiConfigured() })))
/**
 * SSE 流式对话。这里刻意不用 auth 中间件:与其它数据路由(alarm/building/device)
 * 保持一致 —— 本项目演示重点在流式传输本身,鉴权链路由 /api/user/* 那组演示。
 */
app.post('/api/ai/chat', handleChat)

/* ============ 断线补偿:REST 回放 seq 环缺口 ============ */
app.get('/api/ws-miss', (req, res) => {
  const afterSeq = Number(req.query.afterSeq) || 0
  const frames = frameRing.filter(f => f.seq > afterSeq)
  res.json(ok(frames))
})

/* ============ WebSocket:实时推送(与 HTTP 同端口,path 分流) ============ */
import { createServer } from 'http'
const httpServer = createServer(app)
const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

wss.on('connection', ws => {
  ws.isAlive = true
  ws.on('pong', () => {
    ws.isAlive = true
  })
  ws.on('message', msg => {
    try {
      const frame = JSON.parse(msg.toString())
      if (frame.type === 'heartbeat' && frame.data === 'ping') {
        ws.send(JSON.stringify({ type: 'heartbeat', seq: 0, data: 'pong' }))
      }
    } catch {
      /* 忽略非法帧 */
    }
  })
})

/** 广播帧(带应用层序号) */
function broadcast(payload) {
  const frame = JSON.stringify(payload)
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(frame)
  })
}

/**
 * 【事故复盘】把广播器注入 data.js,让 pushFrame = 入环 + 推送
 *
 * 曾经的问题:pushFrame 只把帧写进 frameRing(断线补偿的存档),而 broadcast
 * 定义了却从未被调用 —— 表现是"WS 连接正常、心跳正常、但大屏所有数据静止"。
 * 根因是可靠性的两条腿(存档回放 / 实时直播)只接了一条;而且心跳 pong 会
 * 正常回来,连重连补偿都不会触发,故障完全静默。
 * 教训:心跳只证明"链路活着",不证明"业务帧在流动" —— 两者要分别监控。
 *
 * 用注入而非在每个调用点手写 broadcast:produceAlarm 内部那处 pushFrame 在
 * data.js 里拿不到 broadcast,注入后三类帧共用一条出口,新增帧类型不会再漏。
 */
setFrameSink(broadcast)

// 服务端心跳巡检:超过 30s 未收到 pong 的连接判定假死并终止
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate()
    ws.isAlive = false
    ws.ping()
  })
}, 30_000)

/** 定时演化:能耗/设备/告警 —— 每秒一个 tick(真实感:量级可调) */
let tick = 0
setInterval(() => {
  tick++
  evolveEnergy()
  evolveDevices()
  evolveCounters() // 今日能耗/访客/车辆:单调演化,不再每次随机重掷(数字会"倒退"的假象)

  // 能耗帧:每楼宇一点(频率 1Hz;大屏用 Worker 降采样做长窗聚合)
  const now = Date.now()
  buildings.forEach(b => {
    pushFrame({ type: 'energy', seq: seqFn(), data: { ts: now, buildingId: b.id, power: b.power } })
  })

  if (tick % 3 === 0) {
    pushFrame({ type: 'overview', seq: seqFn(), data: buildOverview() })
  }
  if (tick % 5 === 0) {
    produceAlarm()
  }
}, 1000)

const PORT = 3001
httpServer.listen(PORT, () => {
  console.log(`[parkmind] REST 服务:  http://localhost:${PORT}/api`)
  console.log(`[parkmind] WS 服务:    ws://localhost:${PORT}/ws (vite 代理 /ws 已转发)`)
  console.log(`[parkmind] 演示账号:   admin / operator(密码 123456)`)
})
