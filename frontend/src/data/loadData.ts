/**
 * 加载数据 - 仅从真实 API 获取
 */

import type { RawStore } from './rawTypes'
import { fetchRequests } from './apiClient'

export async function loadLocalStore(): Promise<RawStore | null> {
  const apiData = await fetchRequests()
  if (apiData) {
    console.log('[Data] Loaded from real API:', apiData.requests.length, 'requests')
    return apiData
  }

  console.log('[Data] API unavailable, no fallback enabled')
  return null
}

// 实时数据轮询（每 5 秒刷新一次）
export async function loadRealTimeData(): Promise<RawStore | null> {
  return await fetchRequests()
}
