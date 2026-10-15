/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * ParkMind 构建配置
 *
 * 【首屏优化】四个手段:
 * 1. 路由懒加载:所有业务视图均 () => import(),按需加载,不进首屏 chunk
 * 2. manualChunks 手动分包:把 echarts(约 1MB)/element-plus/vxe-table 等大库
 *    拆成独立 vendor chunk,利用浏览器 HTTP 缓存"只变业务代码"——同时避免
 *    单个 chunk 过大导致的首次解析阻塞
 * 3. build.target 按现代浏览器,减少降级代码体积
 * 4. 生产 base 相对路径,任意子路径部署
 *
 * 【实现思路来源】原 aiC 项目 vite.config 的 gzip/drop console 思路,
 * 改良:补充了原项目缺失的 manualChunks 分包(vxe + element + echarts 独立拆包)
 */
export default defineConfig({
  base: './',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@server': fileURLToPath(new URL('./server/src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    // 【跨域】开发期走 vite 代理:前端 5173 请求 /api、/ws
    // 分别转发到数据服务 3001,规避开发期跨域;生产由 nginx 同源反代
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3001', ws: true, changeOrigin: true }
    }
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('echarts')) return 'echarts'
          if (id.includes('element-plus') || id.includes('@element-plus')) return 'element-plus'
          if (id.includes('vxe')) return 'vxe'
          /**
           * three 单独拆包 —— 这一条很关键。
           * three 压缩后约 500KB,而它**只被 /park3d 一个页面用到**(该页本身是懒加载)。
           * 不拆的话它会落进 vendor 公共包,导致后台那些完全不碰三维的页面
           * 也要白白多下载 500KB —— 首屏立刻劣化。
           * 拆成独立 chunk 后,它跟着 /park3d 一起按需加载,不进任何页面的首屏。
           */
          if (id.includes('three')) return 'three'
          return 'vendor'
        }
      }
    }
  },
  /**
   * Vitest 单元测试配置
   *
   * 【为什么和 Vite 放一起】测试要复用同一套 alias(`@/` 指向 src)、同一个 vue 插件。
   * 单独建 vitest.config.ts 就得把 resolve.alias 再抄一遍 —— 两处维护必然会漂移。
   *
   * 【测什么、不测什么】
   *   测:纯逻辑(composables / utils)—— 二分查找、LTTB 降采样、防抖节流这类,
   *       输入输出明确、跑得快、改坏了立刻能发现
   *   不测:页面组件 —— 用 jsdom 渲染整个页面成本高、断言脆(改个样式就挂),
   *       性价比远低于测纯函数
   */
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/composables/**/*.ts', 'src/utils/**/*.ts'],
      // 这两个强依赖浏览器/网络环境(axios 实例、performance API),单测价值低
      exclude: ['src/utils/request.ts', 'src/utils/perf-monitor.ts']
    }
  }
})
