/**
 * 自研性能探针 —— 大屏右上角的"性能角标"数据来源
 *
 * 【要点】性能报告不是打开 DevTools 拍的,而是项目自己统计的:
 * 1. FPS:rAF 相邻帧间隔 > 50ms(≈20FPS)计一次掉帧,每秒滚动窗口求平滑 FPS
 * 2. 长任务:PerformanceObserver('longtask') 捕获 > 50ms 的阻塞任务
 * 3. JS 堆:chrome 私有 performance.memory 采样(降级为 0)
 * 实时渲染在 4px 角标上 —— 演示虚拟列表时"58fps"是屏幕上自己跳出来的数字。
 */

export interface PerfSnapshot {
  fps: number
  /** 本次统计窗口内的掉帧数(非累计) */
  dropped: number
  /** 本次统计窗口内的长任务数(非累计)*/
  longTasks: number
  jsHeapMB: number
}

/** 创建一个探针,onFrame 每 500ms 回调一次聚合快照;返回 stop() */
export function createPerfMonitor(onFrame: (s: PerfSnapshot) => void, intervalMs = 500) {
  let rafId = 0
  let last = performance.now()
  let windowDrops = 0
  let windowFrames = 0
  let windowStart = performance.now()
  let windowLongTasks = 0
  let stopped = false

  // 长任务统计(浏览器支持时才有效)
  const observer =
    typeof PerformanceObserver !== 'undefined'
      ? new PerformanceObserver(list => {
          list.getEntries().forEach(e => {
            if (e.duration > 50) windowLongTasks++
          })
        })
      : null
  try {
    observer?.observe({ entryTypes: ['longtask'] })
  } catch {
    /* 不支持则忽略 */
  }

  const tick = (now: number) => {
    if (stopped) return
    const gap = now - last
    last = now
    windowFrames++
    if (gap > 50) windowDrops++
    if (now - windowStart >= intervalMs) {
      const fps = Math.min(60, Math.round((windowFrames * 1000) / (now - windowStart)))
      // 【内存管理】performance.memory 是 Chrome 私有 API,仅用于演示自研监控;
      // 生产环境应改用 PerformanceObserver('measure') 或 Chrome DevTools Protocol
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
      onFrame({
        fps,
        // 都取"本窗口内"的计数而非累计值:累计值只增不减,单调上涨看不出刚卡过
        dropped: windowDrops,
        longTasks: windowLongTasks,
        jsHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : 0
      })
      windowFrames = 0
      windowDrops = 0
      windowLongTasks = 0
      windowStart = now
    }
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  return {
    stop() {
      stopped = true
      cancelAnimationFrame(rafId)
      observer?.disconnect()
    }
  }
}
