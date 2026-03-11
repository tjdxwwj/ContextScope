/**
 * 从本地静态文件加载 requests.json（不经过服务端接口）。
 * 将 docs/requests.json 复制到 frontend/public/data/requests.json 即可。
 */

import type { RawStore } from './rawTypes'

const DATA_URL = '/data/requests.json'

export async function loadLocalStore(): Promise<RawStore | null> {
  try {
    const res = await fetch(DATA_URL)
    if (!res.ok) return null
    const data = (await res.json()) as RawStore
    if (!data || !Array.isArray(data.requests)) return null
    return {
      requests: data.requests || [],
      subagentLinks: data.subagentLinks || [],
      toolCalls: data.toolCalls || [],
      nextId: data.nextId,
      nextLinkId: data.nextLinkId,
      nextToolCallId: data.nextToolCallId,
      lastUpdated: data.lastUpdated,
    }
  } catch {
    return null
  }
}
