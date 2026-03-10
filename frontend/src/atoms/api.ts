import { atom } from 'jotai'
import type { Request, TokenTrendPoint } from '../types'
import {
  loadingAtom,
  statsAtom,
  requestsAtom,
  filtersAtom,
  trendPeriodAtom,
  tokenTrendDataAtom,
  selectedAnalysisAtom,
  analysisModalOpenAtom,
  activeTabAtom,
  refreshCounterAtom,
  searchQueryAtom
} from './index'

const API_BASE = '/plugins/contextscope/api'

// 加载统计数据
export const loadStatsAtom = atom(null, async (_get, set) => {
  try {
    const res = await fetch(`${API_BASE}/stats`)
    const data = await res.json()
    if (data.error) return
    
    set(statsAtom, data.stats)
    set(loadingAtom, false)
  } catch (error) {
    console.error('Failed to load stats:', error)
    set(loadingAtom, false)
  }
})

// 加载请求列表
export const loadRequestsAtom = atom(null, async (get, set) => {
  try {
    const filters = get(filtersAtom)
    const params = new URLSearchParams({ limit: '50' })
    if (filters.session) params.set('sessionId', filters.session)
    if (filters.provider) params.set('provider', filters.provider)
    if (filters.model) params.set('model', filters.model)

    const res = await fetch(`${API_BASE}/requests?${params}`)
    const data = await res.json()
    if (data.error) return

    set(requestsAtom, data.requests)
    set(loadingAtom, false)
  } catch (error) {
    console.error('Failed to load requests:', error)
    set(loadingAtom, false)
  }
})

// 加载 Token 趋势
export const loadTokenTrendAtom = atom(null, async (get, set) => {
  try {
    const period = get(trendPeriodAtom)
    const endTime = Date.now()
    const startTime = endTime - (period * 24 * 60 * 60 * 1000)
    
    const res = await fetch(`${API_BASE}/requests?startTime=${startTime}&endTime=${endTime}&limit=1000`)
    const data = await res.json()
    if (data.error) return

    const reqs: Request[] = data.requests
    
    // 按小时分组
    const hourlyData: Record<number, { input: number; output: number; total: number }> = {}
    
    reqs.forEach(req => {
      const hour = Math.floor(req.timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000
      if (!hourlyData[hour]) hourlyData[hour] = { input: 0, output: 0, total: 0 }
      hourlyData[hour].input += req.usage?.input || 0
      hourlyData[hour].output += req.usage?.output || 0
      hourlyData[hour].total += req.usage?.total || 0
    })

    const sortedHours = Object.keys(hourlyData).map(Number).sort((a, b) => a - b)
    const trendData: TokenTrendPoint[] = sortedHours.map(hour => ({
      timestamp: hour,
      input: hourlyData[hour].input,
      output: hourlyData[hour].output,
      total: hourlyData[hour].total
    }))

    set(tokenTrendDataAtom, trendData)
  } catch (error) {
    console.error('Failed to load token trend:', error)
  }
})

// 加载分析详情
export const loadAnalysisAtom = atom(null, async (_get, set, runId: string) => {
  try {
    const res = await fetch(`${API_BASE}/analysis?runId=${runId}`)
    const result = await res.json()
    
    if ('error' in result && result.error) {
      alert(`Failed: ${result.error}`)
      return
    }

    set(selectedAnalysisAtom, result)
    set(analysisModalOpenAtom, true)
    set(activeTabAtom, 'token')
  } catch (error) {
    alert(`Failed: ${error}`)
  }
})

// 刷新所有数据
export const refreshAllAtom = atom(null, async (_get, set) => {
  set(refreshCounterAtom, (prev: number) => prev + 1)
  await Promise.all([
    set(loadStatsAtom),
    set(loadRequestsAtom),
    set(loadTokenTrendAtom)
  ])
})

// 清除过滤
export const clearFiltersAtom = atom(null, (_get, set) => {
  set(filtersAtom, { session: '', provider: '', model: '' })
  set(searchQueryAtom, '')
})

// 关闭分析 Modal
export const closeAnalysisModalAtom = atom(null, (_get, set) => {
  set(selectedAnalysisAtom, null)
  set(analysisModalOpenAtom, false)
})
