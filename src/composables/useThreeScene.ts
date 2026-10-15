import { onMounted, onUnmounted, shallowRef, type Ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * useThreeScene —— Three.js 场景的生命周期封装
 *
 * 【为什么要有这一层】和项目里的 useChart 是同一个理由:
 * Three.js 有**一整套必须成对出现的资源** —— scene / camera / renderer / controls /
 * 几何体 / 材质 / 渲染循环 / 事件监听。少清理任何一样都是内存泄漏,而且泄漏得很隐蔽
 * (页面来回切几次,显存和内存一路涨)。
 * 把"创建 → 每帧渲染 → 销毁"收在一个 composable 里,调用方只管往场景里摆东西。
 *
 * 【为什么是 shallowRef 而不是 ref】Three.js 的对象内部有大量循环引用和自引用
 * (Object3D.parent ↔ children、material ↔ uniforms…)。用 ref 的话 Vue 会**深度递归**
 * 去把它们全部变成 Proxy —— 既慢,又可能因为 Proxy 包装导致 Three.js 内部
 * 基于对象身份的判断(如 `===` 比较、WeakMap 查表)失效。
 * 和图表同理:这类"重量级、不需要深度响应式"的实例,一律 shallowRef。
 *
 * 【技术选型】
 * CSS 3D 做不了真实光照和透视相机;Canvas 2D 手绘要实现投影矩阵、深度排序、光照模型,
 * 等于自己重写一遍 WebGL 渲染管线。Three.js 是这条路上的成熟方案。
 */

export interface UseThreeSceneOptions {
  /** 挂载容器:canvas 会被塞进这个元素 */
  container: Ref<HTMLElement | undefined>
  /** 相机初始位置(世界坐标) */
  cameraPosition?: [number, number, number]
  /** 相机看向的点 */
  target?: [number, number, number]
  /** 是否自动缓慢旋转(演示时更抓眼) */
  autoRotate?: boolean
  /** 每帧回调 —— 用于播放动画(如告警闪烁) */
  onFrame?: (delta: number) => void
}

/**
 * 释放一份材质。
 * 【坑】`material.dispose()` **不会**连带释放它引用的贴图 —— 贴图占的是显存,
 * 必须自己再调一次 `texture.dispose()`。这是 Three.js 里最常见的一处显存泄漏。
 */
function disposeMaterial(mat: THREE.Material) {
  const withMap = mat as THREE.Material & { map?: THREE.Texture | null }
  withMap.map?.dispose()
  mat.dispose()
}

export function useThreeScene(options: UseThreeSceneOptions) {
  const { container, cameraPosition = [0, 130, 200], target = [0, 0, 0], autoRotate = false, onFrame } = options

  /** 全部用 shallowRef:见文件头【为什么是 shallowRef】 */
  const scene = shallowRef<THREE.Scene>()
  const camera = shallowRef<THREE.PerspectiveCamera>()
  const renderer = shallowRef<THREE.WebGLRenderer>()
  const controls = shallowRef<OrbitControls>()

  let rafId = 0
  let resizeObserver: ResizeObserver | null = null
  /** 卸载后必须停掉渲染循环 —— 否则 rAF 会继续跑在一个已销毁的渲染器上,报错刷屏 */
  let disposed = false
  let lastFrameAt = 0

  /**
   * 把相机对准场景 —— 给"复位视角"按钮用。
   * 单独抽出来是因为 controls 内部有 damping 状态,直接改 camera.position 会被它覆盖,
   * 必须同时更新 controls.target 并调用 update()。
   */
  function resetCamera() {
    const cam = camera.value
    const ctl = controls.value
    if (!cam || !ctl) return
    cam.position.set(...cameraPosition)
    ctl.target.set(...target)
    ctl.update()
  }

  function animate(now: number) {
    if (disposed) return
    rafId = requestAnimationFrame(animate)

    // 帧间隔(秒)—— 动画按时间驱动而不是按帧驱动,不同刷新率的设备速度才一致
    const delta = lastFrameAt ? (now - lastFrameAt) / 1000 : 0
    lastFrameAt = now

    onFrame?.(delta)
    // damping 开启时必须每帧 update,否则拖拽松手后惯性不会继续
    controls.value?.update()
    const r = renderer.value
    const s = scene.value
    const c = camera.value
    if (r && s && c) r.render(s, c)
  }

  function handleResize() {
    const el = container.value
    const cam = camera.value
    const r = renderer.value
    if (!el || !cam || !r) return
    const { clientWidth: w, clientHeight: h } = el
    // 容器最小化/隐藏时会拿到 0,此时跳过 —— 除以 0 会让相机矩阵变成 NaN,之后整个场景都渲染不出来
    if (!w || !h) return
    cam.aspect = w / h
    cam.updateProjectionMatrix()
    r.setSize(w, h, false) // false = 不改 canvas 的 CSS 尺寸,交给样式控制,避免和 flex 布局打架
  }

  function init() {
    const el = container.value
    if (!el) return

    /* ---------- 场景 ---------- */
    const s = new THREE.Scene()
    // 雾效:让远处的楼稍微"褪色",强化空间纵深感(比纯黑背景自然)
    s.fog = new THREE.Fog(0x0b1120, 260, 620)
    scene.value = s

    /* ---------- 相机 ---------- */
    const cam = new THREE.PerspectiveCamera(45, 1, 1, 2000)
    cam.position.set(...cameraPosition)
    camera.value = cam

    /* ---------- 渲染器 ---------- */
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    // 像素比封顶 2:4K 屏上按 devicePixelRatio 全量渲染会让 GPU 压力翻数倍,
    // 而肉眼几乎看不出差别 —— 这是移动端/高分屏最常见的性能坑
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    r.setClearColor(0x0b1120)
    el.appendChild(r.domElement)
    renderer.value = r

    /* ---------- 光照 ---------- */
    // 环境光:打底亮度,没有它背光面是纯黑
    s.add(new THREE.AmbientLight(0xffffff, 0.55))
    // 平行光:制造明暗面,立体感全靠它
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
    dirLight.position.set(140, 220, 120)
    s.add(dirLight)
    // 补光:从反方向补一盏弱光,避免背面死黑
    const fillLight = new THREE.DirectionalLight(0x66ccff, 0.5)
    fillLight.position.set(-140, 90, -120)
    s.add(fillLight)

    /* ---------- 交互控制 ---------- */
    const ctl = new OrbitControls(cam, r.domElement)
    ctl.enableDamping = true // 惯性,手感更顺
    ctl.dampingFactor = 0.08
    ctl.minDistance = 70 // 限制最近距离,避免穿模到楼里面
    ctl.maxDistance = 620
    ctl.maxPolarAngle = Math.PI / 2.15 // 限制最多俯到接近水平,不允许钻到地面以下
    ctl.autoRotate = autoRotate
    ctl.autoRotateSpeed = 0.6
    ctl.target.set(...target)
    ctl.update()
    controls.value = ctl

    /* ---------- 尺寸自适应 ---------- */
    handleResize()
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(el)

    /* ---------- 启动渲染循环 ---------- */
    disposed = false
    rafId = requestAnimationFrame(animate)
  }

  /**
   * 销毁 —— 和 useChart 的 dispose 同理,但 Three.js 要清的东西多得多。
   * 逐项说明为什么每一样都必须清(设计说明):
   *   · 几何体/材质:占的是 **GPU 显存**,JS 的垃圾回收管不到,必须显式 dispose
   *   · 纹理:同上
   *   · controls:内部注册了 pointerdown/pointermove/wheel 等监听,不 dispose 会挂在 DOM 上
   *   · ResizeObserver:不断开的话它会一直持有回调闭包
   *   · rAF:不停掉的话循环会继续跑,而且访问的是已经销毁的场景
   *   · renderer:释放 WebGL 上下文;显式 forceContextLoss 是因为浏览器同时可用的
   *     WebGL 上下文数量有上限(通常 16 个),反复进出页面如果不释放,后面会创建失败
   */
  function dispose() {
    disposed = true
    cancelAnimationFrame(rafId)

    resizeObserver?.disconnect()
    resizeObserver = null

    const s = scene.value
    if (s) {
      s.traverse(obj => {
        /**
         * 只 dispose Mesh 的几何体。
         * 【坑】Sprite 的 geometry 是 Three.js 内部的**模块级共享静态对象**
         * (Sprite.js 里有个 `let _geometry`,所有 Sprite 复用同一个),
         * 一旦 dispose 掉,之后创建的每一个 Sprite 都会失效 —— 而且是全局性的、很难定位。
         */
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) mesh.geometry?.dispose()

        const mat = (obj as THREE.Mesh).material
        if (Array.isArray(mat)) mat.forEach(disposeMaterial)
        else if (mat) disposeMaterial(mat)
      })
      s.clear()
    }

    controls.value?.dispose()
    controls.value = undefined

    const r = renderer.value
    if (r) {
      r.dispose()
      r.forceContextLoss()
      // canvas 由 three 创建并 append 进容器,卸载时要顺手摘掉,否则容器里会越堆越多
      r.domElement.remove()
    }
    renderer.value = undefined
    scene.value = undefined
    camera.value = undefined
  }

  onMounted(() => {
    init()
  })
  onUnmounted(() => {
    dispose()
  })

  return { scene, camera, renderer, controls, resetCamera, dispose }
}
