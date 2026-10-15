import { describe, expect, it } from 'vitest'
import { lttb, type Point } from '../lttb'

/** 造一条带正弦波动的时间序列 */
function makeSeries(n: number): Point[] {
  return Array.from({ length: n }, (_, i) => ({ x: i, y: Math.sin(i / 10) }))
}

describe('lttb 降采样', () => {
  it('目标点数不小于原始点数时,原样返回(且是副本,不是同一个数组引用)', () => {
    const data = makeSeries(100)
    const out = lttb(data, 100)
    expect(out).toHaveLength(100)
    expect(out).toEqual(data)
    // 必须是新数组:调用方拿到后可以随意改,不会污染原始数据
    expect(out).not.toBe(data)
  })

  it('阈值小于 3 时不做降采样(少于 3 个点构不成三角形)', () => {
    const data = makeSeries(100)
    expect(lttb(data, 2)).toHaveLength(100)
    expect(lttb(data, 0)).toHaveLength(100)
  })

  it('正常降采样后点数精确等于阈值', () => {
    const data = makeSeries(10000)
    expect(lttb(data, 1000)).toHaveLength(1000)
    expect(lttb(data, 50)).toHaveLength(50)
  })

  it('首尾两点必须保留 —— 折线的起点和终点是硬边界', () => {
    const data = makeSeries(5000)
    const out = lttb(data, 200)
    expect(out[0]).toEqual(data[0])
    expect(out[out.length - 1]).toEqual(data[data.length - 1])
  })

  it('尖峰必须被保留 —— 这正是选 LTTB 而不是均匀抽稀的理由', () => {
    // 1000 个接近 0 的平缓点,在第 500 个位置插一个巨大尖峰
    const data: Point[] = Array.from({ length: 1000 }, (_, i) => ({
      x: i,
      y: i === 500 ? 1000 : Math.sin(i / 10)
    }))
    const out = lttb(data, 100)
    // 均匀抽稀(每隔 10 个取 1 个)大概率会跳过第 500 个点;
    // LTTB 按"三角形面积最大"选点,尖峰构成的面积远大于周围平缓区,必然入选
    expect(out.some(p => p.x === 500 && p.y === 1000)).toBe(true)
  })

  // 回归守卫:桶边界曾经整体后移一个桶(当前桶取了原始实现里的"下一桶"),
  // 导致末桶越界成空桶、选点退回桶起点,与末尾补的 data[n-1] 撞成重复点。
  it('输出点的 x 严格递增 —— 降采样不能把时间顺序打乱,也不能出现重复点', () => {
    const out = lttb(makeSeries(3000), 300)
    for (let i = 1; i < out.length; i++) {
      expect(out[i].x).toBeGreaterThan(out[i - 1].x)
    }
  })

  // 桶宽 every = (n-2)/(threshold-2) 恒 > 1,是"每个桶至少一个点、不会出现空桶
  // → maxAreaPoint 退回起点 → 与末点重复"这一结论的前提。
  // 这里横扫各种极端组合(threshold 贴着 n、只有 3 个点、桶宽刚好跨过整数边界)把这个前提钉死。
  it.each([
    [10, 4],
    [10, 3],
    [100, 3],
    [100, 50],
    [101, 100],
    [1000, 999],
    [1000, 100],
    [5000, 7],
    [10000, 1000],
    [12345, 617]
  ])('n=%i / threshold=%i:点数精确、无 NaN、x 严格递增', (n, threshold) => {
    const out = lttb(makeSeries(n), threshold)
    expect(out).toHaveLength(threshold)
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
    for (let i = 1; i < out.length; i++) {
      expect(out[i].x).toBeGreaterThan(out[i - 1].x)
    }
  })
})
