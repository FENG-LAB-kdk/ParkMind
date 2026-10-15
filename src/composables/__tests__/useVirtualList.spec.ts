import { mount } from '@vue/test-utils'
import { defineComponent, ref, type Ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { binarySearchFirst, useVirtualList, type UseVirtualListOptions } from '../useVirtualList'

/**
 * 虚拟列表要测什么?
 *   1. 二分查找这个纯函数 —— 整个方案的地基,错了后面全错
 *   2. 渲染区间的计算 —— 少算一行会露白,多算一行就白虚拟化了
 *   3. 偏移量与总高度 —— 撑高层/平移层算错,滚动条就是假的
 *
 * 注意:composable 内部用了 onMounted/onUnmounted,必须在组件实例里跑,
 * 所以用 @vue/test-utils 挂一个"只有 setup、不渲染任何东西"的空组件来承载它。
 */

/** 把 composable 挂进组件上下文,拿到它在 setup 里返回的 API */
function mountList(items: Ref<number[]>, options: UseVirtualListOptions) {
  let api!: ReturnType<typeof useVirtualList<number>>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useVirtualList(items, options)
        return () => null
      }
    })
  )
  return { api, wrapper }
}

const ITEM_HEIGHT = 20
const VIEWPORT = 100

function makeItems(n: number) {
  return ref(Array.from({ length: n }, (_, i) => i))
}

describe('binarySearchFirst —— 前缀和上的二分', () => {
  // offsets[i] = 前 i 行的高度和;这里每行 10px,共 3 行 → [0, 10, 20, 30]
  const offsets = [0, 10, 20, 30]

  it('返回第一个「前缀和大于 target」的下标', () => {
    expect(binarySearchFirst(offsets, 0)).toBe(1) // offsets[0]=0 不大于 0,下一个 10 才大于
    expect(binarySearchFirst(offsets, 9)).toBe(1)
    expect(binarySearchFirst(offsets, 10)).toBe(2)
    expect(binarySearchFirst(offsets, 29)).toBe(3)
  })

  it('target 为负(顶部越界)时返回 0', () => {
    expect(binarySearchFirst(offsets, -50)).toBe(0)
  })

  it('target 超出总高度时收敛到最后一个下标,不会越界', () => {
    // 这是 range.end 能安全地写成 Math.min(total, ...) 的原因
    expect(binarySearchFirst(offsets, 9999)).toBe(offsets.length - 1)
  })

  it('复杂度是 O(log n) —— 十万行只需约 17 次比较', () => {
    const big = new Float64Array(100001)
    for (let i = 1; i <= 100000; i++) big[i] = big[i - 1] + 20
    expect(binarySearchFirst(big, 20 * 50000)).toBe(50001)
  })
})

describe('useVirtualList —— 渲染区间', () => {
  // 回归守卫:这里曾经差 1 —— binarySearchFirst 返回「第一个前缀和大于 target 的下标」,
  // 而"target 落在哪一行"要取「前缀和不大于 target 的最后一个下标」。
  // 少这个 -1 时 scrollTop=0 会让 start=1,列表顶部空出一行(大屏上表现为最新告警不显示)。
  it('滚动到顶部时,第 0 行必须在渲染区间内', () => {
    const { api } = mountList(makeItems(100), {
      itemHeight: ITEM_HEIGHT,
      viewportHeight: VIEWPORT,
      overscan: 6
    })
    // 顶部 = scrollTop 0,可视区 0~100px,应当从第 0 行渲染起
    expect(api.renderItems.value[0]).toBe(0)
  })

  it('总高度 = 行数 × 行高', () => {
    const { api } = mountList(makeItems(100), { itemHeight: ITEM_HEIGHT, viewportHeight: VIEWPORT })
    expect(api.totalHeight.value).toBe(100 * ITEM_HEIGHT)
  })

  it('空数组时区间塌缩、总高度为 0', () => {
    const { api } = mountList(makeItems(0), { itemHeight: ITEM_HEIGHT, viewportHeight: VIEWPORT })
    expect(api.totalHeight.value).toBe(0)
    expect(api.renderItems.value).toEqual([])
    expect(api.spacerStyle.value.height).toBe('0px')
  })

  it('渲染的行数远小于总行数 —— 这正是虚拟化的意义', () => {
    const { api } = mountList(makeItems(100000), { itemHeight: ITEM_HEIGHT, viewportHeight: VIEWPORT })
    expect(api.renderItems.value.length).toBeLessThan(20)
    expect(api.totalHeight.value).toBe(100000 * ITEM_HEIGHT)
  })

  it('滚动后,渲染的是滚动位置附近的行', () => {
    const items = makeItems(1000)
    const { api } = mountList(items, { itemHeight: ITEM_HEIGHT, viewportHeight: VIEWPORT, overscan: 6 })
    // 滚动到第 500 行的位置
    api.onScroll({ target: { scrollTop: 500 * ITEM_HEIGHT } } as unknown as Event)
    const rendered = api.renderItems.value
    expect(rendered).toContain(500)
    // 只渲染可视区附近:500 附近几十行,而不是全部 1000 行
    expect(rendered.length).toBeLessThan(30)
    expect(rendered).not.toContain(0)
  })

  it('scrollToIndex 能定位到指定行', () => {
    const { api } = mountList(makeItems(1000), { itemHeight: ITEM_HEIGHT, viewportHeight: VIEWPORT, overscan: 6 })
    api.scrollToIndex(777)
    expect(api.renderItems.value).toContain(777)
  })

  it('scrollToIndex 越界时收敛到首行', () => {
    const { api } = mountList(makeItems(100), { itemHeight: ITEM_HEIGHT, viewportHeight: VIEWPORT, overscan: 6 })
    api.scrollToIndex(-5)
    expect(api.renderItems.value).toContain(0)
  })

  it('scrollToIndex 越界时收敛到末行', () => {
    const { api } = mountList(makeItems(100), { itemHeight: ITEM_HEIGHT, viewportHeight: VIEWPORT, overscan: 6 })
    api.scrollToIndex(9999)
    expect(api.renderItems.value).toContain(99)
  })

  it('heightGetter 支持按行取不同高度,总高度等于各行高度之和', () => {
    const items = makeItems(100)
    // 偶数行 20px、奇数行 40px → 平均 30px,总高 3000
    const { api } = mountList(items, {
      itemHeight: ITEM_HEIGHT,
      viewportHeight: VIEWPORT,
      heightGetter: i => (i % 2 === 0 ? 20 : 40)
    })
    expect(api.totalHeight.value).toBe(100 * 30)
  })
})

describe('useVirtualList —— 三层 DOM 的样式', () => {
  it('撑高层高度 = 总高度,平移层 translateY = 首个渲染行的前缀和', () => {
    const { api } = mountList(makeItems(100), {
      itemHeight: ITEM_HEIGHT,
      viewportHeight: VIEWPORT,
      overscan: 6
    })
    // 外层滚动容器:高度取实测视口,纵向可滚
    expect(api.containerStyle.value).toEqual({ height: `${VIEWPORT}px`, overflowY: 'auto' })
    // 撑高层:高度必须是"全部内容高度",滚动条长度才是真的
    expect(api.spacerStyle.value.height).toBe(`${100 * ITEM_HEIGHT}px`)
    // 平移层:translateY 必须是"首个渲染行的前缀和",用 transform 走合成层,不触发重排重绘
    const firstRendered = api.renderItems.value[0]
    expect(api.translateStyle.value.transform).toBe(`translateY(${firstRendered * ITEM_HEIGHT}px)`)
  })

  it('setViewportHeight 可手动改写视口高度(未接 ResizeObserver 时的兜底)', () => {
    const { api } = mountList(makeItems(100), { itemHeight: ITEM_HEIGHT, viewportHeight: 100 })
    expect(api.containerStyle.value.height).toBe('100px')
    api.setViewportHeight(300)
    expect(api.containerStyle.value.height).toBe('300px')
  })
})
