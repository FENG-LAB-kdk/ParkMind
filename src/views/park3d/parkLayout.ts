import type { Building } from '@/types'

/**
 * parkLayout —— 园区三维的**坐标与尺寸换算**
 *
 * 【为什么单独拆一个文件】
 * 1. 这里全是"输入 → 输出"的纯计算,不碰 Three.js、不碰 Vue,
 *    可以直接写单元测试 —— 三维场景本身在 jsdom 里跑不起来,但布局逻辑可以
 * 2. 页面组件只负责"把算好的东西摆进场景",职责分明
 *
 * 【配色不在这里】功率热度判据已抽到 src/config/buildingHeat.ts,
 * 由 2D 平面图和本三维场景共用,避免两处各写一份导致口径漂移。
 *
 * 【坐标从哪来】服务端下发的楼宇自带 x / z(单位:**米**,x 向东、z 向南),
 * 见 server/src/data.js。所以三维**不需要自己编布局** —— 直接用真实坐标,
 * 保证大屏 2D 图和三维场景里楼宇的相对位置完全一致。
 * 当前实测数据:4 列 × 2 行,x ∈ [-63, 63],z ∈ [-34, 34],楼层 6~21。
 */

/** 楼体底面尺寸(米)—— 东西向宽度。必须小于相邻楼宇在 x 方向的最小间距(实测 42m) */
export const BUILDING_WIDTH = 26
/** 楼体底面尺寸(米)—— 南北向进深。必须小于 z 方向的最小间距(实测 68m) */
export const BUILDING_DEPTH = 20
/** 单层高度(米)—— 按常规写字楼层高取 3.6m */
export const FLOOR_HEIGHT = 3.6

/** 楼高 = 楼层数 × 单层高度 */
export function buildingHeight(floors: number): number {
  return floors * FLOOR_HEIGHT
}

/**
 * 服务端平面坐标(米)→ Three.js 世界坐标
 *
 * 映射关系(两边都是右手系,x 向东、z 向南这一约定直接沿用):
 *   服务端 x  →  Three.js x
 *   服务端 z  →  Three.js z
 *   楼层数    →  Three.js y(高度)
 *
 * 楼宇以**底面中心**对齐到坐标点:所以 y 要抬到楼高的一半
 * (BoxGeometry 的原点在几何中心,y 从 0 开始会让一半楼埋进地里)。
 */
export function toWorldPosition(b: Pick<Building, 'x' | 'z' | 'floors'>): {
  x: number
  y: number
  z: number
} {
  const height = buildingHeight(b.floors)
  return { x: b.x, y: height / 2, z: b.z }
}
