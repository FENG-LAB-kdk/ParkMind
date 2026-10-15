# ParkMind 智慧园区综合运营平台

> Vue3 + TypeScript + Vite + Pinia + Element Plus + vxe-table + ECharts5 + Three.js
>
> 单 Vite 工程多模块：`/admin`（B 端运营后台）、`/screen`（园区态势大屏）、`/park`（全国园区分布）、`/park3d`（园区三维态势）。
> 内置 Node 数据服务（Express + WebSocket），提供实时数据推送与十万级演示数据。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. （可选）配置大模型密钥 —— 不配只影响「智能运维助手」，其余功能照常
cp .env.example .env    # 填入 DEEPSEEK_API_KEY

# 3. 启动：一条命令同时拉起数据服务(3001)与前端(5173)
npm run dev

#    也可以分两个终端分别启动：
#    npm run dev:server   # 数据服务，种子生成 10 万+ 告警需数秒
#    npm run dev:web      # 前端，vite 代理 /api /ws → 3001
```

浏览器打开 http://localhost:5173

**演示账号**（密码均 `123456`）：

| 账号 | 角色 | 说明 |
|---|---|---|
| admin | 超级管理员 | 全部菜单 + 按钮码，含「系统管理」 |
| operator | 运营专员 | 无系统管理菜单、无删除/新增按钮（v-permission 移除 DOM） |

## 页面地图

| 路由 | 内容 | 核心看点 |
|---|---|---|
| `/login` | 登录（双账号闭环） | 动态路由注入流程 |
| `/admin/dashboard` | 运营工作台 | KPI 数字滚动、图表、概况 |
| `/admin/building` | 楼宇列表 | CRUD 全套：搜索/分页/弹窗校验/防重复提交/删空回退 |
| `/admin/device` | 设备台账 | 多条件筛选 |
| `/admin/alarm` | 告警中心 | **十万级 vxe 虚拟滚动 + Worker 聚合分析** |
| `/admin/assistant` | 智能运维助手 | **大模型流式对话**：SSE 分帧/粘包、逐字渲染、AbortSignal 中断 |
| `/admin/user`、`/admin/role` | 系统管理 | 双角色权限矩阵 |
| `/park` | 园区分布 | **ECharts + GeoJSON 三级下钻**、地图与列表双向联动 |
| `/park3d` | 园区三维态势 | **WebGL**：楼层数/实时功率驱动楼体高度与颜色、射线拾取点选 |
| `/screen` | 园区态势大屏 | **实时链路全景**：WS 心跳/重连/seq 补偿、SVG 楼宇图、虚拟告警流、Worker 降采样 10 万点曲线、自研性能探针 |

## 核心实现

| 模块 | 实现位置 | 说明 |
|---|---|---|
| 手写虚拟列表 | `src/composables/useVirtualList.ts` | 外层撑高 + 内层 translateY；前缀和 + 二分定位渲染区间 |
| WebSocket 可靠性 | `src/composables/useWebSocket.ts` | 心跳保活 / 指数退避重连 / **断线 seq 补偿**（`/api/ws-miss` 回放缺口） |
| ECharts 封装 | `src/composables/useChart.ts` | 按需引入 / 主题 dispose 重建 / rAF 合并 resize |
| LTTB 降采样 | `src/utils/downsample/lttb.ts` | 纯函数 + Web Worker 执行，10 万点 → 1200 点保峰谷 |
| 请求层 | `src/utils/request.ts` | 拦截器统一鉴权与错误策略，config.meta 元数据驱动、零 URL 特判 |
| 动态路由权限 | `src/router/dynamic.ts`、`src/router/guard.ts` | 菜单同源 / 防重复注入 / 刷新后重建 |
| 按钮权限 | `src/directives/permission.ts` | 无权限直接移除 DOM |
| 大屏适配 | `src/composables/useScale.ts` | 1920×1080 设计稿 scale + ResizeObserver |
| 性能探针 | `src/utils/perf-monitor.ts` | FPS / 长任务 / 堆监控，大屏角标实时显示 |
| 数据口径自洽 | `server/src/data.js` | 楼宇/设备/告警/能耗单一数据源，大屏与后台同口径 |
| 主题系统 | `src/styles/theme.css` + `src/composables/useTheme.ts` | CSS 变量 + ECharts 主题同源 |
| 园区三维 | `src/views/park3d/` + `src/composables/useThreeScene.ts` | Three.js 场景生命周期封装；坐标由服务端下发的 x/z 直接映射 |
| 大模型流式对话 | `src/composables/useChatStream.ts` + `server/src/ai.js` | 原生 fetch + ReadableStream 增量解析、SSE 分帧与粘包处理、AbortSignal 全链路中断、园区数据注入抗幻觉、Key 隔离于服务端 |
| 质量门禁 | `.husky/` + `eslint.config.js` + `.github/workflows/ci.yml` | ESLint/Prettier 职责分离、lint-staged 增量检查、Commitlint、Vitest 单测、CI 四道门禁 |

## 生产构建与部署

```bash
npm run build     # 产物 dist/（manualChunks 已拆 echarts / element-plus / vxe / three / vendor）
npm run preview   # 本地预览产物
```

本地质量门禁（与 CI 同名同参）：

```bash
npm run lint          # ESLint（带 --cache 增量）
npm run format-check  # Prettier 只校验不修改
npm run typecheck     # vue-tsc
npm run test          # Vitest
npm run build         # 构建 —— 这道不能省
```

> **为什么 build 必须跑**：`vue-tsc` 管类型、`eslint` 管代码质量，**都不看模板表达式语法**。
> 曾遇到过一次：某页面 `@click` 里的多语句内联处理器被 Prettier（`semi: false`）删掉分号折成多行，
> 变成非法表达式 —— lint / format-check / typecheck / 单测四道全绿，但 `vite build` 直接失败、该页白屏。
> 现已加 `src/__tests__/sfc-compile.spec.ts` 专门守这一类模板编译错误（用 `vue/compiler-sfc`
> 把全量 `.vue` 跑一遍解析 + 模板编译），`npm test` 即可拦住。

**nginx 部署**：同时反代 `dist/` 与 `/api`、`/ws`。**SSE 接口 `/api/ai/chat` 需额外关掉 nginx 缓冲**，
否则逐字流会被攒成一坨再下发：

```nginx
location /api/ai/chat {
  proxy_pass http://127.0.0.1:3001;
  proxy_buffering off;      # 服务端也已设 X-Accel-Buffering: no 作为第二层保险
  proxy_read_timeout 300s;  # 默认 60s，长回答可能超时被掐断
}
```

## 目录速览

```
src/
├── __tests__/     # 全量 SFC 编译守卫（防模板表达式语法错误导致页面白屏）
├── api/           # 一行一接口，按业务分区
├── composables/   # 核心自研层：虚拟列表/WebSocket/图表/表格/主题/缩放/流式对话/三维
│   └── __tests__/ # 单测（与被测目录同级）
├── config/        # 菜单表、按钮码、图表主题、功率热度判据
├── directives/    # v-permission
├── router/        # 静态壳 + dynamic 动态注册 + guard 守卫
├── stores/        # Pinia：user / permission
├── styles/        # CSS 变量主题
├── types/         # 业务模型（全链路唯一真相）
├── utils/         # request / tools / perf-monitor / lttb / worker
│   └── __tests__/ # 单测
├── views/
│   ├── admin/     # B 端：登录/工作台/楼宇/设备/告警/助手/系统
│   ├── park/      # 全国园区分布（ECharts + GeoJSON）
│   ├── park3d/    # 园区三维态势（Three.js）
│   └── screen/    # 大屏（单页做深）
└── workers/       # 降采样 Worker
server/src/        # Express REST + ws 推送 + 十万级数据种子 + 大模型接入（ai.js）
.husky/            # 提交门禁钩子（pre-commit / commit-msg）
.github/workflows/ # CI：lint / typecheck / test / build 四道门禁
```
