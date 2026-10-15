import { computed, onMounted, onUnmounted, ref } from 'vue'

/**
 * useScale —— 大屏等比缩放适配
 *
 * 【大屏适配】方案:设计稿 1920×1080 固定开发,
 * 运行时用 ResizeObserver 监听容器,按 容器/设计稿 比例整体 transform: scale。
 * 为什么不用 rem 方案:rem 需要把所有尺寸写成 rem,且无法整体缩放
 * 图表 canvas;scale 方案一套代码通吃任意分辨率,缺点是放大后模糊,
 * 所以大屏视觉稿统一用矢量/高分辨率资源。
 * 改良说明:原 aiC 项目 ScreenTemplate 在 mounted 里注册的匿名 resize 监听
 * 永远无法移除(removeEventListener 必须同一引用)—— 本实现统一
 * ResizeObserver,无监听泄漏。
 */
export function useScale(designWidth = 1920, designHeight = 1080) {
  const container = ref<HTMLElement | null>(null)
  const scale = ref(1)
  let observer: ResizeObserver | null = null

  function update() {
    if (!container.value) return
    scale.value = Math.min(container.value.clientWidth / designWidth, container.value.clientHeight / designHeight)
  }

  onMounted(() => {
    observer = new ResizeObserver(() => update())
    if (container.value) observer.observe(container.value)
    update()
  })
  onUnmounted(() => {
    observer?.disconnect()
    observer = null
  })

  const screenStyle = computed(() => ({
    width: `${designWidth}px`,
    height: `${designHeight}px`,
    transform: `scale(${scale.value})`,
    // 缩放原点必须 center:外层是 flex 居中(把布局中心对齐容器中心),
    // 若用 top-left 原点,scale<1 时视觉中心 = (容器/2)×scale,整体偏左上
    // (scale 越小偏得越明显,分屏/小窗口必现)。center 原点围绕中心缩放,
    // 与 flex 居中对齐的中心重合 —— 两种机制配合,任意比例都居中
    transformOrigin: 'center center'
  }))

  return { container, scale, screenStyle }
}
