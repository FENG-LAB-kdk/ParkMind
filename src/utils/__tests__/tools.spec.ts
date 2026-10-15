import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, deepClone, formatBytes, formatTime, throttle, toThousands } from '../tools'

describe('deepClone 深拷贝', () => {
  it('基本类型原样返回', () => {
    expect(deepClone(1)).toBe(1)
    expect(deepClone('a')).toBe('a')
    expect(deepClone(null)).toBe(null)
    expect(deepClone(undefined)).toBe(undefined)
  })

  it('嵌套对象/数组逐层复制,改副本不影响原对象', () => {
    const src = { a: 1, b: { c: [1, 2, { d: 3 }] } }
    const copy = deepClone(src)
    expect(copy).toEqual(src)
    expect(copy).not.toBe(src)
    expect(copy.b).not.toBe(src.b)
    expect(copy.b.c).not.toBe(src.b.c)
  })

  it('Date / Map / Set 被还原成对应类型,而不是退化成普通对象', () => {
    const d = new Date('2026-01-01T00:00:00Z')
    expect(deepClone(d)).toBeInstanceOf(Date)
    expect(deepClone(d).getTime()).toBe(d.getTime())

    const m = new Map([['k', { v: 1 }]])
    const mCopy = deepClone(m)
    expect(mCopy).toBeInstanceOf(Map)
    expect(mCopy.get('k')).not.toBe(m.get('k'))

    const s = new Set([1, 2])
    expect(deepClone(s)).toBeInstanceOf(Set)
    expect(deepClone(s).size).toBe(2)
  })

  it('循环引用不会栈溢出(WeakMap 记录已拷贝过的对象)', () => {
    const src: Record<string, unknown> = { name: 'root' }
    src.self = src
    const copy = deepClone(src)
    expect(copy.name).toBe('root')
    // 关键:副本里的 self 指向副本自己,而不是原对象
    expect(copy.self).toBe(copy)
  })
})

describe('debounce 防抖', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('连续触发只在停止 delay 之后执行一次', () => {
    const fn = vi.fn()
    const run = debounce(fn, 300)
    run()
    run()
    run()
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('每次新触发都会重新计时(这是防抖和节流的本质区别)', () => {
    const fn = vi.fn()
    const run = debounce(fn, 300)
    run()
    vi.advanceTimersByTime(200)
    run() // 重新计时
    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled() // 距最后一次触发只过了 200ms
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('leading 模式:首帧立即执行,窗口内的后续触发合并成一次「尾部执行」', () => {
    const fn = vi.fn()
    const run = debounce(fn, 300, true)

    run('first')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('first')

    // 窗口内的触发不再立即执行,但要先把原来那个"解锁定时器"清掉再重启计时
    run('second')
    expect(fn).toHaveBeenCalledTimes(1)

    // 窗口结束时补一次尾部执行 —— 即 leading + trailing 都执行,
    // 与 lodash `debounce(fn, wait, { leading: true })` 的默认行为一致
    // (lodash 的 trailing 默认就是 true,不显式关掉就会两头都触发)
    vi.advanceTimersByTime(300)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('second')

    run('third')
    expect(fn).toHaveBeenCalledTimes(3) // 窗口已结束,恢复立即执行
    expect(fn).toHaveBeenLastCalledWith('third')
  })

  it('参数与 this 透传', () => {
    const fn = vi.fn()
    const run = debounce(fn, 100)
    const ctx = { tag: 'ctx' }
    run.call(ctx, 1, 2)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledWith(1, 2)
    expect(fn.mock.instances[0]).toBe(ctx)
  })
})

describe('throttle 节流', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // throttle 用 Date.now() 算间隔;不设定系统时间的话 now=0,
    // 与初始 last=0 相减为 0,首次调用会被判为"未到间隔"而丢掉
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('固定间隔内最多执行一次', () => {
    const fn = vi.fn()
    const run = throttle(fn, 300)
    run()
    expect(fn).toHaveBeenCalledTimes(1) // 首帧立即执行

    run()
    run()
    expect(fn).toHaveBeenCalledTimes(1) // 间隔内被丢弃

    vi.advanceTimersByTime(300)
    run()
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('格式化工具', () => {
  it('toThousands 千分位', () => {
    expect(toThousands(1234567)).toBe('1,234,567')
    expect(toThousands(999)).toBe('999')
  })

  it('formatTime 按 pattern 补零', () => {
    const d = new Date(2026, 0, 5, 9, 7, 3) // 2026-01-05 09:07:03(本地时区)
    expect(formatTime(d, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-01-05 09:07:03')
    expect(formatTime(d, 'MM-DD')).toBe('01-05')
  })

  it('formatBytes 按 1024 进制换算单位', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })
})
