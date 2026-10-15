import { compileTemplate, parse } from 'vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

/**
 * 全量 SFC 编译守卫
 *
 * 【为什么需要这个测试】踩过一次:某页面 `@click` 里的多语句内联处理器被
 * Prettier(semi: false)删掉分号折成多行 ——
 *     @click="
 *       selected = null
 *       syncScatter()
 *     "
 * Vue 的内联处理器按**表达式**解析,没有分号就不是合法表达式,整个 SFC 编译失败,
 * 该页面在浏览器里直接 500 白屏。
 *
 * 要命的是**四道常规门禁全都发现不了**:
 *   · eslint           —— 不解析模板里的表达式语法
 *   · prettier --check —— 这个错误恰恰是 Prettier 自己造的,它认为没问题
 *   · vue-tsc          —— 走类型检查路径,实测放过
 *   · 单元测试         —— 只测纯函数,不碰模板
 * 只有 `vite build` 会报,而 build 又容易被跳过(毕竟"本地 dev 能跑")。
 * 所以把「SFC 能不能编译」直接变成一条测试,让 `npm test` 就拦住它。
 *
 * 【为什么用 import.meta.glob 而不是 fs 遍历】和 router/dynamic.ts 收集页面组件
 * 是同一套机制;而且省掉了路径推算 —— 测试里 `import.meta.url` 不是 file:// 协议,
 * 靠它定位 src 目录会直接抛 "The URL must be of scheme file"。
 *
 * 【为什么用 vue/compiler-sfc 而不是装 @vue/compiler-sfc】后者是 vue 包的官方
 * 子路径导出(package.json 的 exports 字段里有),vue 本来就是直接依赖,
 * 不必再引一个版本必须和 vue 严格对齐的传递依赖。
 */

/** 以原始文本拿到全部 .vue 源码(键形如 '../views/park/index.vue') */
const sources = import.meta.glob('../**/*.vue', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

const displayName = (key: string) => key.replace(/^\.\.\//, '')
const files = Object.keys(sources)

describe('SFC 编译守卫', () => {
  it('必须真的扫到组件文件', () => {
    // 防止 glob 写错导致"扫了 0 个文件所以永远绿"这种假通过
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files)('%s 可以被 SFC 编译器正常解析与编译', key => {
    const filename = displayName(key)

    // 第一层:解析 —— 模板表达式语法错误在这一层就会暴露(就是上面那个案例)
    const { descriptor, errors: parseErrors } = parse(sources[key], { filename })

    // 第二层:编译模板 —— 抓解析层放过、但真正生成渲染函数时才失败的写法
    const { errors: compileErrors } = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename,
      id: filename
    })

    const messages = [...parseErrors, ...compileErrors].map(e => (typeof e === 'string' ? e : e.message || String(e)))
    expect(messages).toEqual([])
  })
})
