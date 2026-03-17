import { useEffect, useMemo, useRef, useState } from 'react'
import { Database } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import * as d3 from 'd3'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { RunTreeNode } from '../data/runTree'
import { calculateCost, formatCost } from '../utils/pricing'
import { useI18n } from '../i18n'

interface TreemapDatum {
  name: string
  value?: number
  selfValue?: number
  input?: number
  output?: number
  model?: string
  id?: string
  children?: TreemapDatum[]
}

export const TokenTreemap = ({ runs }: { runs: RunTreeNode[] }) => {
  const { t, lang } = useI18n()
  const svgRef = useRef<SVGSVGElement>(null)
  const [drillRootId, setDrillRootId] = useState<string | null>(null)
  
  const timeFormat = lang === 'zh' ? 'zh-CN' : 'en-US'
  const [hovered, setHovered] = useState<{
    name: string
    value: number
    selfValue?: number
    input: number
    output: number
    model?: string
    id: string
  } | null>(null)

  const fullData = useMemo((): TreemapDatum => {
    const transform = (node: RunTreeNode): TreemapDatum => {
      const children = node.children.length > 0 ? node.children.map(transform) : []
      const childrenTotal = children.reduce((s, c) => s + (c.value ?? 0), 0)
      const selfTotal = node.usage.total
      const subtreeTotal = selfTotal + childrenTotal

      const modelName = node.model ? node.model.split('/').pop() ?? node.model : 'Unknown'
      const timeText = new Date(node.startTime).toLocaleTimeString(timeFormat, {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      })

      return {
        name: `${modelName} · ${timeText}`,
        value: subtreeTotal,
        selfValue: selfTotal,
        input: node.usage.input,
        output: node.usage.output,
        model: node.model,
        id: node.runId,
        children: children.length > 0 ? children : undefined,
      }
    }
    return { name: 'root', children: runs.map(transform) }
  }, [runs])

  const data = useMemo((): TreemapDatum => {
    if (!drillRootId) return fullData
    function findById(d: TreemapDatum): TreemapDatum | null {
      if (d.id === drillRootId) return d
      for (const c of d.children ?? []) {
        const found = findById(c)
        if (found) return found
      }
      return null
    }
    const node = findById(fullData)
    return node ?? fullData
  }, [fullData, drillRootId])

  const rootTotal = useMemo(
    () => (fullData.children ?? []).reduce((s, c) => s + (c.value ?? 0), 0),
    [fullData]
  )
  const runCount = runs.length

  useEffect(() => {
    if (!svgRef.current) return
    const width = svgRef.current.clientWidth || 800
    const height = 560
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const root = d3
      .hierarchy(data)
      .sum((d) => (d.value ?? 0) as number)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

    d3.treemap<TreemapDatum>()
      .size([width, height])
      .paddingOuter(16)
      .paddingTop(28)
      .paddingInner(8)
      .round(true)(root as d3.HierarchyNode<TreemapDatum>)

    const color = d3.scaleOrdinal(d3.schemeTableau10)
    const depthColors = ['#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b']

    const nodes = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<TreemapDatum>>('g')
      .data((root as d3.HierarchyRectangularNode<TreemapDatum>).descendants())
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`)

    nodes
      .append('rect')
      .attr('width', (d) => d.x1 - d.x0)
      .attr('height', (d) => d.y1 - d.y0)
      .attr('fill', (d) =>
        d.children
          ? depthColors[Math.min(d.depth, depthColors.length - 1)]
          : color(d.data.model ?? '')
      )
      .attr('fill-opacity', (d) => (d.children ? 1 : 0.8))
      .attr('stroke', (d) => (d.children ? '#94a3b8' : '#fff'))
      .attr('stroke-width', (d) => (d.children ? 2 : 0.5))
      .attr('rx', 6)
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => {
        if (d.data.id && d.depth >= 0) setDrillRootId(d.data.id)
      })
      .on('mouseenter', (_event, d) => {
        setHovered(
          d.data.value != null
            ? {
                name: d.data.name,
                value: d.data.value,
                selfValue: d.data.selfValue,
                input: d.data.input ?? 0,
                output: d.data.output ?? 0,
                model: d.data.model,
                id: d.data.id ?? '',
              }
            : null
        )
      })
      .on('mouseleave', () => setHovered(null))

    const minLabelW = 44
    const minLabelH = 28
    nodes
      .filter((d) => !!d.children && d.depth > 0 && (d.x1 - d.x0) >= minLabelW && (d.y1 - d.y0) >= minLabelH)
      .append('text')
      .attr('x', 8)
      .attr('y', 18)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#334155')
      .attr('class', 'pointer-events-none')
      .text((d) => d.data.name)

    const leaves = nodes.filter((d) => !d.children)
    leaves
      .append('text')
      .attr('x', 8)
      .attr('y', 16)
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', 'white')
      .attr('class', 'pointer-events-none mono')
      .text((d) =>
        (d.x1 - d.x0) >= minLabelW && (d.y1 - d.y0) >= minLabelH ? d.data.name : ''
      )
    leaves
      .append('text')
      .attr('x', 8)
      .attr('y', 28)
      .attr('font-size', '9px')
      .attr('fill', 'rgba(255,255,255,0.9)')
      .attr('class', 'pointer-events-none mono')
      .text((d) =>
        (d.x1 - d.x0) >= 56 && (d.y1 - d.y0) >= 36
          ? `Σ ${Number(d.data.value ?? 0).toLocaleString()}`
          : ''
      )
  }, [data])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-500" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">{t('treemap.title')}</h3>
            <p className="text-[11px] text-slate-500">
              {t('treemap.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-white/80 border border-slate-200 rounded-full px-3 py-1 shadow-xs">
            <span className="mono font-semibold text-slate-800">
              {rootTotal.toLocaleString()}
            </span>
            <span>total tokens</span>
            <span className="w-px h-3 bg-slate-200" />
            <span>{runCount} runs</span>
          </div>
          {drillRootId && (
            <button
              type="button"
              onClick={() => setDrillRootId(null)}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1 rounded-full transition-colors"
            >
              {t('treemap.reset')}
            </button>
          )}
        </div>
      </div>
      <div className="p-4 min-h-[560px]">
        <svg ref={svgRef} className="w-full min-h-[560px] rounded-xl overflow-hidden" style={{ minHeight: 560 }} />
      </div>
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute right-4 bottom-4 w-64 bg-slate-800/95 backdrop-blur text-white p-4 rounded-xl shadow-2xl border border-white/10 z-50 pointer-events-none text-left"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-[10px] font-bold uppercase text-emerald-400 mb-0.5 tracking-wider">
                  {hovered.model ? hovered.model.split('/').pop() : 'UNKNOWN MODEL'}
                </p>
                <p className="text-sm font-bold text-white leading-tight break-words">{hovered.name}</p>
              </div>
            </div>

            {hovered.id && !hovered.id.startsWith('tool-') && (
              <div className="flex items-center gap-2 mb-3">
                <span className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] font-mono text-slate-300">
                  {hovered.id}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Total Tokens</span>
                <span className="font-bold font-mono text-white">{hovered.value.toLocaleString()}</span>
              </div>
              {rootTotal > 0 && (
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>占当前视图</span>
                  <span className="font-mono text-slate-200">
                    {((hovered.value / rootTotal) * 100).toFixed(1)}%
                  </span>
                </div>
              )}

              <div className="h-1.5 w-full bg-slate-700/50 rounded-full overflow-hidden flex">
                <div
                  className="bg-blue-500 h-full"
                  style={{ width: `${(hovered.input / hovered.value) * 100}%` }}
                />
                <div
                  className="bg-emerald-500 h-full"
                  style={{ width: `${(hovered.output / hovered.value) * 100}%` }}
                />
              </div>

              {(() => {
                const inputResult = calculateCost(hovered.model || '', hovered.input, 0)
                const outputResult = calculateCost(hovered.model || '', 0, hovered.output)
                const totalResult = calculateCost(hovered.model || '', hovered.input, hovered.output)

                return (
                  <>
                    <div className="flex justify-between text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span className="text-slate-400">In</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-slate-300">{hovered.input.toLocaleString()}</span>
                          <span className={cn(
                            'font-mono text-[9px]',
                            inputResult.matched ? 'text-emerald-400' : 'text-slate-500 italic'
                          )}>
                            {inputResult.matched ? formatCost(inputResult.cost) : '未匹配'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-slate-400">Out</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-slate-300">{hovered.output.toLocaleString()}</span>
                          <span className={cn(
                            'font-mono text-[9px]',
                            outputResult.matched ? 'text-emerald-400' : 'text-slate-500 italic'
                          )}>
                            {outputResult.matched ? formatCost(outputResult.cost) : '未匹配'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 mt-2 border-t border-white/10">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400">Total Cost</span>
                        <span className={cn(
                          'font-bold font-mono',
                          totalResult.matched ? 'text-emerald-400' : 'text-slate-500 italic'
                        )}>
                          {totalResult.matched ? formatCost(totalResult.cost) : '未匹配'}
                        </span>
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>

            {hovered.selfValue != null && hovered.selfValue < hovered.value && (
              <div className="mt-3 pt-3 border-t border-white/10 flex justify-between items-center text-[10px]">
                <span className="text-slate-500">Self (exclude children)</span>
                <span className="font-mono text-slate-400">{hovered.selfValue.toLocaleString()}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
