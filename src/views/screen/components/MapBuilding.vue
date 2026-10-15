<template>
  <g class="building-g" :class="{ selected }" @click.stop="emit('pick', building.id)">
    <rect
      :x="building.x"
      :y="building.y"
      :width="building.w"
      :height="building.h"
      rx="6"
      class="building-rect"
      :style="{ fill: heatColorAlpha(power, building.type), stroke: selected ? '#f5c542' : 'none' }"
    />
    <text
      :x="building.x + building.w / 2"
      :y="building.y + building.h / 2"
      text-anchor="middle"
      dominant-baseline="middle"
      class="building-name"
    >
      {{ building.name }}
    </text>
    <text
      :x="building.x + building.w / 2"
      :y="building.y + building.h / 2 + 22"
      text-anchor="middle"
      dominant-baseline="middle"
      class="building-power"
    >
      {{ Math.round(power) }} kW
    </text>
  </g>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { heatColorAlpha } from '@/config/buildingHeat'

/**
 * MapBuilding —— 单栋楼宇。存在的唯一理由是**渲染粒度**。
 *
 * 【为什么要拆这一层】
 * Vue3 的 render effect 是组件级的:一个组件模板里读了什么响应式数据,
 * 那些数据一变,整个组件的 render 就要重跑。大屏的 energy 帧是 8Hz(每秒 8 栋楼
 * 各一帧),如果在父组件模板里直接写 `{{ buildings[i].power }}`,就是每秒 8 次
 * 重跑 739 行的 render 函数 + 整棵 vnode diff —— 而真正变化的只有 8 个 <text>。
 * 拆开后,每帧只唤醒对应的这一栋楼(4 个 vnode),且依赖精确到 powerMap 的单个 key。
 *
 * 【关键坑】父组件必须把**功率字典本身**传进来(`:powers="powerMap"`),
 * 绝不能写成 `:power="powerMap[building.id]"` —— 那样"读 key"这个动作发生在父组件的
 * render effect 里,父组件照样每秒重渲染,子组件就白拆了。
 *
 * 【命名说明】这个 prop 最初叫 `slot`,被 ESLint 的 vue/no-deprecated-slot-attribute
 * 规则拦下 —— 因为 `slot` 在 Vue 里是保留概念(插槽),拿它当 prop 名会造成阅读歧义。
 * 改名为 building:既消除歧义,也准确表达"这是这一栋楼的信息"。
 */
const props = defineProps<{
  /** 这一栋楼在画布上的位置与静态信息(由父组件算好传入) */
  building: { id: string; name: string; type: string; x: number; y: number; w: number; h: number }
  /** 功率字典本身(不是某一项的值)—— 依赖的建立点在本组件内 */
  powers: Record<string, number>
  selected: boolean
}>()
const emit = defineEmits<{ pick: [id: string] }>()

/** 只订阅自己这一栋:别的楼宇功率变化不会让本组件重渲染 */
const power = computed(() => props.powers[props.building.id] ?? 0)

/**
 * 功率热度着色 —— 判据已抽到 src/config/buildingHeat.ts,
 * 与三维场景 src/views/park3d/ 共用同一份基线表和阈值。
 * 之所以必须共享:两处各写一份的话,调阈值时漏改一边不会报错,
 * 只会让同一栋楼在两个视图里显示成不同颜色 —— 只有肉眼能发现。
 * 这里用的是**半透明**版本(楼块叠在网格底图上要透出底纹),三维那边用不透明版本。
 */
</script>

<style scoped>
.building-rect {
  cursor: pointer;
  transition: stroke-width 0.15s;
}
.building-g.selected .building-rect {
  stroke-width: 2.5;
}
.building-g:not(.selected) .building-rect:hover {
  stroke: rgba(255, 255, 255, 0.6);
  stroke-width: 1.5;
  cursor: pointer;
}
.building-name {
  fill: #d8f0ff;
  font-size: 14px;
  font-weight: 600;
}
.building-power {
  fill: #7fb3e8;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
