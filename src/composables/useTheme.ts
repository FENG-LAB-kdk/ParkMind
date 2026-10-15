import { computed, ref } from 'vue'

/**
 * useTheme —— 亮/暗主题 + ECharts 主题名同源
 *
 * 【设计要点】主题系统两级联动:
 * CSS 层:切换 html[data-theme],CSS 变量即时响应,零重编译;
 * ECharts 层:useChart 读 echartsTheme 决定 init 主题,切换时 dispose 重建。
 * 两层的取色同源于 styles/theme.css 的语义色(一处改全局改)
 */
const MODE_KEY = 'pm_theme_mode'

const stored = localStorage.getItem(MODE_KEY)
export const mode = ref<'light' | 'dark'>(stored === 'dark' ? 'dark' : 'light')

export function applyMode(m: 'light' | 'dark') {
  mode.value = m
  document.documentElement.setAttribute('data-theme', m)
  localStorage.setItem(MODE_KEY, m)
}

applyMode(mode.value)

export function useTheme() {
  const isDark = computed(() => mode.value === 'dark')
  /** ECharts init 主题名(见 src/config/echartsTheme.ts) */
  const echartsTheme = computed(() => (mode.value === 'dark' ? 'dark' : 'light'))

  function toggle() {
    applyMode(isDark.value ? 'light' : 'dark')
  }

  return { mode, isDark, echartsTheme, toggle }
}
