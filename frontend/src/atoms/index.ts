import { atom } from 'jotai'
import type { Stats, Request, Analysis, TokenTrendPoint } from '../types'

// 加载状态
export const loadingAtom = atom(true)

// WebSocket 连接状态
export const wsConnectedAtom = atom(false)

// 统计数据
export const statsAtom = atom<Stats | null>(null)

// 请求列表
export const requestsAtom = atom<Request[]>([])

// 搜索查询
export const searchQueryAtom = atom('')

// 过滤条件
export const filtersAtom = atom({
  session: '',
  provider: '',
  model: ''
})

// Token 趋势数据
export const tokenTrendDataAtom = atom<TokenTrendPoint[]>([])

// 趋势周期（小时）
export const trendPeriodAtom = atom(24)

// 当前分析详情
export const selectedAnalysisAtom = atom<Analysis | null>(null)

// 活跃的 Tab
export const activeTabAtom = atom<'token' | 'heatmap' | 'timeline' | 'graph' | 'insights'>('token')

// Modal 打开状态
export const analysisModalOpenAtom = atom(false)

// 刷新计数器（用于触发刷新）
export const refreshCounterAtom = atom(0)

// 派生：过滤后的请求列表
export const filteredRequestsAtom = atom((get) => {
  const requests = get(requestsAtom)
  const searchQuery = get(searchQueryAtom).toLowerCase()
  
  if (!searchQuery) return requests
  
  return requests.filter(req => 
    req.provider.toLowerCase().includes(searchQuery) ||
    req.model.toLowerCase().includes(searchQuery) ||
    req.runId.toLowerCase().includes(searchQuery) ||
    req.sessionId.toLowerCase().includes(searchQuery)
  )
})

// 派生：请求总数
export const requestCountAtom = atom((get) => {
  return get(filteredRequestsAtom).length
})

// 导出所有 atoms
export * from './api'
export * from './charts'
