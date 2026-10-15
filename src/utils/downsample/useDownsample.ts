/**
 * 主线程侧的 Worker 封装:promise 化 + **模块级单例复用**
 *
 * 【连接复用】
 * Worker 是昂贵资源:创建要起一个线程并加载模块,耗时约 10~50ms。
 * 大屏与后台的聚合分析都要用它,如果每次调用都 new 一个,这个开销正好落在
 * "切到大屏/点按钮"那一帧上,体感就是一下卡顿。所以整站复用一个实例,
 * 用自增 id 把响应和请求对上 —— 和 HTTP 连接池是同一个思路。
 *
 * 代价说明(容易被忽略的是内存占用):单例意味着一个线程常驻(线程栈几 MB)。
 * 本项目只有两处用到、且都是核心演示路径,常驻比反复创建更划算;
 * 因此它也**不随组件卸载 terminate** —— 否则 A 页面卸载会把 B 页面正在用的
 * 那个 worker 一起杀掉。真要回收,只能在应用级做(如整站卸载时)。
 */
type LttbPoint = { x: number; y: number }

let worker: Worker | null = null
const pending = new Map<number, (points: LttbPoint[]) => void>()
let seq = 0

/** 懒创建:首次用到时才起线程(没进大数据页面就不付这个成本) */
function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../../workers/lttb.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<{ id: number; points: LttbPoint[] }>) => {
    const resolve = pending.get(e.data.id)
    if (resolve) {
      pending.delete(e.data.id)
      resolve(e.data.points)
    }
  }
  worker.onerror = () => {
    // Worker 异常:把在途请求全部以空数组兜底返回,避免调用方永远挂着(可用性优先)
    pending.forEach(resolve => resolve([]))
    pending.clear()
  }
  return worker
}

export function useDownsampleWorker() {
  function downsample(points: LttbPoint[], threshold = 1200): Promise<LttbPoint[]> {
    return new Promise(resolve => {
      const id = ++seq
      pending.set(id, resolve)
      getWorker().postMessage({ id, points, threshold })
    })
  }

  return { downsample }
}
