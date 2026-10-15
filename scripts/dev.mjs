/**
 * 一键开发启动 —— 同时拉起数据服务(3001)与前端(5173)
 *
 * 【面试话术 - 工程化】为什么自研而不用 concurrently:
 * 1. 只为拼两条命令引一个依赖不划算,二十来行 Node 原生 child_process 就够
 * 2. 几个能讲清楚的细节:
 *    - stdio: 'inherit' —— 子进程直接继承父进程终端,日志不经转发、颜色不丢,
 *      也让 Ctrl+C 的中断信号能落到子进程
 *    - 统一用 process.execPath 执行 JS 入口(vite 的 bin/vite.js 是 JS 文件),
 *      绕开"Windows 下必须 shell:true 才能跑 .cmd"的问题:shell:true 会把参数
 *      拼成字符串交给 cmd.exe,既触发 Node 的注入告警,也怕路径里的空格/中文被截断
 *    - 任一子进程退出即回收其余进程 —— 否则 3001/5173 端口会残留(自己就踩过:
 *      上一版留了个孤儿 vite 进程占着 5173,下一次启动只能退到 5174)
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

/** @type {import('node:child_process').ChildProcess[]} */
const children = []
let exiting = false

function shutdown(code = 0) {
  if (exiting) return
  exiting = true
  children.forEach(c => {
    try {
      c.kill()
    } catch {
      /* 进程可能已自行退出 */
    }
  })
  process.exit(code)
}

function run(name, script) {
  if (!existsSync(script)) {
    console.error(`[dev] 找不到入口 ${script} —— 先执行 npm install`)
    shutdown(1)
    return
  }
  const child = spawn(process.execPath, [script], { stdio: 'inherit' })
  child.on('exit', code => {
    if (!exiting) console.log(`\n[dev] ${name} 已退出(code=${code}),正在停止其余进程…`)
    shutdown(code ?? 0)
  })
  children.push(child)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('server', 'server/src/index.js') // 数据服务 → http://localhost:3001
run('web', 'node_modules/vite/bin/vite.js') // 前端 → http://localhost:5173
