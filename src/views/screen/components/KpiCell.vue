<template>
  <div class="kpi-item">
    <div class="kpi-num" :style="{ color }">{{ display.toLocaleString() }}</div>
    <div class="kpi-label">{{ label }}</div>
  </div>
</template>

<script setup lang="ts">
import { useCountTo } from '@/composables/useCountTo'

/**
 * KpiCell —— 把"每秒变化的数字"隔离在最小组件里
 *
 * 【性能治理要点】
 * Vue3 的 render effect 是**组件级**的:一个组件里任何被读取的响应式数据变化,
 * 都会让整个组件的 render 重跑。useCountTo 的 rAF 每帧都写 display.value,
 * 若把它放在 739 行的大屏组件里,就是约 60fps 的整屏重渲染 + vnode diff ——
 * 而 KPI 数据本身只是 1Hz 更新,真值只变了 1%,代价却是每秒 60 次全屏 diff。
 * 下沉成子组件后,每帧重渲染的范围收敛到这一个 3 节点的格子。
 *
 * 另一处细节:duration 取 700ms 而非默认 1200ms。因为 KPI 每秒就更新一次,
 * 动画时长若大于更新间隔,动画会被下一次更新不断打断 → 数字永远在滚、
 * 人眼读不到准确值;700ms 留出 300ms 静止期,数字"跳一下、停一下",读得清。
 */
const props = defineProps<{ label: string; value: number; color: string }>()
const display = useCountTo(() => props.value, 700)
</script>

<style scoped>
.kpi-item {
  text-align: center;
  padding: 10px 0;
  background: var(--screen-bg-panel-2);
  border-radius: 6px;
}
.kpi-num {
  font-size: 30px;
  font-weight: 700;
  /* 等宽数字:每秒跳动时宽度恒定,不会左右抖 */
  font-variant-numeric: tabular-nums;
  font-family: 'DIN Alternate', 'Bahnschrift', Consolas, sans-serif;
}
.kpi-label {
  font-size: 12px;
  color: var(--screen-text-sub);
  margin-top: 2px;
}
</style>
