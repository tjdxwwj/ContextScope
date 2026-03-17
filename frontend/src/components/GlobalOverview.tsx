import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Clock, Layers, Maximize2, Minimize2, MousePointer2, Search, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import * as d3 from 'd3'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { calculateCost, formatCost } from '../utils/pricing'
import { type RunTreeNode } from '../data/runTree'
import { useI18n } from '../i18n'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface TimelineEvent {
  id: string
  type: 'run' | 'tool' | 'input' | 'output'
  startTime: number
  endTime: number
  label: string
  level: number
  data:
    | RunTreeNode
    | { toolName: string; timestamp: number; durationMs?: number }
    | { inputTokens: number; outputTokens: number; model?: string }
}

interface GlobalOverviewProps {
  runs: RunTreeNode[]
  onLocate: (id: string) => void
}

export function GlobalOverview({ runs, onLocate }: GlobalOverviewProps) {
  const { t, lang } = useI18n()
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  
  const formatTimeLocalized = (ts: number) =>
    new Date(ts).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })

  const allEvents = useMemo(() => {
    const events: TimelineEvent[] = []
    const processNode = (node: RunTreeNode, level: number) => {
      events.push({
        id: node.runId,
        type: 'run',
        startTime: node.startTime,
        endTime: node.endTime,
        label: node.runId.substring(0, 8),
        level,
        data: node,
      })

      if (node.usage.input > 0) {
        events.push({
          id: `${node.runId}-input`,
          type: 'input',
          startTime: node.startTime,
          endTime: node.startTime + 1000,
          label: `IN ${node.usage.input.toLocaleString()}`,
          level: level + 0.5,
          data: { inputTokens: node.usage.input, outputTokens: 0, model: node.model },
        })
      }

      if (node.usage.output > 0) {
        events.push({
          id: `${node.runId}-output`,
          type: 'output',
          startTime: node.endTime - 1000,
          endTime: node.endTime,
          label: `OUT ${node.usage.output.toLocaleString()}`,
          level: level + 0.5,
          data: { inputTokens: 0, outputTokens: node.usage.output, model: node.model },
        })
      }

      node.toolCalls.forEach((tool) => {
        events.push({
          id: tool.toolCallId ?? `${tool.timestamp}`,
          type: 'tool',
          startTime: tool.timestamp,
          endTime: tool.timestamp + (tool.durationMs ?? 0),
          label: tool.toolName,
          level: level + 1,
          data: tool,
        })
      })

      node.children.forEach((child) => processNode(child, level + 1))
    }
    runs.forEach((run) => processNode(run, 0))
    const sorted = [...events].sort((a, b) => a.startTime - b.startTime)
    const lanes: number[] = []
    sorted.forEach((event) => {
      let lane = 0
      while (lanes[lane] > event.startTime) lane++
      ;(event as TimelineEvent & { level: number }).level = lane
      lanes[lane] = event.endTime
    })
    return sorted
  }, [runs])

  useEffect(() => {
    if (!svgRef.current) return
    const width = svgRef.current.clientWidth || 1000
    const height = 400
    const margin = { top: 40, right: 40, bottom: 60, left: 60 }
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom
    const minTime = d3.min(allEvents, (d) => d.startTime) ?? 0
    const maxTime = d3.max(allEvents, (d) => d.endTime) ?? Date.now()
    const timePadding = (maxTime - minTime) * 0.05
    const x = d3
      .scaleTime()
      .domain([minTime - timePadding, maxTime + timePadding])
      .range([0, chartWidth])
    const maxLevel =
      d3.max(allEvents, (d) => (d as TimelineEvent & { level: number }).level) ?? 0
    const y = d3
      .scaleLinear()
      .domain([0, maxLevel + 1])
      .range([0, chartHeight])

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 20])
      .translateExtent([
        [0, 0],
        [chartWidth, chartHeight],
      ])
      .on('zoom', zoomed)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    svg
      .append('defs')
      .append('clipPath')
      .attr('id', 'clip-overview')
      .append('rect')
      .attr('width', chartWidth)
      .attr('height', chartHeight)

    const mainGroup = g.append('g').attr('clip-path', 'url(#clip-overview)')
    const xAxisG = g
      .append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .attr('class', 'x-axis text-slate-400')
    const xAxis = d3
      .axisBottom(x)
      .ticks(10)
      .tickFormat(d3.timeFormat('%H:%M:%S') as (d: Date | d3.NumberValue) => string)
    xAxisG.call(xAxis)

    const gridG = mainGroup.append('g').attr('class', 'grid text-slate-100')
    const drawGrid = (scale: d3.ScaleTime<number, number>) => {
      gridG.selectAll('line').remove()
      gridG
        .selectAll('line')
        .data(scale.ticks(10))
        .enter()
        .append('line')
        .attr('x1', (d) => scale(d as Date))
        .attr('x2', (d) => scale(d as Date))
        .attr('y1', 0)
        .attr('y2', chartHeight)
        .attr('stroke', 'currentColor')
        .attr('stroke-width', 1)
    }
    drawGrid(x)

    const bars = mainGroup
      .selectAll('.event-bar')
      .data(allEvents)
      .enter()
      .append('g')
      .attr('class', 'event-bar cursor-pointer')
      .on('click', (_event, d) => {
        setSelectedEvent(d as TimelineEvent)
      })

    bars
      .append('rect')
      .attr('x', (d) => x(d.startTime))
      .attr('y', (d) => y((d as TimelineEvent & { level: number }).level) * 30 + 10)
      .attr('width', (d) => Math.max(2, x(d.endTime) - x(d.startTime)))
      .attr('height', 24)
      .attr('rx', 6)
      .attr('fill', (d) => {
        if (d.type === 'run') return '#3b82f6'
        if (d.type === 'input') return '#10b981'
        if (d.type === 'output') return '#f59e0b'
        return '#8b5cf6'
      })
      .attr('opacity', 0.8)
      .attr('class', 'transition-opacity')
    bars
      .append('text')
      .attr('x', (d) => x(d.startTime) + 5)
      .attr('y', (d) => y((d as TimelineEvent & { level: number }).level) * 30 + 26)
      .attr('class', 'text-[9px] font-bold fill-white pointer-events-none mono')
      .text((d) => {
        const tokens = d.type === 'run' ? ` (Σ ${(d.data as RunTreeNode).usage.total.toLocaleString()})` : ''
        return `${d.label}${tokens}`
      })

    svg.call(zoom as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void)

    function zoomed(event: d3.D3ZoomEvent<SVGSVGElement, unknown>) {
      const newX = event.transform.rescaleX(x)
      xAxisG.call(xAxis.scale(newX))
      drawGrid(newX)
      bars
        .selectAll('rect')
        .attr('x', (d) => newX((d as TimelineEvent).startTime))
        .attr('width', (d) =>
          Math.max(
            2,
            newX((d as TimelineEvent).endTime) - newX((d as TimelineEvent).startTime)
          )
        )
      bars
        .selectAll('text')
        .attr('x', (d) => newX((d as TimelineEvent).startTime) + 5)
    }
  }, [allEvents])

  const totalTokens = allEvents
    .filter((e) => e.type === 'run')
    .reduce((acc, e) => acc + (e.data as RunTreeNode).usage.total, 0)
  const totalCalls = allEvents.filter((e) => e.type === 'tool').length
  const executionSpan = useMemo(() => {
    const start = d3.min(allEvents, (e) => e.startTime) ?? 0
    const end = d3.max(allEvents, (e) => e.endTime) ?? 0
    return Math.floor((end - start) / 1000)
  }, [allEvents])
  const maxLevel = useMemo(
    () => d3.max(allEvents, (e) => (e as TimelineEvent & { level: number }).level) ?? 0,
    [allEvents]
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{t('timeline.globalTitle')}</h2>
          <p className="text-sm text-slate-500">{t('timeline.subtitle')}</p>
        </div>
        {(() => {
          const totalInputTokens = runs.reduce((sum, r) => sum + r.usage.input, 0)
          const totalOutputTokens = runs.reduce((sum, r) => sum + r.usage.output, 0)
          const totalInputResult = runs.reduce(
            (acc, r) => {
              const result = calculateCost(r.model || '', r.usage.input, 0)
              return {
                cost: acc.cost + result.cost,
                matched: acc.matched || result.matched,
              }
            },
            { cost: 0, matched: false }
          )
          const totalOutputResult = runs.reduce(
            (acc, r) => {
              const result = calculateCost(r.model || '', 0, r.usage.output)
              return {
                cost: acc.cost + result.cost,
                matched: acc.matched || result.matched,
              }
            },
            { cost: 0, matched: false }
          )
          const totalResult = runs.reduce(
            (acc, r) => {
              const result = calculateCost(r.model || '', r.usage.input, r.usage.output)
              return {
                cost: acc.cost + result.cost,
                matched: acc.matched || result.matched,
              }
            },
            { cost: 0, matched: false }
          )

          const allMatched = runs.every(
            (r) => calculateCost(r.model || '', r.usage.input, r.usage.output).matched
          )

          return (
            <div className="flex gap-4">
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Input</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold text-blue-600 mono">
                    {totalInputTokens.toLocaleString()}
                  </p>
                  <p
                    className={cn(
                      'text-[10px] font-bold mono',
                      allMatched ? 'text-emerald-600' : 'text-slate-400 italic'
                    )}
                  >
                    {allMatched ? formatCost(totalInputResult.cost) : t('timeline.partialMatch')}
                  </p>
                </div>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Output</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold text-emerald-600 mono">
                    {totalOutputTokens.toLocaleString()}
                  </p>
                  <p
                    className={cn(
                      'text-[10px] font-bold mono',
                      allMatched ? 'text-emerald-600' : 'text-slate-400 italic'
                    )}
                  >
                    {allMatched ? formatCost(totalOutputResult.cost) : t('timeline.partialMatch')}
                  </p>
                </div>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold text-slate-900 mono">
                    {totalTokens.toLocaleString()}
                  </p>
                  <p
                    className={cn(
                      'text-[10px] font-bold mono',
                      allMatched ? 'text-emerald-600' : 'text-slate-400 italic'
                    )}
                  >
                    {allMatched ? formatCost(totalResult.cost) : t('timeline.partialMatch')}
                  </p>
                </div>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase">{t('timeline.toolCalls')}</p>
                <p className="text-lg font-bold text-amber-600 mono">
                  {totalCalls.toLocaleString()}
                </p>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            {t('timeline.visualization')}
          </h3>
          <div className="flex gap-3 text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <MousePointer2 className="w-3 h-3" />
              <span>{t('timeline.clickHint')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Maximize2 className="w-3 h-3" />
              <span>{t('timeline.zoomHint')}</span>
            </div>
          </div>
        </div>
        <div className="bg-slate-50/50 rounded-xl border border-slate-100 overflow-hidden">
          <svg ref={svgRef} className="w-full h-[400px]" />
        </div>

        <AnimatePresence>
          {selectedEvent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 w-80 bg-white border border-slate-200 shadow-2xl rounded-2xl p-5 z-50"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      selectedEvent.type === 'run'
                        ? 'bg-blue-500'
                        : selectedEvent.type === 'input'
                          ? 'bg-emerald-500'
                          : selectedEvent.type === 'output'
                            ? 'bg-amber-500'
                            : 'bg-purple-500'
                    )}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {selectedEvent.type === 'input'
                      ? 'Input'
                      : selectedEvent.type === 'output'
                        ? 'Output'
                        : selectedEvent.type}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="p-1 hover:bg-slate-100 rounded-md"
                >
                  <Minimize2 className="w-3 h-3 text-slate-400" />
                </button>
              </div>
              <h4 className="mono text-sm font-bold text-slate-800 mb-4 truncate">
                {selectedEvent.type === 'run'
                  ? (selectedEvent.data as RunTreeNode).runId
                  : selectedEvent.type === 'input'
                    ? `Input: ${(selectedEvent.data as any).inputTokens?.toLocaleString()} tokens`
                    : selectedEvent.type === 'output'
                      ? `Output: ${(selectedEvent.data as any).outputTokens?.toLocaleString()} tokens`
                      : (selectedEvent.data as { toolName: string }).toolName}
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{t('timeline.startTime')}</span>
                  <span className="mono font-medium">{formatTimeLocalized(selectedEvent.startTime)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{t('timeline.duration')}</span>
                  <span className="mono font-medium">
                    {Math.floor(selectedEvent.endTime - selectedEvent.startTime)}ms
                  </span>
                </div>
                {selectedEvent.type === 'run' && (
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500">{t('timeline.tokenUsage')}</span>
                      <span className="mono font-bold text-blue-600">
                        {(selectedEvent.data as RunTreeNode).usage.total.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{t('timeline.model')}</span>
                      <span className="text-slate-700 font-medium">
                        {(selectedEvent.data as RunTreeNode).model ?? '-'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  className="flex-1 py-2 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  onClick={() => {
                    if (selectedEvent.type === 'run') onLocate(selectedEvent.id)
                    setSelectedEvent(null)
                  }}
                >
                  <Search className="w-3 h-3" />
                  {t('timeline.locateNode')}
                </button>
                <button
                  type="button"
                  className="flex-1 py-2 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-slate-200 transition-colors"
                  onClick={() => setSelectedEvent(null)}
                >
                  {t('timeline.close')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-500">
              <Activity className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">执行效率</h4>
          </div>
          <p className="text-2xl font-bold text-slate-900 mono">{executionSpan}s</p>
          <p className="text-xs text-slate-400 mt-1">总执行跨度</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-500">
              <Zap className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">资源密度</h4>
          </div>
          <p className="text-2xl font-bold text-slate-900 mono">
            {Math.floor(totalTokens / (totalCalls || 1))}
          </p>
          <p className="text-xs text-slate-400 mt-1">Avg. Tokens / Call</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-50 rounded-lg text-purple-500">
              <Layers className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">分支深度</h4>
          </div>
          <p className="text-2xl font-bold text-slate-900 mono">{maxLevel}</p>
          <p className="text-xs text-slate-400 mt-1">最大递归层级</p>
        </div>
      </div>
    </div>
  )
}
