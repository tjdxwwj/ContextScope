// 价格工具 - 从 API 动态获取价格，无硬编码

export interface ModelPrice {
  modelId: string
  modelName: string
  promptPricePer1M: number
  completionPricePer1M: number
}

// 全局缓存（同步访问）
let pricingCache: Record<string, { input: number; output: number }> = {}
let pricingLoaded = false
let pricingLoading = false
const loadPromises: Promise<void>[] = []

// 从 API 加载价格数据（带重试逻辑）
export const ensurePricingLoaded = async (retryCount = 0, maxRetries = 3): Promise<void> => {
  if (pricingLoaded) return
  
  if (pricingLoading) {
    return loadPromises[0] || Promise.resolve()
  }
  
  pricingLoading = true
  
  const promise = (async () => {
    try {
      console.log(`[Pricing] Fetching prices (attempt ${retryCount + 1}/${maxRetries + 1})...`)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 秒超时
      
      const res = await fetch('/plugins/contextscope/api/pricing', {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      
      const data = await res.json()
      
      if (!data.pricing || data.pricing.length === 0) {
        throw new Error('Empty pricing data')
      }
      
      pricingCache = {}
      for (const model of data.pricing) {
        const m = model as ModelPrice
        // 跳过负数价格的模型（内部路由）
        if (m.promptPricePer1M < 0 || m.completionPricePer1M < 0) continue
        
        // 存储完整路径
        pricingCache[m.modelId.toLowerCase()] = {
          input: m.promptPricePer1M,
          output: m.completionPricePer1M
        }
        // 存储简单名称
        const simpleKey = m.modelId.toLowerCase().split('/').pop() || m.modelId.toLowerCase()
        if (!pricingCache[simpleKey]) {
          pricingCache[simpleKey] = {
            input: m.promptPricePer1M,
            output: m.completionPricePer1M
          }
        }
      }
      
      pricingLoaded = true
      console.log(`[Pricing] ✅ Loaded ${Object.keys(pricingCache).length} price entries`)
      
    } catch (error) {
      console.error(`[Pricing] Attempt ${retryCount + 1} failed:`, error)
      
      // 重试逻辑
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000) // 指数退避：1s, 2s, 4s
        console.log(`[Pricing] Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        pricingLoading = false
        return ensurePricingLoaded(retryCount + 1, maxRetries)
      }
      
      console.error('[Pricing] ❌ All retries failed, prices will show as "未匹配"')
    } finally {
      pricingLoading = false
    }
  })()
  
  loadPromises.push(promise)
  return promise
}

// 立即开始加载（在模块导入时）
ensurePricingLoaded()

// 同步计算成本（使用缓存）
export const calculateCost = (
  model: string,
  inputTokens: number,
  outputTokens: number
): { cost: number; matched: boolean } => {
  const modelName = model.toLowerCase()
  let pricing = pricingCache[modelName]
  
  // 尝试不带 provider 前缀
  if (!pricing) {
    const simpleName = modelName.split('/').pop() || modelName
    pricing = pricingCache[simpleName]
  }
  
  // 模糊匹配
  if (!pricing) {
    for (const [key, price] of Object.entries(pricingCache)) {
      if (modelName.includes(key) || key.includes(modelName.split('/').pop() || '')) {
        pricing = price
        break
      }
    }
  }
  
  if (!pricing) {
    console.warn(`[Pricing] No price found for model: ${model}, cache size:`, Object.keys(pricingCache).length)
    return { cost: 0, matched: false }
  }
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  const totalCost = inputCost + outputCost
  
  console.log(`[Pricing] ${model}: ${inputTokens} in @ $${pricing.input}/1M = $${inputCost.toFixed(6)}, ${outputTokens} out @ $${pricing.output}/1M = $${outputCost.toFixed(6)}, TOTAL = $${totalCost.toFixed(6)}`)
  
  return { cost: totalCost, matched: true }
}

// 格式化价格
export const formatCost = (cost: number): string => {
  if (cost === 0) return '价格未匹配'
  if (cost < 0.0001) return `$${cost.toFixed(6)}`
  if (cost < 0.01) return `$${cost.toFixed(5)}`
  if (cost < 0.1) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

// 获取加载状态
export const getPricingStatus = (): { loaded: boolean; loading: boolean } => ({
  loaded: pricingLoaded,
  loading: pricingLoading
})
