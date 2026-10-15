import { computed, reactive, ref, type Ref } from 'vue'
import type { PageResult } from '@/types'

/**
 * useTable —— B 端 CRUD 页面的列表逻辑收敛
 *
 * 【通用列表层】原 aiC 项目 400+ 页面每页手写
 * getData/handleDelete/formCommit 六件套;又存在 hm-table / aic-table 两套
 * 参数合并逻辑。本项目把"分页 + 搜索 + 请求 + 竞态 + 删空回退"收敛到一个
 * hook(80 行),页面只声明 searchModel 与列配置 —— 这是"精"在代码组织上的体现
 */
export interface PageQuery {
  page: number
  limit: number
  [key: string]: unknown
}

export function useTable<T>(
  fetchFn: (query: PageQuery) => Promise<PageResult<T>>,
  options: { defaultLimit?: number } = {}
) {
  const list = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const total = ref(0)
  const query = reactive<PageQuery>({ page: 1, limit: options.defaultLimit ?? 10 })

  // 竞态防护:每轮请求递增 requestId,过期响应直接丢弃(切页/搜索快速连点时
  // 只采纳最后一次 —— 改良自原项目 CancelToken 方案,无取消也保证正确)
  let requestId = 0

  async function load() {
    const id = ++requestId
    loading.value = true
    try {
      const res = await fetchFn({ ...query })
      if (id !== requestId) return // 已有更新的请求,丢弃本次结果
      list.value = res.list
      total.value = res.total
      // 删空末页自动回退页码(原项目 hm-table 同名机制)
      if (res.list.length === 0 && query.page > 1) {
        query.page -= 1
        await load()
      }
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  function search(params?: Record<string, unknown>) {
    Object.assign(query, params ?? {})
    query.page = 1 // 搜索条件变化必须回第一页(分页错乱 bug 防治)
    return load()
  }

  function reset() {
    for (const key of Object.keys(query)) {
      if (!['page', 'limit'].includes(key)) delete query[key]
    }
    return search()
  }

  function reload() {
    return load()
  }

  const isFirstPage = computed(() => query.page === 1)

  return { list, loading, total, query, load, search, reset, reload, isFirstPage }
}
