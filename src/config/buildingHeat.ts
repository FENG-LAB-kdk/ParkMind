import type { Building } from '@/types'

/**
 * buildingHeat —— 楼宇"功率热度"判据(2D 平面图与 3D 场景共用)
 *
 * 【为什么必须抽出来共享】
 * 这条判据原本在 src/views/screen/components/MapBuilding.vue 里,
 * 加三维场景时又在 src/views/park3d/ 里抄了一份 —— 两处一模一样的阈值和基线表。
 * 这种重复最危险的地方在于**它不会报错**:哪天调了 2D 图的阈值忘了改 3D,
 * 结果就是"同一栋楼在平面图上是黄色、在三维场景里是红色",
 * 而且只有肉眼对比才能发现 —— 用户会先于你发现。
 *
 * 【判据为什么是"相对比例"而不是绝对功率】
 * 工业楼天然比仓储楼耗电高(基线 520 vs 160)。直接比绝对功率的话,
 * 工业楼永远飘红、仓储楼永远是青的,颜色就失去了指示意义。
 * 所以用"功率 ÷ 该类型基线"的比例来分档。
 */

/** 各类型楼宇的功率基线(kW)—— 用于把绝对功率换算成可比的比例 */
export const HEAT_BASELINE: Record<string, number> = {
  industrial: 520,
  commercial: 380,
  office: 240,
  warehouse: 160
}

/** 基线兜底值:类型表里查不到时用它,避免除零/NaN */
export const HEAT_BASELINE_FALLBACK = 300

/** 分档阈值:比例 > HIGH 越限、> MID 偏高,否则正常 */
export const HEAT_THRESHOLD = { HIGH: 1.25, MID: 0.9 } as const

export type HeatLevel = 'high' | 'mid' | 'low'

/**
 * 三档配色,分两套:
 *   solid —— 三维场景用。楼体材质需要不透明色,半透明会让后面的楼透出来
 *   alpha —— 2D 平面图用。楼块叠在网格底图上,半透明才能透出底纹
 * 色相一致(红/黄/青),只是透明度不同,保证两个视图看起来是同一套视觉语言。
 */
export const HEAT_COLORS = {
  solid: { high: '#f87171', mid: '#f5c542', low: '#22d3ee' },
  alpha: {
    high: 'rgba(248, 113, 113, 0.55)',
    mid: 'rgba(245, 197, 66, 0.5)',
    low: 'rgba(34, 211, 238, 0.42)'
  }
} as const

/** 功率 + 楼宇类型 → 档位 */
export function heatLevel(power: number, type: Building['type'] | string): HeatLevel {
  const ratio = power / (HEAT_BASELINE[type] ?? HEAT_BASELINE_FALLBACK)
  if (ratio > HEAT_THRESHOLD.HIGH) return 'high'
  if (ratio > HEAT_THRESHOLD.MID) return 'mid'
  return 'low'
}

/** 三维场景用色(不透明) */
export function heatColorSolid(power: number, type: Building['type'] | string): string {
  return HEAT_COLORS.solid[heatLevel(power, type)]
}

/** 二维平面图用色(半透明) */
export function heatColorAlpha(power: number, type: Building['type'] | string): string {
  return HEAT_COLORS.alpha[heatLevel(power, type)]
}
