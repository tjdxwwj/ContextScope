/**
 * 加载数据（优先使用前端本地 mock，后面再接真实 API）
 */

import type { RawStore } from './rawTypes'
import { fetchRequests } from './apiClient'

// 从 public/data/requests.json 读取本地 mock 数据
async function loadMockStore(): Promise<RawStore | null> {
  try {
    const res = await fetch('/data/requests.json')
    if (!res.ok) {
      console.warn('[Data] Failed to load mock /data/requests.json:', res.status)
      return null
    }
    const json = (await res.json()) as RawStore
    console.log('[Data] Loaded from mock file:', json.requests.length, 'requests')
    return json
  } catch (err) {
    console.warn('[Data] Error loading mock /data/requests.json:', err)
    return null
  }
}

export async function loadLocalStore(): Promise<RawStore | null> {
  // 1) 优先使用前端本地 mock
  const mock = await loadMockStore()
  if (mock) return mock

  // 2) 如需接真实 API，可打开下面逻辑
  const apiData = await fetchRequests()
  if (apiData) {
    console.log('[Data] Loaded from real API:', apiData.requests.length, 'requests')
    return apiData
  }

  console.log('[Data] No data (mock & API both unavailable)')
  return null
}

// 实时数据轮询：当前阶段也直接复用本地 mock，后面接入真实 API 再改回 fetchRequests
export async function loadRealTimeData(): Promise<RawStore | null> {
  return await loadLocalStore()
}
