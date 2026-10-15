import { computed, onMounted, onUnmounted, onActivated, onDeactivated, shallowRef, watch, type Ref } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, GaugeChart, MapChart, EffectScatterChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
  MarkLineComponent,
  GeoComponent,
  VisualMapComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useTheme } from './useTheme'

/**
 * useChart —— ECharts 按需引入 + 生命周期统一管理
 *
 * 【图表层设计】
 * 1. 按需引入:echarts 全量 ≈ 1MB,这里只注册用到的图与组件(首屏优化一环)
 * 2. 内存治理:每个实例在容器卸载时 dispose;resize 用 ResizeObserver +
 *    rAF 合并(同一帧内多次触发只执行一次)。改良自原 aiC 项目
 *    (它监听 window.resize + element-resize-detector,多图场景互相干扰)
 * 3. 主题联动:echarts 不支持运行时改主题,换肤必须 dispose 重建 —— 
 * 4. 不用 appendData:该方法官方仅支持 scatter / lines 系列,本项目折线图是 line,
 *    调了也不生效 —— 实时更新一律走"增量 setOption"(merge 模式,只传 series.data)
 */
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GaugeChart,
  MapChart,
  EffectScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  TitleComponent,
  MarkLineComponent,
  GeoComponent,
  VisualMapComponent,
  CanvasRenderer
])

export function useChart(elRef: Ref<HTMLElement | undefined>, themeName?: string) {
  const { echartsTheme } = useTheme()
  /** 显式指定主题(大屏传 'screen')则不跟随全局换肤;不传则跟随后台的 light/dark */
  const theme = computed(() => themeName ?? echartsTheme.value)
  const chart = shallowRef<echarts.ECharts | null>(null)
  let observer: ResizeObserver | null = null
  let rafPending = false
  let optionPending: Record<string, unknown> | null = null
  let optionNotMerge = false
  let optionFrame = 0
  /** 最后一次 setOption 的内容:dispose 重建后必须重放,否则新实例是白板 */
  let lastOption: Record<string, unknown> | null = null
  let lastNotMerge = false

  function init() {
    if (chart.value || !elRef.value) return chart.value
    chart.value = echarts.init(elRef.value, theme.value)
    return chart.value
  }

  /** dispose 重建 —— 主题切换 / 容器复用时调用
   *  ResizeObserver 观察的是具体 DOM 节点,dispose 断开后不会自动恢复,
   *  所以重建实例后必须重新 watchContainer(),否则该图表从此不再自适应尺寸 */
  function reinit() {
    dispose()
    if (!elRef.value) return null
    chart.value = echarts.init(elRef.value, theme.value)
    watchContainer()
    // 新实例身上没有任何 option —— 不重放最后一次配置,图表就是一块白板
    if (lastOption) chart.value.setOption(lastOption, lastNotMerge)
    return chart.value
  }

  function ensure(): echarts.ECharts | null {
    return chart.value ?? init()
  }

  function watchContainer() {
    observer?.disconnect()
    if (!elRef.value) return
    observer = new ResizeObserver(() => scheduleResize())
    observer.observe(elRef.value)
  }

  function scheduleResize() {
    if (rafPending || !chart.value) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      chart.value?.resize()
    })
  }

  function flushOption() {
    if (!optionPending) return
    const current = optionPending
    const notMerge = optionNotMerge
    optionPending = null
    optionNotMerge = false
    if (optionFrame) {
      cancelAnimationFrame(optionFrame)
      optionFrame = 0
    }
    ensure()?.setOption(current, notMerge)
  }

  function setOption(option: Record<string, unknown>, notMerge = false) {
    lastOption = option
    lastNotMerge = notMerge
    optionPending = option
    optionNotMerge = notMerge
    if (optionFrame) cancelAnimationFrame(optionFrame)
    optionFrame = requestAnimationFrame(() => {
      optionFrame = 0
      flushOption()
    })
  }

  function dispose() {
    observer?.disconnect()
    observer = null
    if (optionFrame) {
      cancelAnimationFrame(optionFrame)
      optionFrame = 0
    }
    optionPending = null
    optionNotMerge = false
    chart.value?.dispose()
    chart.value = null
  }

  // 【内存泄漏防治】卸载清理实例;keep-alive 失活时暂停 rAF,激活时补一次 resize
  onMounted(() => {
    init()
    watchContainer()
    scheduleResize()
  })
  onActivated(() => scheduleResize())
  onDeactivated(() => {
    rafPending = false
  })
  onUnmounted(dispose)

  // 【主题切换】主题只能在 init 时指定,没有运行时 setTheme,
  // 所以换肤 = dispose + init 重建。这里自动监听全局主题变化并重放最后一次配置。
  // 显式指定主题的图表(大屏 'screen')不参与全局换肤,因此不注册这个监听。
  if (!themeName) watch(theme, () => reinit())

  return { chart, init, reinit, setOption, resize: scheduleResize, dispose }
}
