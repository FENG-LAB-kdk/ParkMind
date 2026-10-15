import { onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

/**
 * useCountTo —— 数字滚动动画(KPI 翻牌)
 * 【设计要点】
 * 1. rAF 驱动 easeOutCubic 缓动,时间驱动而非步进驱动,保证任何设备上动画时长一致
 * 2. 组件卸载取消 rAF(防泄漏)
 * 3. 入参用 MaybeRefOrGetter:既吃 ref 也吃 getter,这样在子组件里可以传
 *    () => props.value —— 值下沉到子组件后,翻牌的每帧重渲染也只影响那个子组件
 */
export function useCountTo(target: MaybeRefOrGetter<number>, duration = 1200) {
  const display = ref(0)
  let rafId = 0

  function animate() {
    cancelAnimationFrame(rafId)
    const start = performance.now()
    const from = display.value
    const delta = toValue(target) - from
    if (!delta) return

    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      // easeOutCubic:1 - (1-t)^3,结尾慢速精确落点
      const eased = 1 - Math.pow(1 - p, 3)
      display.value = Math.round(from + delta * eased)
      if (p < 1) rafId = requestAnimationFrame(step)
      else display.value = toValue(target)
    }
    rafId = requestAnimationFrame(step)
  }

  watch(() => toValue(target), animate, { immediate: true })
  onUnmounted(() => cancelAnimationFrame(rafId))

  return display
}
