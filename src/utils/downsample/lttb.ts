/**
 * LTTB(Largest-Triangle-Three-Buckets)降采样算法 —— 纯函数,可单测、可在 Worker 跑
 *
 * 【降采样策略】10 万点折线图直接画:canvas 一次绘制 10 万段 +
 * 像素级重叠,帧率个位数。降采样思路:抽稀到 ~1000 点仍保留视觉特征。
 * 为什么用 LTTB 而不是均匀抽稀:均匀抽稀会丢掉尖峰/谷底(比如 1 秒的能耗
 * 尖峰恰好被抽掉),LTTB 对每个桶用"最大三角形面积"选点 —— 面积大 =
 * 变化剧烈 = 视觉重要点,峰谷得以保留。
 *
 * 【实现依据】桶边界严格对齐算法作者 Sveinn Steinarsson 的原始实现(flot-downsample):
 *   https://github.com/sveinn-steinarsson/flot-downsample
 * 桶边界是这套算法的命门,差一格就会同时出两个错:
 *   1) 跳过紧挨首点的第一个桶(那一段明显欠采样)
 *   2) 末桶越界成空桶 → 选点退回桶起点 → 与末尾补的 data[n-1] 重复
 * 原始实现的划分:
 *   当前桶 = [floor(i*every)+1,     floor((i+1)*every)+1)   ← 在桶内挑点
 *   均值桶 = [floor((i+1)*every)+1, floor((i+2)*every)+1)   ← 下一个桶,当作三角形顶点 c
 * `every = (n-2)/(threshold-2)`,首尾两点单独占位,不参与分桶。
 */
export interface Point {
  x: number
  y: number
}

/** 三角形面积:三个点围成面积的 2 倍(免除法,只比大小) */
function area(p1: Point, p2: Point, p3: Point): number {
  return Math.abs((p1.x - p3.x) * (p2.y - p1.y) - (p1.x - p2.x) * (p3.y - p1.y))
}

/** LTTB 降采样:把 data 抽稀到 threshold 个点 */
export function lttb(data: Point[], threshold: number): Point[] {
  const n = data.length
  if (threshold >= n || threshold < 3) return data.slice()

  const sampled: Point[] = []
  // 首点必选
  sampled.push(data[0])
  const bucketSize = (n - 2) / (threshold - 2)
  let a = 0 // 上一个被选中的点下标(三角形的顶点 a)

  for (let i = 0; i < threshold - 2; i++) {
    // ① 先求「下一个桶」的均值 —— 它是三角形第三个顶点 c 的代表点。
    //    取下一个桶而不是当前桶,是为了让面积衡量的是"本桶的点相对下一段的偏离量"。
    const nextStart = Math.floor((i + 1) * bucketSize) + 1
    const nextEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n)
    let avgX = 0
    let avgY = 0
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += data[j].x
      avgY += data[j].y
    }
    const avgLen = nextEnd - nextStart
    avgX /= avgLen
    avgY /= avgLen

    // ② 在当前桶内挑一个点 b,使 a-b-c 围成的面积最大(面积大 = 该点改变了走势)
    //    末桶的 end = floor((threshold-2)*bucketSize)+1 = n-1,天然够不着最后一点,
    //    所以不需要额外 Math.min(…, n-1) 兜底
    const start = Math.floor(i * bucketSize) + 1
    const end = Math.floor((i + 1) * bucketSize) + 1

    let maxArea = -1
    let maxAreaPoint = start
    for (let j = start; j < end; j++) {
      const ar = area(data[a], data[j], { x: avgX, y: avgY })
      if (ar > maxArea) {
        maxArea = ar
        maxAreaPoint = j
      }
    }
    sampled.push(data[maxAreaPoint])
    a = maxAreaPoint
  }
  // 末点必选
  sampled.push(data[n - 1])
  return sampled
}
