/**
 * 加载数据（仅从真实 API 获取）
 */

import type { RawStore } from './rawTypes'
import { fetchRequests, type DateFilter } from './apiClient'

export async function loadLocalStore(filter?: DateFilter): Promise<RawStore | null> {
  const apiData = await fetchRequests(filter, { includeAux: true })
  if (apiData) {
    return apiData
  }
  return null
}

// 实时数据轮询（每 5 秒刷新一次）
export async function loadRealTimeData(filter?: DateFilter): Promise<RawStore | null> {
  return await fetchRequests(filter, { includeAux: false })
}
