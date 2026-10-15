/**
 * ESLint 配置(Flat Config,ESLint 9+ 的标准格式)
 *
 * 【为什么这么配】直接采用 Vue 官方脚手架 create-vue 生成的配置结构:
 *   pluginVue.configs['flat/essential']  —— Vue 官方推荐规则(含组合式 API 最佳实践)
 *   vueTsConfigs.recommended             —— @vue/eslint-config-typescript 维护的 TS 规则
 *   skipFormatting                       —— 关掉 ESLint 里所有和格式相关的规则
 *
 * 【最后一条很关键】ESLint 和 Prettier 职责要分开:
 *   ESLint 管代码质量(潜在 bug、未使用变量、Vue 写法),Prettier 管格式(缩进/引号/换行)。
 *   如果两边都管格式,会互相打架 —— 所以用 skipFormatting 把格式规则全部让给 Prettier。
 */
import pluginVue from 'eslint-plugin-vue'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}']
  },
  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**', '**/node_modules/**', 'public/geo/**']
  },
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  skipFormatting,
  {
    name: 'app/custom-rules',
    rules: {
      // 项目里大量使用"具名导出 + 一行一接口",未使用变量应该是错误而非警告
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // 允许在 .vue 里用多词组件名(项目的组件都是 KpiCell / MapBuilding 这种命名,本来规范)
      'vue/multi-word-component-names': 'off'
    }
  }
)
