import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LoginResult, UserInfo } from '@/types'
import { get } from '@/utils/request'

/**
 * 用户状态 —— 登录态闭环 + 显式持久化
 * 【状态管理】模块化按域拆分;持久化不用第三方插件,
 * 登录/登出显式读写 localStorage(单一出口,便于做版本迁移),token 由
 * axios 拦截器统一注入,页面不感知
 */
export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('pm_token') || '')
  const user = ref<UserInfo | null>(JSON.parse(localStorage.getItem('pm_user') || 'null'))

  /** 登录:调后端换 token 与用户信息(演示账号见 server) */
  async function login(username: string, password: string) {
    const res = await get<LoginResult>('/auth/login', { username, password }, { silent: true })
    token.value = res.token
    user.value = res.user
    localStorage.setItem('pm_token', res.token)
    localStorage.setItem('pm_user', JSON.stringify(res.user))
    return res.user
  }

  /** 当前登录用户信息(刷新后守卫兜底拉取,保证 user 非空) */
  async function fetchProfile() {
    const res = await get<UserInfo>('/auth/profile', undefined, { silent: true })
    user.value = res
    localStorage.setItem('pm_user', JSON.stringify(res))
    return res
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('pm_token')
    localStorage.removeItem('pm_user')
  }

  return { token, user, login, fetchProfile, logout }
})
