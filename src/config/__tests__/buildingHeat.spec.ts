import { describe, expect, it } from 'vitest'
import { HEAT_BASELINE_FALLBACK, heatColorAlpha, heatColorSolid, heatLevel } from '../buildingHeat'

/**
 * 功率热度判据是 2D 平面图和 3D 场景**共用**的一份逻辑。
 * 它一旦算错,表现是"楼的颜色不对"——而这既不会报错、也不会让测试变红,
 * 只能靠肉眼看出来。所以阈值和基线必须在这里钉死。
 */
describe('buildingHeat · 分档', () => {
  it('判据是"功率相对该类型基线的比例",不是绝对功率', () => {
    // 同样 300kW:对仓储(基线 160)是 1.875 倍 → 越限;对工业(基线 520)只有 0.58 倍 → 正常
    // 如果直接比绝对功率,工业楼会永远飘红,颜色就失去了指示意义
    expect(heatLevel(300, 'warehouse')).toBe('high')
    expect(heatLevel(300, 'industrial')).toBe('low')
  })

  it('分档阈值是严格大于:正好等于阈值时不越界', () => {
    const base = HEAT_BASELINE_FALLBACK // 用兜底基线 300,未知类型走的就是它
    expect(heatLevel(base * 0.9, 'unknown')).toBe('low') // 恰好 0.9 → 不算"偏高"
    expect(heatLevel(base * 0.91, 'unknown')).toBe('mid')
    expect(heatLevel(base * 1.25, 'unknown')).toBe('mid') // 恰好 1.25 → 不算"越限"
    expect(heatLevel(base * 1.26, 'unknown')).toBe('high')
  })

  it('未知类型回退到兜底基线 300,不会算出 NaN', () => {
    expect(heatLevel(300, 'unknown')).toBe('mid') // 300/300 = 1.0,落在中档
    expect(heatLevel(0, 'unknown')).toBe('low')
  })
})

describe('buildingHeat · 配色', () => {
  it('两套配色都能返回合法色值', () => {
    expect(heatColorSolid(9999, 'office')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(heatColorSolid(0, 'office')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(heatColorAlpha(9999, 'office')).toMatch(/^rgba\(/)
    expect(heatColorAlpha(0, 'office')).toMatch(/^rgba\(/)
  })

  it('同一功率下,两套配色的档位一致 —— 这是"2D 图和 3D 场景颜色对得上"的前提', () => {
    // 不用逐个色值比对(两套透明度本来就不同),而是验证它们选中的是同一个档位
    const cases: Array<[number, string]> = [
      [9999, 'office'],
      [0, 'office'],
      [300, 'warehouse'],
      [300, 'industrial'],
      [480, 'commercial']
    ]
    cases.forEach(([power, type]) => {
      const level = heatLevel(power, type)
      // 从色值反查档位:红→high、黄→mid、青→low
      const solidIsRed = heatColorSolid(power, type).startsWith('#f87171')
      const alphaIsRed = heatColorAlpha(power, type).startsWith('rgba(248, 113, 113')
      expect(solidIsRed).toBe(alphaIsRed)
      expect(solidIsRed).toBe(level === 'high')
    })
  })
})
