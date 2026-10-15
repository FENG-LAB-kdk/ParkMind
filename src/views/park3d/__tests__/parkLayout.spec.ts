import { describe, expect, it } from 'vitest'
import { BUILDING_DEPTH, BUILDING_WIDTH, FLOOR_HEIGHT, buildingHeight, toWorldPosition } from '../parkLayout'

/**
 * parkLayout 是三维场景里唯一"可测"的部分 —— 其余代码都要 WebGL 上下文,
 * jsdom 里跑不起来。所以坐标换算必须钉死在单测里:
 * 它一旦算错,三维场景会出现"楼埋进地里""楼之间穿模"这类
 * 只有肉眼才能发现的错误,而肉眼恰恰是最不可靠的验收手段。
 *
 * (功率配色的测试在 src/config/__tests__/buildingHeat.spec.ts —— 那份判据
 *  已抽成 2D/3D 共享,归属 config 而不是这里。)
 */
describe('parkLayout · 楼高换算', () => {
  it('楼高 = 楼层数 × 单层高度', () => {
    expect(buildingHeight(1)).toBe(FLOOR_HEIGHT)
    expect(buildingHeight(10)).toBe(10 * FLOOR_HEIGHT)
  })

  it('楼层为 0 时高度为 0(不产生 NaN)', () => {
    expect(buildingHeight(0)).toBe(0)
  })
})

describe('parkLayout · 坐标映射', () => {
  it('服务端的 x / z 原样映射到三维的 x / z', () => {
    const p = toWorldPosition({ x: -63, z: 34, floors: 10 })
    expect(p.x).toBe(-63)
    expect(p.z).toBe(34)
  })

  it('y 抬到楼高的一半 —— 让楼"坐"在地面上而不是埋进地里', () => {
    // BoxGeometry 的原点在几何中心,直接把 y 设成 0 会有一半的楼沉到地面以下
    const floors = 12
    const p = toWorldPosition({ x: 0, z: 0, floors })
    expect(p.y).toBe(buildingHeight(floors) / 2)
    expect(p.y).toBeGreaterThan(0)
  })
})

describe('parkLayout · 楼体尺寸', () => {
  it('底面尺寸必须小于相邻楼宇的间距,否则会穿模', () => {
    // 服务端实测最小间距:x 方向 42m、z 方向 68m(见 server/src/data.js 的 CELL_X / CELL_Z)
    expect(BUILDING_WIDTH).toBeGreaterThan(0)
    expect(BUILDING_DEPTH).toBeGreaterThan(0)
    expect(BUILDING_WIDTH).toBeLessThan(42)
    expect(BUILDING_DEPTH).toBeLessThan(68)
  })
})
