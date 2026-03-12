
import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Activity } from 'lucide-react'
import { fetchContext, type ContextResponse } from '../data/apiClient'

interface ContextTreemapProps {
  runId: string
}

interface TreemapNode {
  name: string
  value: number
  color: string
  percentage: number
  children?: TreemapNode[]
}

const COLORS = {
  systemPrompt: '#8b5cf6', // Violet
  userPrompt: '#f59e0b',   // Amber
  history: '#3b82f6',      // Blue
  toolResponses: '#10b981', // Emerald
}

const LABELS: Record<string, string> = {
  systemPrompt: 'System Prompt',
  userPrompt: 'User Prompt',
  history: 'History',
  toolResponses: 'Tool Responses',
}

export function ContextDistribution({ runId }: ContextTreemapProps) {
  const [data, setData] = useState<ContextResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      if (!runId) return
      setLoading(true)
      try {
        const res = await fetchContext(runId)
        if (mounted) {
          if (res) {
            setData(res)
          } else {
            setData(null)
          }
        }
      } catch (e) {
        // ignore error
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [runId])

  const treemapData = useMemo((): TreemapNode | null => {
    if (!data?.tokenDistribution?.breakdown) return null
    
    const { breakdown, percentages } = data.tokenDistribution
    const children: TreemapNode[] = []

    if (breakdown.systemPrompt > 0) {
      children.push({
        name: LABELS.systemPrompt,
        value: breakdown.systemPrompt,
        color: COLORS.systemPrompt,
        percentage: percentages.systemPrompt
      })
    }
    if (breakdown.history > 0) {
      children.push({
        name: LABELS.history,
        value: breakdown.history,
        color: COLORS.history,
        percentage: percentages.history
      })
    }
    if (breakdown.userPrompt > 0) {
      children.push({
        name: LABELS.userPrompt,
        value: breakdown.userPrompt,
        color: COLORS.userPrompt,
        percentage: percentages.userPrompt
      })
    }
    if (breakdown.toolResponses > 0) {
      children.push({
        name: LABELS.toolResponses,
        value: breakdown.toolResponses,
        color: COLORS.toolResponses,
        percentage: percentages.toolResponses
      })
    }

    if (children.length === 0) return null

    return {
      name: 'root',
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
    svg.selectAll('*').remove()

    const root = d3.hierarchy(treemapData)
      .sum(d => d.value)
      .sort((a, b) => b.value! - a.value!)

    d3.treemap<TreemapNode>()
      .size([width, height])
      .padding(2)
      .round(true)(root)

    const nodes = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<TreemapNode>>('g')
      .data(root.leaves() as d3.HierarchyRectangularNode<TreemapNode>[])
      .join('g')
      .attr('transform', d => `translate(${d.x0},${d.y0})`)

    // Rect
    nodes.append('rect')
      .attr('width', d => Math.max(0, d.x1 - d.x0))
      .attr('height', d => Math.max(0, d.y1 - d.y0))
      .attr('fill', d => d.data.color)
      .attr('rx', 4)

    // Text (Name)
    nodes.append('text')
      .attr('x', 6)
      .attr('y', 16)
      .text(d => d.x1 - d.x0 > 50 && d.y1 - d.y0 > 20 ? d.data.name : '')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('fill', 'white')
      .style('pointer-events', 'none')

    // Text (Value)
    nodes.append('text')
      .attr('x', 6)
      .attr('y', 28)
      .text(d => d.x1 - d.x0 > 50 && d.y1 - d.y0 > 35 ? `${d.data.value} (${d.data.percentage}%)` : '')
      .attr('font-size', '9px')
      .attr('fill', 'rgba(255,255,255,0.9)')
      .style('pointer-events', 'none')

    // Tooltip title
    nodes.append('title')
      .text(d => `${d.data.name}\n${d.data.value} tokens\n${d.data.percentage}%`)

  }, [treemapData])

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100">
        <div className="text-xs text-slate-400 animate-pulse">Loading context distribution...</div>
      </div>
    )
  }

  if (!treemapData) {
    return null
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-purple-500" />
        Context 分布 ({data?.tokenDistribution.total} tokens)
      </h3>
      <div className="w-full overflow-hidden rounded-xl bg-slate-50">
        <svg ref={svgRef} className="w-full h-40 block" />
      </div>
      <div className="flex flex-wrap gap-4 mt-4">
        {treemapData.children?.map(child => (
          <div key={child.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: child.color }} />
            <span className="text-xs text-slate-600 font-medium">
              {child.name} <span className="text-slate-400 font-normal">({child.percentage}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
