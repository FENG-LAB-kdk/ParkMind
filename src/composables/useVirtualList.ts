import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue'

/**
 * useVirtualList —— 手写虚拟滚动(不依赖任何库)
 *
 * 【渲染策略】普通渲染 10 万行 = 10 万个真实 DOM,首帧 + 滚动
 * 都会卡死;虚拟滚动的核心只有两句:
 *  1) 只渲染可视区 ± overscan 的行(浏览器同时维护的 DOM 恒为几十个)
 *  2) 用两个空层撑出"总高度":外层 div 高度 = 总内容高度(滚动条真实存在),
 *     内层 div translateY 平移到渲染区 —— 平移是合成层操作,不触发重排重绘
 * 【二分查找】定位首行不用线性遍历:高度组 + 前缀和数组,
 *  由 scrollTop 二分反查 index,O(log n)
 * 【高度策略】支持固定行高与"按数据预知行高"(heightGetter,如告警按级别
 *  取不同高度)。真正的"内容自适应动态高度"需要渲染后测量+回填,
 *  扩展点:把每行 offsetHeight 写回高度组即可复用本前缀和/二分框架。
 */

/** 高度组:缓存前缀和(offsets[i] = 前 i 行高度和),支撑二分查找 */
function buildPrefixSum(heights: number[]) {
  const offsets = new Float64Array(heights.length + 1)
  for (let i = 0; i < heights.length; i++) offsets[i + 1] = offsets[i] + heights[i]
  return offsets
}

/** 二分查找:第一个 offsets[i] > target 的 i(即滚动位置对应的首行) */
export function binarySearchFirst(offsets: Float64Array | number[], target: number): number {
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] <= target) lo = mid + 1
    else hi = mid
  }
  return lo
}

export interface UseVirtualListOptions {
  /** 可视区高度(px);传 containerEl 时以实测为准,本项仅作首帧兜底 */
  viewportHeight?: number
  /** 滚动容器:传了就用 ResizeObserver 实测其高度,
   *  避免"手填的 290"与"面板实际的 600"脱节(面板是 flex:1,
   *  内联 height 会被 flex-basis 覆盖,写死高度必然对不上) */
  containerEl?: Ref<HTMLElement | undefined>
  /** 固定行高 */
  itemHeight: number
  /** 渲染缓冲行数(上下各多渲染几行,避免快速滚动露白) */
  overscan?: number
  /** 按数据动态取行高的钩子;缺省 = 固定行高 */
  heightGetter?: (index: number) => number
}

export function useVirtualList<T>(items: Ref<T[]>, options: UseVirtualListOptions) {
  const { itemHeight, overscan = 6, heightGetter } = options
  const viewportH = ref(options.viewportHeight ?? 600)
  const scrollTop = ref(0)

  /** 前缀和缓存:只按「行数」失效。
   *  行高完全由 index 决定(heightGetter 约定为纯函数、只看 index),所以行数相同 →
   *  高度组必然相同,哪怕 items 整体换了数组引用。
   *  原实现用 WeakMap 拿**数组引用**当 key,而每次数据变化都会生成一个新数组 →
   *  缓存永远 miss,等于没有缓存,每次头插都要 O(n) 重建前缀和。 */
  let cachedLen = -1
  let cachedOffsets = new Float64Array(0)
  const prefixSum = computed(() => {
    const total = items.value.length
    if (total !== cachedLen) {
      const hs = new Array<number>(total)
      for (let i = 0; i < total; i++) hs[i] = heightGetter ? heightGetter(i) : itemHeight
      cachedOffsets = buildPrefixSum(hs)
      cachedLen = total
    }
    return cachedOffsets
  })

  /** 渲染区间 */
  const range = computed(() => {
    const total = items.value.length
    if (!total) return { start: 0, end: 0 }
    // 【这里的 -1 是必须的】binarySearchFirst 返回的是「第一个前缀和 **大于** target 的下标」,
    // 而我们要的是「target 落在哪一行」= 「前缀和不大于 target 的最后一个下标」,两者差 1。
    // 少这个 -1 的后果很具体:scrollTop 为 0 时 target=0,返回 1,第 0 行永远进不了渲染区间,
    // 列表顶部会空出一行(大屏告警流表现为:最新那条告警看不见)。
    // 权威参照:@tanstack/virtual-core 的 findNearestBinarySearch 收尾就是
    //   `if (low > 0) return low - 1; else return 0`
    // https://github.com/TanStack/virtual/blob/main/packages/virtual-core/src/index.ts
    const start = Math.max(
      0,
      binarySearchFirst(prefixSum.value, Math.max(0, scrollTop.value - overscan * itemHeight)) - 1
    )
    const bottom = scrollTop.value + viewportH.value + overscan * itemHeight
    // 末行是「开区间上界」,不加 -1:slice(start, end) 本身就不含 end,
    // 且「行起点恰好等于 bottom」的行不该渲染,与二分结果天然吻合
    const end = Math.min(total, binarySearchFirst(prefixSum.value, bottom))
    return { start, end }
  })

  const totalHeight = computed(() => (items.value.length ? prefixSum.value[items.value.length] : 0))
  const renderItems = computed(() => items.value.slice(range.value.start, range.value.end))
  /** 首个可视行距顶偏移(内层 translateY) */
  const renderOffset = computed(() => prefixSum.value[range.value.start])

  /** 滚动监听:仅写一个 number ref,不触发任何 DOM 操作 */
  function onScroll(e: Event) {
    scrollTop.value = (e.target as HTMLElement).scrollTop
  }

  /** 定位到某行:scrollTop 目标值用前缀和直接取,零遍历 */
  function scrollToIndex(index: number) {
    const i = Math.max(0, Math.min(index, items.value.length - 1))
    scrollTop.value = prefixSum.value[i]
  }

  // 视口高度跟随容器实测(挂载后量一次 + 尺寸变化时重测)
  let ro: ResizeObserver | null = null
  onMounted(() => {
    const el = options.containerEl?.value
    if (!el) return
    viewportH.value = el.clientHeight
    ro = new ResizeObserver(() => {
      viewportH.value = el.clientHeight
    })
    ro.observe(el)
  })
  onUnmounted(() => ro?.disconnect())

  return {
    containerStyle: computed(() => ({ height: `${viewportH.value}px`, overflowY: 'auto' as const })),
    /** 外层:真实滚动容器 */
    onScroll,
    /** 撑高层:高度 = 全部内容 */
    spacerStyle: computed(() => ({ height: `${totalHeight.value}px`, position: 'relative' as const })),
    /** 平移层:包裹可视行 */
    translateStyle: computed(() => ({ transform: `translateY(${renderOffset.value}px)` })),
    renderItems,
    totalHeight,
    scrollToIndex,
    setViewportHeight(h: number) {
      viewportH.value = h
    }
  }
}
