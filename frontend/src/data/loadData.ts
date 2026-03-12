/**
 * 加载数据（仅从真实 API 获取）
 */

import type { RawStore } from './rawTypes'
import { fetchRequests, type DateFilter } from './apiClient'

export async function loadLocalStore(filter?: DateFilter): Promise<RawStore | null> {
  const apiData = await fetchRequests(filter)
  if (apiData) {
    console.log('[Data] Loaded from real API:', apiData.requests.length, 'requests')
    return apiData
  }

  console.log('[Data] No data (API unavailable)')
  return null
}

// 实时数据轮询（每 5 秒刷新一次）
export async function loadRealTimeData(filter?: DateFilter): Promise<RawStore | null> {
  return await fetchRequests(filter)
}
