/**
 * Commitlint 配置 —— 提交信息格式门禁
 *
 * 【为什么需要】commit message 是给人看的变更日志,也是给机器看的结构化数据:
 *   feat / fix / perf / refactor / docs / test / chore 这些 type 一旦统一,
 *   就能自动生成 CHANGELOG、按 type 筛选提交、在 code review 时快速判断改动性质。
 *   一个人写的项目同样受益 —— 三个月后回看 `git log --oneline`,一眼能认出哪次提交动了什么。
 *
 * 【怎么生效】不靠自觉,靠 .husky/commit-msg 钩子:提交时自动跑,
 *   格式不对直接打回,脏提交根本进不了仓库。
 *
 * 【规则从哪来】extends @commitlint/config-conventional —— Angular 提交规范,
 *   是事实标准(create-vue / Vue 官方仓库 / 绝大多数开源项目都用它)。
 *
 * 【为什么一条自定义规则都不加】曾经想当然加过一条 `'subject-case': [0]`,
 *   理由是"这条规则为英文设计,中文提交会被误判"。实测(commitlint 21.2.2):
 *     中文提交 `perf(园区分布): 下钻从 1-2 秒降到几十毫秒` → 通过,无告警
 *   也就是说这条规则根本不会误伤中文,加它纯属多余,而且副作用明确 ——
 *   它会让 `perf(screen): Reduce drilldown latency` 这种大写开头的不规范提交
 *   蒙混过关。结论:不自创规则,原样沿用官方配置。
 */
export default {
  extends: ['@commitlint/config-conventional']
}
