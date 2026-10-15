<template>
  <div ref="containerEl" class="alarm-stream" :style="containerStyle" @scroll="onScroll">
    <div :style="spacerStyle">
      <div :style="translateStyle">
        <div
          v-for="item in renderItems"
          :key="item.id"
          class="alarm-row"
          :class="['lv' + item.level, { 'is-new': item.id === newestId }]"
        >
          <span class="alarm-time">{{ formatTime(item.time, 'HH:mm:ss') }}</span>
          <span class="alarm-badge">[{{ levelText[item.level] }}]</span>
          <span class="alarm-msg text-ellipsis">{{ item.buildingName }} · {{ item.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue'
import type { Alarm } from '@/types'
import { useVirtualList } from '@/composables/useVirtualList'
import { formatTime } from '@/utils/tools'

/**
 * AlarmStream —— 实时告警流(手写虚拟滚动,不依赖任何表格库)
 *
 * 【为什么用虚拟列表】
 * 列表里是 3000 条实时告警,且还在不断头部插入。全量渲染 = 3000 个真实 DOM,
 * 首帧就要构建 3000 个节点,后续每次插入都触发全量 diff。虚拟滚动把它压成
 * 恒定 ~26 行(可视区 + overscan),滚动定位靠前缀和 + 二分,O(log n)。
 *
 * 【入场高亮】(is-new)只给最新到达的那一行加一次动画 —— 全屏保留一个动态焦点,
 * 让"数据在流动"这件事被看见,而不是每行都在闪。
 */
const props = defineProps<{
  /** 告警列表,最新在前(由父组件按时间序维护) */
  items: Alarm[]
  /** 最新到达的告警 id:命中者播放一次入场高亮 */
  newestId?: string
}>()

const levelText: Record<number, string> = { 1: '紧急', 2: '重要', 3: '一般', 4: '提示' }

const containerEl = ref<HTMLElement>()
const { containerStyle, spacerStyle, translateStyle, renderItems, onScroll } = useVirtualList(toRef(props, 'items'), {
  itemHeight: 30,
  overscan: 8,
  containerEl // 视口高度由容器实测,不再硬编码(否则列表填不满面板)
})
</script>

<style scoped>
/* 虚拟列表三层结构:外层滚动容器 / 撑高层 / translateY 平移层 */
.alarm-stream {
  flex: 1;
  min-height: 0;
  font-size: 13px;
}
.alarm-row {
  height: 30px;
  line-height: 30px;
  display: flex;
  gap: 8px;
  padding: 0 8px;
  border-bottom: 1px solid rgba(64, 158, 255, 0.08);
  color: var(--screen-text-sub);
  white-space: nowrap;
}
.alarm-time {
  color: #5f7ea3;
  font-family: Consolas, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.alarm-badge {
  flex-shrink: 0;
}
.alarm-msg {
  flex: 1;
  min-width: 0;
}
/* 新到达的告警:左侧红条淡出 + 整行淡入 */
.alarm-row.is-new {
  animation: alarmIn 1.4s ease-out;
  background: linear-gradient(90deg, rgba(248, 113, 113, 0.22), transparent);
}
@keyframes alarmIn {
  from {
    box-shadow: inset 3px 0 0 #f87171;
    opacity: 0.2;
  }
  to {
    box-shadow: inset 3px 0 0 transparent;
    opacity: 1;
  }
}
.alarm-row.lv1 .alarm-badge {
  color: #f87171;
}
.alarm-row.lv2 .alarm-badge {
  color: #fbbf24;
}
.alarm-row.lv3 .alarm-badge {
  color: #7fb3e8;
}
.alarm-row.lv1 {
  color: #fecaca;
}
</style>
