import type { EChartsOption } from 'echarts'
import { registerTheme } from 'echarts/core'

/**
 * ECharts 主题:与 styles/theme.css 语义色同源(手动同步,注释对齐)
 * 原 aiC 项目注册 7 套主题,新项目收敛为 light/dark 两套(精的原则)
 */

/** 图表基础色板(与 --pm-* 语义色对齐) */
const palette = {
  light: ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
  dark: ['#3b82f6', '#22c55e', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee']
}

const baseLight: EChartsOption = {
  backgroundColor: 'transparent',
  textStyle: { color: '#646a73' },
  color: palette.light,
  legend: { textStyle: { color: '#646a73' } },
  tooltip: { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: '#e5e7eb', textStyle: { color: '#1f2329' } }
}

const baseDark: EChartsOption = {
  backgroundColor: 'transparent',
  textStyle: { color: '#9aa4b8' },
  color: palette.dark,
  legend: { textStyle: { color: '#9aa4b8' } },
  tooltip: { backgroundColor: 'rgba(20,28,46,0.95)', borderColor: '#2a3450', textStyle: { color: '#e8ecf4' } }
}

/** 大屏专用深色主题(独立命名,防大屏被全局主题带跑) */
const baseScreen: EChartsOption = {
  backgroundColor: 'transparent',
  textStyle: { color: '#7fb3e8' },
  color: ['#22d3ee', '#f5c542', '#34d399', '#f87171', '#a78bfa', '#fb923c'],
  legend: { textStyle: { color: '#7fb3e8' } },
  tooltip: {
    backgroundColor: 'rgba(6,18,38,0.92)',
    borderColor: 'rgba(64,158,255,0.4)',
    textStyle: { color: '#d8f0ff' }
  }
}

export function initEchartsThemes() {
  registerTheme('light', baseLight)
  registerTheme('dark', baseDark)
  registerTheme('screen', baseScreen)
}
