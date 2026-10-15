/**
 * 工具函数 —— 全部手写,不引 lodash
 *
 * 【实现要点】防抖/节流/深拷贝是调用频繁,项目里真实在用:
 * 防抖 → 搜索框输入;节流 → 图表 resize/滚动位置采集。实现里刻意处理了
 * this 绑定与参数透传。
 */

/** 深拷贝:兼容数组、Date、Map/Set、循环引用(WeakMap 记录) */
export function deepClone<T>(source: T, cache = new WeakMap<object, unknown>()): T {
  if (source === null || typeof source !== 'object') return source
  if (source instanceof Date) return new Date(source.getTime()) as T
  if (source instanceof Map) {
    const m = new Map()
    source.forEach((v, k) => m.set(k, deepClone(v, cache)))
    return m as T
  }
  if (source instanceof Set) {
    const s = new Set()
    source.forEach(v => s.add(deepClone(v, cache)))
    return s as T
  }
  if (cache.has(source)) return cache.get(source) as T
  if (Array.isArray(source)) {
    const arr: unknown[] = []
    cache.set(source, arr)
    source.forEach((v, i) => {
      arr[i] = deepClone(v, cache)
    })
    return arr as T
  }
  const obj: Record<string, unknown> = {}
  cache.set(source, obj)
  Object.keys(source as object).forEach(key => {
    obj[key] = deepClone((source as Record<string, unknown>)[key], cache)
  })
  return obj as T
}

/** 防抖:最后一次触发后 delay 执行;支持立即执行首帧(leading) */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, delay = 300, leading = false) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let invoked = false
  return function (this: unknown, ...args: A) {
    const callNow = leading && !invoked
    if (timer) clearTimeout(timer)
    if (callNow) {
      invoked = true
      fn.apply(this, args)
      timer = setTimeout(() => (invoked = false), delay)
      return
    }
    timer = setTimeout(() => {
      invoked = false
      fn.apply(this, args)
    }, delay)
  }
}

/** 节流:固定间隔内最多执行一次(时间戳版,首帧立即执行) */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, interval = 300) {
  let last = 0
  return function (this: unknown, ...args: A) {
    const now = Date.now()
    if (now - last >= interval) {
      last = now
      fn.apply(this, args)
    }
  }
}

/** 数字千分位 */
export function toThousands(n: number): string {
  return n.toLocaleString('en-US')
}

/** 时间格式化 */
export function formatTime(ts: number | string | Date, pattern = 'YYYY-MM-DD HH:mm:ss'): string {
  const d = new Date(ts)
  const pad = (v: number, len = 2) => String(v).padStart(len, '0')
  return pattern
    .replace('YYYY', String(d.getFullYear()))
    .replace('MM', pad(d.getMonth() + 1))
    .replace('DD', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()))
    .replace('ss', pad(d.getSeconds()))
}

/** 文件大小格式化 */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

/** 简单 id(本地列表/表单用;真实场景由后端生成) */
export function genId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
