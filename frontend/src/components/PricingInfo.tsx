import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Info, DollarSign, Calculator, TrendingUp, X } from 'lucide-react'

interface PricingRule {
  provider: string
  models: string[]
  inputPrice: string
  outputPrice: string
  note?: string
}

const pricingRules: PricingRule[] = [
  {
    provider: 'OpenAI',
    models: ['GPT-4', 'GPT-4 Turbo', 'GPT-3.5-Turbo', 'GPT-4o', 'GPT-4o-mini'],
    inputPrice: '$0.15 - $30 / 1M tokens',
    outputPrice: '$0.6 - $60 / 1M tokens',
    note: 'GPT-4o-mini 最经济，GPT-4 最贵'
  },
  {
    provider: 'Anthropic',
    models: ['Claude 3 Opus', 'Claude 3 Sonnet', 'Claude 3 Haiku', 'Claude 3.5 Sonnet'],
    inputPrice: '$0.25 - $15 / 1M tokens',
    outputPrice: '$1.25 - $75 / 1M tokens',
    note: 'Opus 性能最强，Haiku 速度最快'
  },
  {
    provider: 'Qwen (阿里)',
    models: ['Qwen', 'Qwen-Plus', 'Qwen-Max', 'Qwen-Turbo', 'Qwen-VL', 'Qwen-Coder'],
    inputPrice: '$0.14 - $1.5 / 1M tokens',
    outputPrice: '$0.36 - $4.5 / 1M tokens',
    note: 'Qwen3.5-Plus 按 Qwen-Plus 计价'
  },
  {
    provider: 'Google',
    models: ['Gemini Pro', 'Gemini 2.0 Flash'],
    inputPrice: '$0.1 - $0.25 / 1M tokens',
    outputPrice: '$0.4 - $0.5 / 1M tokens',
    note: 'Flash 版本性价比最高'
  },
  {
    provider: 'Meta',
    models: ['Llama 3 70B', 'Llama 3 8B'],
    inputPrice: '$0.05 - $0.8 / 1M tokens',
    outputPrice: '$0.05 - $0.8 / 1M tokens',
    note: '开源模型，价格透明'
  },
  {
    provider: 'DeepSeek',
    models: ['DeepSeek Chat', 'DeepSeek Coder'],
    inputPrice: '$0.27 / 1M tokens',
    outputPrice: '$1.1 / 1M tokens',
    note: '代码能力优秀'
  }
]

export function PricingInfo() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 z-40 group"
        title="查看价格计算规则"
      >
        <Info className="w-5 h-5" />
        <span className="absolute right-full mr-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          价格计算规则
        </span>
      </button>

      {/* 弹窗 */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              onClick={() => setIsOpen(false)}
            />
            
            {/* 内容面板 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-4 md:inset-10 lg:inset-20 bg-white rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col"
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-emerald-50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Calculator className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">价格计算规则</h2>
                    <p className="text-xs text-slate-500">了解如何计算每次 API 调用的成本</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* 内容区域 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* 计算公式 */}
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-5 border border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Calculator className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-bold text-blue-900">计算公式</h3>
                  </div>
                  <div className="bg-white/80 rounded-lg p-4 font-mono text-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600">总花费 =</span>
                      <span className="text-blue-600">(Input Tokens ÷ 1,000,000 × Input Price)</span>
                      <span className="text-slate-400">+</span>
                      <span className="text-emerald-600">(Output Tokens ÷ 1,000,000 × Output Price)</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-xs text-blue-700">
                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <p>价格基于 OpenRouter 官方定价，所有价格均为每 100 万 tokens 的美元价格</p>
                  </div>
                </div>

                {/* 示例计算 */}
                <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 rounded-xl p-5 border border-emerald-200">
                  <div className="flex items-center gap-2 mb-3">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-emerald-900">计算示例</h3>
                  </div>
                  <div className="bg-white/80 rounded-lg p-4 space-y-2 text-sm">
                    <p className="text-slate-600">假设使用 <span className="font-semibold text-slate-800">Qwen-Plus</span>：</p>
                    <ul className="space-y-1 text-slate-600 ml-4">
                      <li>• Input Price: <span className="font-mono text-blue-600">$0.4 / 1M tokens</span></li>
                      <li>• Output Price: <span className="font-mono text-emerald-600">$1.2 / 1M tokens</span></li>
                    </ul>
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-slate-600">如果 Input 1,000 tokens，Output 500 tokens：</p>
                      <div className="mt-2 bg-slate-100 rounded p-3 font-mono text-xs space-y-1">
                        <div>Input 成本 = 1,000 ÷ 1,000,000 × $0.4 = <span className="text-blue-600">$0.0004</span></div>
                        <div>Output 成本 = 500 ÷ 1,000,000 × $1.2 = <span className="text-emerald-600">$0.0006</span></div>
                        <div className="pt-2 border-t border-slate-300 font-bold">
                          总成本 = $0.0004 + $0.0006 = <span className="text-emerald-600">$0.0010</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 各提供商价格表 */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-slate-600" />
                    <h3 className="text-sm font-bold text-slate-800">各模型提供商价格</h3>
                  </div>
                  <div className="grid gap-3">
                    {pricingRules.map((rule) => (
                      <div
                        key={rule.provider}
                        className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-bold text-slate-800">{rule.provider}</h4>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500 w-16">代表模型</span>
                            <span className="text-slate-700">{rule.models.join(', ')}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500 w-16">Input</span>
                            <span className="font-mono text-blue-600">{rule.inputPrice}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500 w-16">Output</span>
                            <span className="font-mono text-emerald-600">{rule.outputPrice}</span>
                          </div>
                          {rule.note && (
                            <div className="flex items-start gap-2 text-xs mt-2 pt-2 border-t border-slate-100">
                              <Info className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                              <span className="text-slate-500">{rule.note}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 注意事项 */}
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-amber-900">注意事项</h4>
                      <ul className="text-xs text-amber-800 space-y-1 ml-4 list-disc">
                        <li>价格数据来源于 OpenRouter 官方定价</li>
                        <li>实际价格可能因提供商调整而变化</li>
                        <li>部分模型可能未包含在价格表中，会显示"未匹配"</li>
                        <li>如遇到价格未匹配的情况，可以手动添加对应价格</li>
                        <li>所有价格均为估算值，仅供参考</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* 底部 */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  最后更新：2026-03-14
                </p>
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  知道了
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
