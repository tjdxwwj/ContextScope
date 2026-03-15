import { useState, useEffect, useMemo } from 'react'
import { motion } from 'motion/react'
import { DollarSign, RefreshCw, Search, TrendingUp, Database } from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface ModelCostInfo {
  modelId: string
  modelName: string
  promptPricePer1M: number
  completionPricePer1M: number
  contextLength?: number
  provider?: string
}

export interface PricingResponse {
  pricing: ModelCostInfo[]
  total: number
  updatedAt: string
}

export function PricingTable() {
  const [pricing, setPricing] = useState<ModelCostInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)  // 追踪是否至少加载过一次
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'inputPrice' | 'outputPrice' | 'context'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const fetchPricing = async (forceRefresh = false) => {
    console.log('====== [PricingTable] Fetch start ======')
    try {
      const url = forceRefresh 
        ? '/plugins/contextscope/api/pricing?refresh=true'
        : '/plugins/contextscope/api/pricing'
      
      console.log('[PricingTable] 1. Fetching from', url)
      const res = await fetch(url)
      console.log('[PricingTable] 2. Response received, status:', res.status, 'ok:', res.ok)
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error('[PricingTable] 3. Response not OK:', errorText)
        throw new Error(`HTTP ${res.status}: ${errorText}`)
      }
      
      console.log('[PricingTable] 3. Parsing JSON...')
      const rawData = await res.json()
      console.log('[PricingTable] 4. rawData.total:', rawData.total)
      console.log('[PricingTable] 5. rawData.pricing length:', rawData.pricing?.length)
      
      const data: PricingResponse = rawData
      const pricingData = data.pricing || []
      
      setPricing(pricingData)
      setLastUpdated(data.updatedAt)
      setHasLoadedOnce(true)  // 标记已加载过
      console.log('====== [PricingTable] Fetch complete ======')
    } catch (error) {
      console.error('====== [PricingTable] Fetch ERROR ======', error)
      setHasLoadedOnce(true)  // 即使出错也标记，避免一直加载
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPricing()
  }, [])

  const filteredAndSortedPricing = useMemo(() => {
    // 过滤掉 OpenRouter 内部路由模型（非真实模型）
    const internalModels = new Set([
      'openrouter/auto',
      'openrouter/bodybuilder',
      'openrouter/free',
      'openrouter/healer-alpha',
      'openrouter/hunter-alpha'
    ])
    
    let filtered = pricing.filter(model => {
      // 跳过内部路由模型
      if (internalModels.has(model.modelId)) return false
      
      if (!searchTerm) return true
      const term = searchTerm.toLowerCase()
      return (
        model.modelName.toLowerCase().includes(term) ||
        model.modelId.toLowerCase().includes(term) ||
        (model.provider && model.provider.toLowerCase().includes(term))
      )
    })

    filtered.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'name':
          comparison = a.modelName.localeCompare(b.modelName)
          break
        case 'inputPrice':
          comparison = a.promptPricePer1M - b.promptPricePer1M
          break
        case 'outputPrice':
          comparison = a.completionPricePer1M - b.completionPricePer1M
          break
        case 'context':
          comparison = (a.contextLength || 0) - (b.contextLength || 0)
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [pricing, searchTerm, sortBy, sortOrder])

  const stats = useMemo(() => {
    // 过滤掉 OpenRouter 内部路由模型（负数价格）
    const validModels = pricing.filter(m => m.promptPricePer1M >= 0 && m.completionPricePer1M >= 0)
    
    if (validModels.length === 0) return null
    
    const avgInputPrice = validModels.reduce((sum, m) => sum + m.promptPricePer1M, 0) / validModels.length
    const avgOutputPrice = validModels.reduce((sum, m) => sum + m.completionPricePer1M, 0) / validModels.length
    const cheapestInput = Math.min(...validModels.map(m => m.promptPricePer1M))
    const cheapestOutput = Math.min(...validModels.map(m => m.completionPricePer1M))
    
    return {
      totalModels: validModels.length,
      avgInputPrice: avgInputPrice.toFixed(3),
      avgOutputPrice: avgOutputPrice.toFixed(3),
      cheapestInput: cheapestInput.toFixed(3),
      cheapestOutput: cheapestOutput.toFixed(3)
    }
  }, [pricing])

  const formatPrice = (price: number) => {
    if (price === 0) return 'Free'
    if (price < 0.001) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    return `$${price.toFixed(2)}`
  }

  const formatContextLength = (length?: number) => {
    if (!length) return '-'
    if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(0)}M`
    if (length >= 1_000) return `${(length / 1_000).toFixed(0)}K`
    return length.toString()
  }

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  const SortIcon = ({ field }: { field: typeof sortBy }) => {
    if (sortBy !== field) return <span className="w-4 h-4 inline-block" />
    return sortOrder === 'asc' ? '↑' : '↓'
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">OpenRouter 模型价格</h3>
            <p className="text-[11px] text-slate-500">
              {lastUpdated ? `更新于 ${new Date(lastUpdated).toLocaleString('zh-CN')}` : '加载中...'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchPricing(true)}
            disabled={loading}
            className="p-2 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
            title="刷新价格（强制从 OpenRouter 获取）"
          >
            <RefreshCw className={cn('w-4 h-4 text-slate-600', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50/30 border-b border-slate-100">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">模型总数</span>
            </div>
            <p className="text-lg font-bold text-slate-900">{stats.totalModels}</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">平均输入价格</span>
            </div>
            <p className="text-lg font-bold text-blue-600">${stats.avgInputPrice} / 1M</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">平均输出价格</span>
            </div>
            <p className="text-lg font-bold text-emerald-600">${stats.avgOutputPrice} / 1M</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-bold text-slate-500 uppercase">最低价格</span>
            </div>
            <p className="text-lg font-bold text-amber-600">${stats.cheapestInput} / 1M</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="p-4 border-b border-slate-100">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索模型名称、ID 或提供商..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
            <tr>
              <th 
                className="px-4 py-3 text-left cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-2">
                  <span>模型名称</span>
                  <SortIcon field="name" />
                </div>
              </th>
              <th className="px-4 py-3 text-left">模型 ID</th>
              <th 
                className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('inputPrice')}
              >
                <div className="flex items-center justify-end gap-2">
                  <span>输入价格 / 1M</span>
                  <SortIcon field="inputPrice" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('outputPrice')}
              >
                <div className="flex items-center justify-end gap-2">
                  <span>输出价格 / 1M</span>
                  <SortIcon field="outputPrice" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-right cursor-pointer hover:bg-slate-100 transition-colors"
                onClick={() => handleSort('context')}
              >
                <div className="flex items-center justify-end gap-2">
                  <span>上下文长度</span>
                  <SortIcon field="context" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !hasLoadedOnce ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在从 OpenRouter 获取价格数据...</span>
                  </div>
                </td>
              </tr>
            ) : filteredAndSortedPricing.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>加载价格数据中...</span>
                    </div>
                  ) : searchTerm ? (
                    '未找到匹配的模型'
                  ) : (
                    '暂无价格数据'
                  )}
                </td>
              </tr>
            ) : (
              filteredAndSortedPricing.map((model, idx) => (
                <motion.tr
                  key={model.modelId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" />
                      <span className="text-sm font-semibold text-slate-800">{model.modelName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="mono text-[11px] text-slate-500 bg-slate-100 px-2 py-1 rounded">
                      {model.modelId}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'mono text-sm font-bold',
                      model.promptPricePer1M === 0 ? 'text-emerald-600' :
                      model.promptPricePer1M < 1 ? 'text-blue-600' :
                      'text-slate-700'
                    )}>
                      {formatPrice(model.promptPricePer1M)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'mono text-sm font-bold',
                      model.completionPricePer1M === 0 ? 'text-emerald-600' :
                      model.completionPricePer1M < 1 ? 'text-emerald-600' :
                      'text-slate-700'
                    )}>
                      {formatPrice(model.completionPricePer1M)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="mono text-sm text-slate-600">
                      {formatContextLength(model.contextLength)}
                    </span>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
        <p className="text-[11px] text-slate-500">
          显示 {filteredAndSortedPricing.length} / {pricing.length} 个模型
        </p>
        <p className="text-[10px] text-slate-400">
          价格数据来源：OpenRouter API • 已过滤内部路由模型
        </p>
      </div>
    </div>
  )
}
