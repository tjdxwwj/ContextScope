
import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence } from 'motion/react'
import { Activity, ChevronRight, Copy, Loader2, Maximize2, Minimize2 } from 'lucide-react'
import { fetchContext, type ContextResponse } from '../data/apiClient'
import { useI18n } from '../i18n'

interface ContextTreemapProps {
  runId: string
}

interface TreemapNode {
  name: string
  key: string
  value: number
  color: string
  percentage: number
  children?: TreemapNode[]
}

const COLORS = {
  systemPrompt: '#8b5cf6', // Violet
  currentUserPrompt: '#f59e0b', // Amber
  historyUser: '#2563eb',
  historyAssistant: '#3b82f6',
  historyTool: '#10b981',
  historySystem: '#7c3aed',
  historyOther: '#64748b',
  userPrompt: '#f59e0b',
  history: '#3b82f6',
  toolResponses: '#10b981',
}

const LABELS: Record<string, string> = {
  systemPrompt: 'System Prompt',
  currentUserPrompt: 'Current User Prompt',
  historyUser: 'History User Messages',
  historyAssistant: 'History Assistant Messages',
  historyTool: 'History Tool Messages',
  historySystem: 'History System Messages',
  historyOther: 'History Other Messages',
  userPrompt: 'User Prompt',
  history: 'History',
  toolResponses: 'Tool Responses',
}

function colorForKey(key: string, index: number): string {
  const preset = (COLORS as Record<string, string>)[key]
  if (preset) return preset
  const fallback = ['#0ea5e9', '#14b8a6', '#f97316', '#22c55e', '#eab308', '#ec4899']
  return fallback[index % fallback.length]
}

function CodeBlock({ content, label }: { content: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isLongContent = content.length > 500 || content.split('\n').length > 15

  return (
    <div className="relative rounded-lg border border-slate-200 bg-slate-50 overflow-hidden group">
      {label && (
        <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-xs font-medium text-slate-500 flex justify-between items-center">
          <span>{label}</span>
          <div className="flex items-center gap-2">
            {isLongContent && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="hover:text-blue-600 transition-colors p-1 rounded hover:bg-slate-200"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="hover:text-blue-600 transition-colors p-1 rounded hover:bg-slate-200"
              title="Copy content"
            >
              {copied ? <span className="text-emerald-600 font-bold text-[10px]">Copied!</span> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}
      <motion.div
        animate={{ height: isExpanded ? 'auto' : 'auto' }}
        className="relative"
      >
        <pre 
          className={`p-3 overflow-x-auto text-xs font-mono text-slate-700 whitespace-pre-wrap transition-all duration-300 ${
            !isExpanded && isLongContent ? 'max-h-[300px] mask-bottom' : ''
          }`}
          style={{
            maskImage: !isExpanded && isLongContent ? 'linear-gradient(to bottom, black 80%, transparent 100%)' : 'none',
            WebkitMaskImage: !isExpanded && isLongContent ? 'linear-gradient(to bottom, black 80%, transparent 100%)' : 'none'
          }}
        >
          {content}
        </pre>
        {!isExpanded && isLongContent && (
          <div className="absolute bottom-0 left-0 right-0 h-12 flex items-end justify-center pb-2 bg-gradient-to-t from-slate-50 to-transparent">
            <button
              onClick={() => setIsExpanded(true)}
              className="px-3 py-1 bg-white border border-slate-200 shadow-sm rounded-full text-[10px] font-medium text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center gap-1"
            >
              <Maximize2 className="w-3 h-3" />
              Show all
            </button>
          </div>
        )}
      </motion.div>
    </div>
  )
}

function HistoryList({ messages }: { messages: any[] }) {
  return (
    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
      {messages.map((msg, idx) => (
        <motion.div 
          key={idx} 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, duration: 0.3 }}
          className="flex flex-col gap-1"
        >
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
              msg.role === 'user' ? 'bg-amber-50 text-amber-700 border-amber-100' :
              msg.role === 'assistant' ? 'bg-blue-50 text-blue-700 border-blue-100' :
              msg.role === 'system' ? 'bg-violet-50 text-violet-700 border-violet-100' :
              msg.role === 'tool' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
              'bg-slate-50 text-slate-700 border-slate-100'
            }`}>
              {msg.role}
            </span>
            {msg.tool_call_id && (
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {msg.tool_call_id}
              </span>
            )}
          </div>
          <CodeBlock 
            content={typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)} 
          />
        </motion.div>
      ))}
    </div>
  )
}

export function ContextDistribution({ runId }: ContextTreemapProps) {
  const { t } = useI18n()
  const [data, setData] = useState<ContextResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)
  const requestSeqRef = useRef(0)

  useEffect(() => {
    const requestSeq = ++requestSeqRef.current
    const controller = new AbortController()
    let debounceTimer: number | null = null
    setSelectedSection(null)
    console.log('[ContextDistribution]', 'effect start', {
      runId,
      requestSeq,
      latestRequestSeq: requestSeqRef.current,
    })

    async function load() {
      if (!runId) {
        console.log('[ContextDistribution]', 'skip load because runId empty', {
          requestSeq,
        })
        setData(null)
        setLoadError(null)
        setLoading(false)
        return
      }
      console.log('[ContextDistribution]', 'load start', {
        runId,
        requestSeq,
      })
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetchContext(runId, { signal: controller.signal, timeoutMs: 45000 })
        if (requestSeq !== requestSeqRef.current) {
          console.warn('[ContextDistribution]', 'ignore stale result by requestSeq mismatch', {
            runId,
            requestSeq,
            latestRequestSeq: requestSeqRef.current,
          })
          return
        }
        if (res) {
          console.log('[ContextDistribution]', 'load success', {
            runId,
            requestSeq,
            tokenTotal: res.tokenDistribution?.total ?? null,
          })
          setData(res)
          setLoadError(null)
        } else {
          console.warn('[ContextDistribution]', 'load got empty result', {
            runId,
            requestSeq,
          })
          setData(null)
          setLoadError(t('context.errorNoData'))
        }
      } catch (e) {
        if (requestSeq !== requestSeqRef.current) {
          console.warn('[ContextDistribution]', 'ignore stale error by requestSeq mismatch', {
            runId,
            requestSeq,
            latestRequestSeq: requestSeqRef.current,
            error: e,
          })
          return
        }
        if (e instanceof DOMException && e.name === 'AbortError') {
          console.log('[ContextDistribution]', 'load aborted', {
            runId,
            requestSeq,
          })
          return
        }
        console.error('[ContextDistribution] load failed', {
          runId,
          requestSeq,
          error: e,
        })
        setData(null)
        setLoadError(t('context.errorLoadFailed'))
      } finally {
        if (requestSeq === requestSeqRef.current) {
          setLoading(false)
          console.log('[ContextDistribution]', 'load finish', {
            runId,
            requestSeq,
          })
        }
      }
    }

    debounceTimer = window.setTimeout(() => {
      console.log('[ContextDistribution]', 'debounce trigger load', {
        runId,
        requestSeq,
      })
      void load()
    }, 120)
    return () => {
      if (debounceTimer != null) window.clearTimeout(debounceTimer)
      console.log('[ContextDistribution]', 'effect cleanup and abort', {
        runId,
        requestSeq,
      })
      controller.abort()
    }
  }, [runId, retryVersion])

  const treemapData = useMemo((): TreemapNode | null => {
    if (!data?.tokenDistribution?.breakdown) return null
    
    const { breakdown, percentages } = data.tokenDistribution
    const children: TreemapNode[] = []
    Object.entries(breakdown)
      .filter(([, value]) => Number(value) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .forEach(([key, value], index) => {
        children.push({
          name: LABELS[key] || key,
          key,
          value: Number(value),
          color: colorForKey(key, index),
          percentage: Number(percentages[key] ?? 0),
        })
      })

    if (children.length === 0) return null

    return {
      name: 'root',
      key: 'systemPrompt', // dummy
      value: data.tokenDistribution.total,
      color: '#fff',
      percentage: 100,
      children
    }
  }, [data])

  useEffect(() => {
    if (!treemapData || !svgRef.current) return

    const width = svgRef.current.clientWidth || 600
    const height = 160 // 固定高度
    const svg = d3.select(svgRef.current)
    // svg.selectAll('*').remove() // 移除旧的暴力清空方式

    const root = d3.hierarchy(treemapData)
      .sum(d => d.value)
      .sort((a, b) => b.value! - a.value!)

    d3.treemap<TreemapNode>()
      .size([width, height])
      .padding(2)
      .round(true)(root)

    const t = svg.transition().duration(500).ease(d3.easeCubicOut) as any

    // Join data for Groups
    const nodes = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<TreemapNode>>('g.node-group')
      .data(root.leaves() as d3.HierarchyRectangularNode<TreemapNode>[], d => (d.data as TreemapNode).key)

    // EXIT
    nodes.exit()
      .transition(t)
      .style('opacity', 0)
      .remove()

    // ENTER
    const nodesEnter = nodes.enter()
      .append('g')
      .attr('class', 'node-group')
      .attr('transform', d => `translate(${d.x0},${d.y0})`)
      .style('opacity', 0)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        setSelectedSection(d.data.key === selectedSection ? null : d.data.key)
      })

    nodesEnter.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => d.data.color)
      .attr('rx', 4)
      .attr('stroke', '#fff')
      .attr('stroke-width', 0)

    nodesEnter.append('text')
      .attr('class', 'node-name')
      .attr('x', 6)
      .attr('y', 16)
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('fill', 'white')
      .style('pointer-events', 'none')

    nodesEnter.append('text')
      .attr('class', 'node-value')
      .attr('x', 6)
      .attr('y', 28)
      .attr('font-size', '9px')
      .attr('fill', 'rgba(255,255,255,0.9)')
      .style('pointer-events', 'none')

    nodesEnter.append('title')

    // MERGE (Enter + Update)
    const nodesMerge = nodesEnter.merge(nodes)
    
    nodesMerge.transition(t)
      .attr('transform', d => `translate(${d.x0},${d.y0})`)
      .style('opacity', 1)

    nodesMerge.select('rect')
      .transition(t)
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => d.data.color)
      // 处理选中状态
      .attr('stroke', d => d.data.key === selectedSection ? '#fff' : 'none')
      .attr('stroke-width', d => d.data.key === selectedSection ? 3 : 0)
      .style('filter', d => d.data.key === selectedSection ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))' : 'none')

    nodesMerge.select('text.node-name')
      .text(d => d.x1 - d.x0 > 50 && d.y1 - d.y0 > 20 ? d.data.name : '')
      
    nodesMerge.select('text.node-value')
      .text(d => d.x1 - d.x0 > 50 && d.y1 - d.y0 > 35 ? `${d.data.value} (${d.data.percentage}%)` : '')

    nodesMerge.select('title')
      .text(d => `${d.data.name}\n${d.data.value} tokens\n${d.data.percentage}%`)

  }, [treemapData, selectedSection])

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin mr-2" />
        <div className="text-xs text-slate-400">Loading context...</div>
      </div>
    )
  }

  if (!treemapData || !data) {
    if (!loadError) return null
    return (
      <div className="h-40 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="text-xs text-slate-500">{loadError}</div>
        <button
          type="button"
          onClick={() => setRetryVersion((prev) => prev + 1)}
          className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          {t('context.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-500" />
          {t('context.distributionTitle')} ({data.tokenDistribution.total} {t('context.totalTokens')})
        </h3>
        <div className="w-full overflow-hidden rounded-xl bg-slate-50">
          <svg ref={svgRef} className="w-full h-40 block" />
        </div>
        <div className="flex flex-wrap gap-4 mt-4">
          {treemapData.children?.map(child => (
            <button
              key={child.key}
              onClick={() => setSelectedSection(selectedSection === child.key ? null : child.key)}
              className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-all duration-200 ${
                selectedSection === child.key 
                  ? 'bg-slate-100 ring-1 ring-slate-200 shadow-sm scale-105' 
                  : 'hover:bg-slate-50 hover:scale-105 active:scale-95'
              }`}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: child.color }} />
              <span className="text-xs text-slate-600 font-medium">
                {child.name} <span className="text-slate-400 font-normal">({child.percentage}%)</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Detail View */}
      <AnimatePresence mode="wait">
        {selectedSection && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                  {LABELS[selectedSection]}
                </h4>
                <button 
                  onClick={() => setSelectedSection(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 hover:bg-slate-100 rounded transition-colors"
                >
                  Close
                </button>
              </div>
              
              <div className="bg-slate-50/50 rounded-xl p-1">
                {selectedSection === 'systemPrompt' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <CodeBlock content={data.context.systemPrompt || '(Empty System Prompt)'} />
                  </motion.div>
                )}
                
                {(selectedSection === 'currentUserPrompt' || selectedSection === 'userPrompt') && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <CodeBlock content={data.context.userPrompt || '(Empty User Prompt)'} />
                  </motion.div>
                )}
                
                {selectedSection === 'history' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <HistoryList messages={data.context.history || []} />
                  </motion.div>
                )}

                {(selectedSection === 'toolResponses' || selectedSection === 'historyTool') && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <p className="text-xs text-slate-500 px-2">
                      Showing tool messages from history.
                    </p>
                    <HistoryList messages={(data.context.history || []).filter((m: any) => m.role === 'tool')} />
                  </motion.div>
                )}

                {selectedSection === 'historyUser' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <HistoryList messages={(data.context.history || []).filter((m: any) => m.role === 'user')} />
                  </motion.div>
                )}

                {selectedSection === 'historyAssistant' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <HistoryList messages={(data.context.history || []).filter((m: any) => m.role === 'assistant')} />
                  </motion.div>
                )}

                {selectedSection === 'historySystem' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <HistoryList messages={(data.context.history || []).filter((m: any) => m.role === 'system')} />
                  </motion.div>
                )}

                {selectedSection === 'historyOther' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <HistoryList
                      messages={(data.context.history || []).filter((m: any) => {
                        const role = typeof m?.role === 'string' ? m.role : 'other'
                        return !['user', 'assistant', 'system', 'tool', 'toolResult'].includes(role)
                      })}
                    />
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
