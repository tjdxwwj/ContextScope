import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Activity,
  ChevronRight,
  ChevronDown,
  Clock,
  Database,
  AlertCircle,
  CheckCircle2,
  Terminal,
  Layers,
  Search,
  Zap,
  LayoutDashboard,
  GitBranch,
  Maximize2,
  Minimize2,
  MousePointer2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import * as d3 from 'd3'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ContextDistribution } from './components/ContextDistribution'
import { loadLocalStore, loadRealTimeData } from './data/loadData'
import { buildRunTree, findRunInTree, type RunTreeNode } from './data/runTree'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
const formatFullTime = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { hour12: false })
const logRunListDebug = (event: string, payload: Record<string, unknown> = {}) => {
  console.log(`[RunListDebug] ${event}`, payload)
}

// --- StatusBadge (from ui) ---
type RunStatus = 'success' | 'running' | 'error' | 'unknown'
const StatusBadge = ({ status }: { status: RunStatus }) => {
  const isSuccess = status === 'success'
  const isRunning = status === 'running'
  const isError = status === 'error'
  const styles = {
    success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    running: 'bg-blue-100 text-blue-700 border-blue-200',
    error: 'bg-rose-100 text-rose-700 border-rose-200',
  }
  const Icons = {
    success: <CheckCircle2 className="w-3 h-3" />,
    running: <Activity className="w-3 h-3 animate-pulse" />,
    error: <AlertCircle className="w-3 h-3" />,
  }
  const currentStatus = isSuccess ? 'success' : isRunning ? 'running' : 'error'
  const label = isSuccess ? 'Done' : isRunning ? 'Running' : isError ? 'Error' : 'Unknown'
  return (
    <span
      className={cn(
        'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border',
        styles[currentStatus]
      )}
    >
      {Icons[currentStatus]}
      {label}
    </span>
  )
}

// --- RunListItem (from ui, adapted to RunTreeNode) ---
interface RunListItemProps {
  node: RunTreeNode
  depth?: number
  selectedId: string
  onSelect: (node: RunTreeNode) => void
  isLast?: boolean
  parentIsLast?: boolean[]
}

const RunListItem = ({
  node,
  depth = 0,
  selectedId,
  onSelect,
  isLast = true,
  parentIsLast = [],
}: RunListItemProps) => {
  const isSelected = selectedId === node.runId
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div className="flex flex-col relative" id={`run-item-${node.runId}`}>
      <div
        onClick={() => {
          logRunListDebug('click-run-item', {
            runId: node.runId,
            depth,
            selectedId,
            hasChildren: node.children.length > 0,
            childCount: node.children.length,
            timestamp: Date.now(),
          })
          onSelect(node)
        }}
        className={cn(
          'group cursor-pointer py-3 px-4 transition-all border-b border-slate-100 relative',
          isSelected
            ? 'bg-blue-50/80 border-l-4 border-l-blue-500'
            : 'hover:bg-slate-50 border-l-4 border-l-transparent'
        )}
        style={{ paddingLeft: `${depth * 1.5 + 1.5}rem` }}
      >
        {depth > 0 && (
          <>
            {parentIsLast.map((pLast, i) =>
              !pLast ? (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 w-[1px] bg-slate-200"
                  style={{ left: `${(i + 1) * 1.5}rem` }}
                />
              ) : null
            )}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-[1px] bg-slate-200"
              style={{ left: `${depth * 1.5}rem`, width: '0.75rem' }}
            />
            <div
              className={cn(
                'absolute w-[1px] bg-slate-200 top-0',
                isLast ? 'h-1/2' : 'h-full'
              )}
              style={{ left: `${depth * 1.5}rem` }}
            />
          </>
        )}

        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {node.children.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsOpen(!isOpen)
                }}
                className="p-0.5 hover:bg-slate-200 rounded text-slate-400 z-10"
              >
                {isOpen ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
            )}
            <span className="mono text-[11px] font-bold text-slate-700">
              {node.runId.substring(0, 8)}...
            </span>
            <StatusBadge status={node.status} />
          </div>
          <span className="text-[10px] text-slate-400">
            {formatTime(node.startTime)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
          <Database className="w-3 h-3" />
          <span>
            {node.provider || '-'} / {node.model || '-'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] font-medium">
            <div className="flex flex-col">
              <span className="text-slate-400 uppercase text-[8px]">In</span>
              <span className="text-slate-600">
                {node.usage.input.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-400 uppercase text-[8px]">Out</span>
              <span className="text-slate-600">
                {node.usage.output.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-slate-400 uppercase text-[8px]">Total</span>
              <span className="text-slate-900">
                {node.usageEstimated ? '≈' : ''}
                {node.usage.total.toLocaleString()}
              </span>
            </div>
          </div>
          {node.children.length > 0 && (
            <span className="text-[10px] text-blue-500 font-medium italic">
              +{node.children.length} sub-runs
            </span>
          )}
        </div>
      </div>

      {isOpen && node.children.length > 0 && (
        <div className="flex flex-col">
          {node.children.map((child, idx) => (
            <RunListItem
              key={child.runId}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              isLast={idx === node.children.length - 1}
              parentIsLast={[...parentIsLast, isLast]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Token Treemap (数据总览 - Token 消耗分布) ---
// 父节点 value = 自身 token + 所有子孙 token，面积上父包含子
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

const TokenTreemap = ({ runs }: { runs: RunTreeNode[] }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drillRootId, setDrillRootId] = useState<string | null>(null)
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
      const childRuns = node.children.length > 0 ? node.children.map(transform) : []
      const toolBlocks: TreemapDatum[] = node.toolCalls.map((t, i) => ({
        name: t.toolName,
        value: Math.max(1, (t.durationMs ?? 0) / 1000),
        selfValue: Math.max(1, (t.durationMs ?? 0) / 1000),
        id: t.toolCallId ?? `tool-${node.runId}-${i}`,
      }))
      const children = [...childRuns, ...toolBlocks]
      const childrenTotal = children.reduce((s, c) => s + (c.value ?? 0), 0)
      const selfTotal = node.usage.total
      const subtreeTotal = selfTotal + childrenTotal

      const dateStr = new Date(node.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const modelShort = node.model ? node.model.split('/').pop() : 'Unknown'
      
      return {
        name: `${modelShort} (${dateStr})`,
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
      .paddingOuter(20)
      .paddingTop(32)
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
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-500" />
          Token 消耗体积分析 (Treemap)
        </h3>
        <div className="flex items-center gap-2">
          {drillRootId && (
            <button
              type="button"
              onClick={() => setDrillRootId(null)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              返回全部
            </button>
          )}
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
            D3 Treemap · 点击块可钻取
          </span>
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
              
              <div className="flex justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="text-slate-400">In</span>
                  <span className="font-mono text-slate-300">{hovered.input.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-slate-400">Out</span>
                  <span className="font-mono text-slate-300">{hovered.output.toLocaleString()}</span>
                </div>
              </div>
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

// --- GitGraph 执行流：父 → 子 → 工具 → 回子 → 回父 → 完成 ---
type GraphNodeKind = 'agent' | 'subagent' | 'tool' | 'merge' | 'done'

interface GraphNode {
  id: string
  label: string
  kind: GraphNodeKind
  row: number
  lane: number
  runId?: string
  usage?: { input: number; output: number; total: number }
  status?: RunStatus
  fullData?: RunTreeNode
  toolName?: string
  durationMs?: number
}

interface GraphEdge {
  from: GraphNode
  to: GraphNode
  type: 'branch' | 'merge'
  label?: string
}

// Git 式布局：主干在左 (lane 0)，分支向右伸出再合并回主干
function buildGitGraph(node: RunTreeNode): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const TRUNK_LANE = 0
  let row = 0
  let branchLane = 1

  const parent: GraphNode = {
    id: node.runId,
    label: node.runId.substring(0, 8),
    kind: (node.sessionKey ?? '').includes('subagent') ? 'subagent' : 'agent',
    row,
    lane: TRUNK_LANE,
    runId: node.runId,
    usage: node.usage,
    status: node.status,
    fullData: node,
  }
  nodes.push(parent)
  row++

  if (node.children.length === 0) {
    const done: GraphNode = { id: 'done', label: '完成', kind: 'done', row, lane: TRUNK_LANE }
    nodes.push(done)
    edges.push({ from: parent, to: done, type: 'merge' })
    return { nodes, edges }
  }

  let lastTrunkNode: GraphNode = parent
  for (const child of node.children) {
    const childNode: GraphNode = {
      id: child.runId,
      label: child.runId.substring(0, 8),
      kind: 'subagent',
      row,
      lane: branchLane,
      runId: child.runId,
      usage: child.usage,
      status: child.status,
      fullData: child,
    }
    nodes.push(childNode)
    edges.push({ from: lastTrunkNode, to: childNode, type: 'branch' })
    row++

    let prevOnBranch: GraphNode = childNode
    for (const tool of child.toolCalls) {
      const toolNode: GraphNode = {
        id: tool.toolCallId ?? `tool-${child.runId}-${nodes.length}`,
        label: tool.toolName,
        kind: 'tool',
        row,
        lane: branchLane,
        toolName: tool.toolName,
        durationMs: tool.durationMs,
      }
      nodes.push(toolNode)
      edges.push({ from: prevOnBranch, to: toolNode, type: 'branch' })
      prevOnBranch = toolNode
      row++
    }

    const mergeNode: GraphNode = {
      id: `merge-${child.runId}`,
      label: '↩',
      kind: 'merge',
      row,
      lane: TRUNK_LANE,
    }
    nodes.push(mergeNode)
    edges.push({ from: prevOnBranch, to: mergeNode, type: 'merge' })
    lastTrunkNode = mergeNode
    row++
    branchLane++
  }

  const done: GraphNode = { id: 'done', label: '完成', kind: 'done', row, lane: TRUNK_LANE }
  nodes.push(done)
  edges.push({ from: lastTrunkNode, to: done, type: 'merge' })
  return { nodes, edges }
}

const ROW_H = 56
const NODE_R = 10
const TRUNK_X = 24
const BRANCH_DX = 140

const GitGraphVisualizer = ({ data }: { data: RunTreeNode }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)

  const { nodes, edges } = useMemo(() => buildGitGraph(data), [data])

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const margin = { top: 20, right: 20, bottom: 20, left: 20 }
    const maxRow = d3.max(nodes, (d) => d.row) ?? 0
    const maxLane = d3.max(nodes, (d) => d.lane) ?? 0
    const width = Math.max(320, TRUNK_X + (maxLane + 1) * BRANCH_DX)
    const height = (maxRow + 1) * ROW_H
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width + margin.left + margin.right)
    svg.attr('height', height + margin.top + margin.bottom)

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)
    const xScale = (lane: number) => TRUNK_X + lane * BRANCH_DX
    const yScale = (row: number) => row * ROW_H + ROW_H / 2

    const colors: Record<GraphNodeKind, string> = {
      agent: '#0ea5e9',
      subagent: '#8b5cf6',
      tool: '#f59e0b',
      merge: '#64748b',
      done: '#10b981',
    }

    const trunkNodes = nodes.filter((n) => n.lane === 0).sort((a, b) => a.row - b.row)
    for (let i = 0; i < trunkNodes.length - 1; i++) {
      const a = trunkNodes[i]
      const b = trunkNodes[i + 1]
      const y1 = yScale(a.row)
      const y2 = yScale(b.row)
      g.append('line')
        .attr('x1', xScale(0))
        .attr('y1', y1)
        .attr('x2', xScale(0))
        .attr('y2', y2)
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 2)
    }

    edges.forEach((e) => {
      const x1 = xScale(e.from.lane)
      const y1 = yScale(e.from.row)
      const x2 = xScale(e.to.lane)
      const y2 = yScale(e.to.row)
      const midY = (y1 + y2) / 2
      const pts: [number, number][] =
        e.type === 'branch'
          ? [
              [x1, y1],
              [x1, midY],
              [x2, midY],
              [x2, y2],
            ]
          : [
              [x1, y1],
              [x1, midY],
              [x2, midY],
              [x2, y2],
            ]
      const line = d3.line<[number, number]>().curve(d3.curveBasis)
      g.append('path')
        .attr('d', line(pts))
        .attr('fill', 'none')
        .attr('stroke', e.type === 'branch' ? '#94a3b8' : '#cbd5e1')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', e.type === 'merge' ? '4 3' : '0')
        .attr('opacity', 0.9)
    })

    const nodeGroups = g
      .selectAll('.g-node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'g-node')
      .attr('transform', (d) => `translate(${xScale(d.lane)},${yScale(d.row)})`)
      .on('mouseenter', (_event, d) => setHoveredNode(d))
      .on('mouseleave', () => setHoveredNode(null))

    nodeGroups
      .append('circle')
      .attr('r', (d) => (d.kind === 'merge' ? 5 : NODE_R))
      .attr('fill', (d) => colors[d.kind])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('class', 'cursor-pointer')

    nodeGroups
      .filter((d) => d.kind !== 'merge')
      .append('text')
      .attr('x', NODE_R + 8)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#334155')
      .attr('class', 'pointer-events-none')
      .text((d) => d.label)

    nodeGroups
      .filter((d) => d.kind !== 'merge' && d.kind !== 'done')
      .append('text')
      .attr('x', NODE_R + 8)
      .attr('y', 18)
      .attr('font-size', '10px')
      .attr('fill', '#64748b')
      .attr('class', 'pointer-events-none mono')
      .text((d) => {
        if (d.usage) return `Σ ${d.usage.total.toLocaleString()}`
        if (d.durationMs != null) return `${(d.durationMs / 1000).toFixed(1)}s`
        return ''
      })
  }, [nodes, edges])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-purple-500" />
          GitGraph 执行流 (分支与合并)
        </h3>
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
          Git 式主干 · 分支合并
        </span>
      </div>
      <div className="overflow-auto p-4 flex justify-start bg-slate-50/20 min-h-[240px] max-h-[720px]">
        <svg ref={svgRef} width={800} height={1200} className="max-w-full h-auto min-h-[200px]" style={{ minHeight: 200 }} />
      </div>
      <AnimatePresence>
        {hoveredNode && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute top-20 right-6 w-64 bg-slate-900/95 backdrop-blur text-white p-4 rounded-xl shadow-2xl border border-white/10 z-50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase text-purple-400">
                {hoveredNode.kind}
              </span>
              {hoveredNode.status != null && (
                <StatusBadge status={hoveredNode.status} />
              )}
            </div>
            <p className="mono text-xs font-bold mb-3 truncate">
              {hoveredNode.toolName ?? hoveredNode.label}
            </p>
            {hoveredNode.usage && (
              <div className="space-y-2">
                <div className="bg-white/5 p-2 rounded-lg flex justify-between items-center">
                  <span className="text-[8px] text-slate-400 uppercase">Input</span>
                  <span className="text-xs font-bold mono">
                    {hoveredNode.usage.input.toLocaleString()}
                  </span>
                </div>
                <div className="bg-white/5 p-2 rounded-lg flex justify-between items-center">
                  <span className="text-[8px] text-slate-400 uppercase">Output</span>
                  <span className="text-xs font-bold mono">
                    {hoveredNode.usage.output.toLocaleString()}
                  </span>
                </div>
                <div className="bg-emerald-500/10 p-2 rounded-lg flex justify-between items-center border border-emerald-500/20">
                  <span className="text-[8px] text-emerald-400 uppercase font-bold">
                    Total Tokens
                  </span>
                  <span className="text-xs font-bold mono text-emerald-400">
                    {hoveredNode.usage.total.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
            {hoveredNode.durationMs != null && (
              <p className="text-[10px] text-slate-400 mt-2">
                耗时 {hoveredNode.durationMs}ms
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// --- 全局总览：执行时间线 + 统计 ---
interface TimelineEvent {
  id: string
  type: 'run' | 'tool'
  startTime: number
  endTime: number
  label: string
  level: number
  data: RunTreeNode | { toolName: string; timestamp: number; durationMs?: number }
}

const GlobalOverview = ({
  runs,
  onLocate,
}: {
  runs: RunTreeNode[]
  onLocate: (id: string) => void
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)

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
    const maxLevel = d3.max(allEvents, (d) => (d as TimelineEvent & { level: number }).level) ?? 0
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
    const xAxis = d3.axisBottom(x).ticks(10).tickFormat(d3.timeFormat('%H:%M:%S') as (d: Date | d3.NumberValue) => string)
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
      .attr('fill', (d) => (d.type === 'run' ? '#3b82f6' : '#f59e0b'))
      .attr('opacity', 0.8)
      .attr('class', 'transition-opacity')
    bars
      .append('text')
      .attr('x', (d) => x(d.startTime) + 5)
      .attr('y', (d) => y((d as TimelineEvent & { level: number }).level) * 30 + 26)
      .attr('class', 'text-[9px] font-bold fill-white pointer-events-none mono')
      .text((d) => {
        const tokens =
          d.type === 'run'
            ? ` (Σ ${(d.data as RunTreeNode).usage.total.toLocaleString()})`
            : ''
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
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
            全局执行时间线
          </h2>
          <p className="text-sm text-slate-500">
            交互式分析 Session 内的所有并发与顺序调用
          </p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] text-slate-400 font-bold uppercase">总 Token</p>
            <p className="text-lg font-bold text-blue-600 mono">
              {totalTokens.toLocaleString()}
            </p>
          </div>
          <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] text-slate-400 font-bold uppercase">总工具调用</p>
            <p className="text-lg font-bold text-amber-600 mono">
              {totalCalls.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-500" />
            可视化时间轴 (支持缩放与拖拽)
          </h3>
          <div className="flex gap-3 text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <MousePointer2 className="w-3 h-3" />
              <span>点击查看详情</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Maximize2 className="w-3 h-3" />
              <span>滚轮缩放</span>
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
                      selectedEvent.type === 'run' ? 'bg-blue-500' : 'bg-amber-500'
                    )}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {selectedEvent.type}
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
                  : (selectedEvent.data as { toolName: string }).toolName}
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">开始时间</span>
                  <span className="mono font-medium">
                    {formatTime(selectedEvent.startTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">持续时间</span>
                  <span className="mono font-medium">
                    {Math.floor(selectedEvent.endTime - selectedEvent.startTime)}ms
                  </span>
                </div>
                {selectedEvent.type === 'run' && (
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500">Token 消耗</span>
                      <span className="mono font-bold text-blue-600">
                        {(selectedEvent.data as RunTreeNode).usage.total.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">模型</span>
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
                  定位节点
                </button>
                <button
                  type="button"
                  className="flex-1 py-2 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg hover:bg-slate-200 transition-colors"
                  onClick={() => setSelectedEvent(null)}
                >
                  关闭
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
              <GitBranch className="w-5 h-5" />
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

export default function App() {
  const [roots, setRoots] = useState<RunTreeNode[]>([])
  const [selectedRun, setSelectedRun] = useState<RunTreeNode | null>(null)
  const selectedRunRef = useRef<RunTreeNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'overview' | 'run'>('run')
  const [activeTab, setActiveTab] = useState<'details' | 'tree'>('details')
  const [overviewTab, setOverviewTab] = useState<'timeline' | 'treemap'>('timeline')

  const handleLocate = useCallback((runId: string) => {
    logRunListDebug('locate-run-requested', {
      runId,
      rootsCount: roots.length,
      selectedRunId: selectedRun?.runId ?? null,
    })
    const node = findRunInTree(roots, runId)
    if (node) {
      logRunListDebug('locate-run-found', {
        runId: node.runId,
      })
      setSelectedRun(node)
      setViewMode('run')
      setActiveTab('details')
      setTimeout(() => {
        const el = document.getElementById(`run-item-${runId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2')
          setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2'), 2000)
        }
      }, 100)
    }
  }, [roots])

  useEffect(() => {
    selectedRunRef.current = selectedRun
  }, [selectedRun])

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const raw = await loadLocalStore()
    if (!raw) {
      setLoadError(
        '无法连接后端实时数据接口，请确认 OpenClaw 网关与 /plugins/contextscope/api 可访问。'
      )
      setRoots([])
      setSelectedRun(null)
    } else {
      const tree = buildRunTree(raw)
        logRunListDebug('load-initial-data-success', {
          rootsCount: tree.length,
          firstRunId: tree[0]?.runId ?? null,
        })
      setRoots(tree)
      setSelectedRun(tree.length > 0 ? tree[0] : null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    logRunListDebug('polling-effect-mounted', {})
    loadData()
    
    // 实时数据轮询 - 每 5 秒从真实 API 获取最新数据
    const pollInterval = setInterval(async () => {
      const realTimeData = await loadRealTimeData()
      if (realTimeData && realTimeData.requests.length > 0) {
        console.log('[Real-time] New data from API:', realTimeData.requests.length, 'requests')
        const tree = buildRunTree(realTimeData)
        setRoots(tree)
        // 保持当前选中的 run（如果还存在）
        const currentSelectedRun = selectedRunRef.current
        if (currentSelectedRun) {
          const stillExists = findRunInTree(tree, currentSelectedRun.runId)
          if (stillExists) {
            logRunListDebug('poll-keep-selected-run', {
              selectedRunId: currentSelectedRun.runId,
            })
            setSelectedRun(stillExists)
          } else if (tree.length > 0) {
            logRunListDebug('poll-selected-run-missing-fallback-first', {
              previousSelectedRunId: currentSelectedRun.runId,
              fallbackRunId: tree[0].runId,
            })
            setSelectedRun(tree[0])
          }
        } else if (tree.length > 0) {
          logRunListDebug('poll-no-selected-run-fallback-first', {
            fallbackRunId: tree[0].runId,
          })
          setSelectedRun(tree[0])
        }
      }
    }, 5000) // 5 秒轮询一次
    
    return () => clearInterval(pollInterval)
  }, [loadData])

  useEffect(() => {
    logRunListDebug('selected-run-changed', {
      selectedRunId: selectedRun?.runId ?? null,
      viewMode,
    })
  }, [selectedRun, viewMode])

  const totalTokens = selectedRun?.usage.total ?? 0
  const inputRatio =
    totalTokens > 0 ? (selectedRun!.usage.input / totalTokens) * 100 : 0

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      {/* Header (from ui) */}
      <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 border-b border-white/10 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-inner">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">ContextScope</h1>
          <div className="h-4 w-[1px] bg-white/20 mx-2" />
          <span className="text-xs text-slate-400 font-medium">
            OpenClaw Analyzer
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              )}
            />
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              {loading
                ? '加载中…'
                : loadError
                  ? '无数据'
                  : `已加载 ${roots.length} 个 Root Run`}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (from ui) */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索 Run ID..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* 全局总览入口 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setViewMode('overview')}
              onKeyDown={(e) => e.key === 'Enter' && setViewMode('overview')}
              className={cn(
                'mx-4 mt-4 mb-2 p-4 rounded-xl cursor-pointer transition-all border',
                viewMode === 'overview'
                  ? 'bg-blue-600 text-white border-blue-700 shadow-md'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              )}
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard
                  className={cn('w-5 h-5', viewMode === 'overview' ? 'text-white' : 'text-blue-500')}
                />
                <span className="text-sm font-bold">全局总览</span>
              </div>
              <p
                className={cn(
                  'text-[10px] mt-1',
                  viewMode === 'overview' ? 'text-blue-100' : 'text-slate-400'
                )}
              >
                查看所有调用链的时间线与统计
              </p>
            </div>

            <div className="px-4 py-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Run 列表
              </p>
            </div>
            {loadError && (
              <div className="mx-4 p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs">
                {loadError}
                <button
                  type="button"
                  className="mt-2 block text-blue-600 font-semibold"
                  onClick={loadData}
                >
                  重试
                </button>
              </div>
            )}
            {!loading && !loadError && roots.length === 0 && (
              <div className="mx-4 p-4 text-slate-500 text-xs">
                暂无 run
              </div>
            )}
            {roots.map((run) => (
              <RunListItem
                key={run.runId}
                node={run}
                selectedId={viewMode === 'run' ? selectedRun?.runId ?? '' : ''}
                onSelect={(node) => {
                  logRunListDebug('select-run-from-list', {
                    runId: node.runId,
                    previousSelectedRunId: selectedRun?.runId ?? null,
                    currentViewMode: viewMode,
                  })
                  setSelectedRun(node)
                  setViewMode('run')
                }}
              />
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
          <AnimatePresence mode="wait">
            {viewMode === 'overview' ? (
              <motion.div
                key="overview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="max-w-5xl mx-auto space-y-8"
              >
                <div className="flex bg-slate-200 p-1 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setOverviewTab('timeline')}
                    className={cn(
                      'px-4 py-2 text-xs font-bold rounded-lg transition-all',
                      overviewTab === 'timeline'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    执行时间轴
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverviewTab('treemap')}
                    className={cn(
                      'px-4 py-2 text-xs font-bold rounded-lg transition-all',
                      overviewTab === 'treemap'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    Token 消耗分布
                  </button>
                </div>
                {overviewTab === 'timeline' ? (
                  <GlobalOverview runs={roots} onLocate={handleLocate} />
                ) : (
                  <TokenTreemap runs={roots} />
                )}
              </motion.div>
            ) : !selectedRun ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-5xl mx-auto py-20 text-center text-slate-500"
              >
                在左侧点击一个 run 查看详情
              </motion.div>
            ) : (
              <motion.div
                key={selectedRun.runId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-5xl mx-auto space-y-8"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h2 className="mono text-2xl font-bold text-slate-800 tracking-tight break-all">
                      {selectedRun.runId}
                    </h2>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      {selectedRun.sessionKey && (
                        <span className="mono text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {selectedRun.sessionKey}
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>{formatFullTime(selectedRun.startTime)}</span>
                        <ChevronRight className="w-3 h-3 text-slate-300" />
                        <span>{formatTime(selectedRun.endTime)}</span>
                        <span className="ml-2 font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full text-[10px]">
                          {Math.floor(
                            (selectedRun.endTime - selectedRun.startTime) / 1000
                          )}
                          s 耗时
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={selectedRun.status} />
                    <div className="flex bg-slate-200 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setActiveTab('details')}
                        className={cn(
                          'px-3 py-1 text-[10px] font-bold rounded-md transition-all',
                          activeTab === 'details'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        )}
                      >
                        详情
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('tree')}
                        className={cn(
                          'px-3 py-1 text-[10px] font-bold rounded-md transition-all',
                          activeTab === 'tree'
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        )}
                      >
                        GitGraph 执行流
                      </button>
                    </div>
                  </div>
                </div>

                {activeTab === 'details' ? (
                  <>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    {
                      label: 'Input Tokens',
                      value: selectedRun.usage.input,
                      icon: <Layers className="w-4 h-4 text-blue-500" />,
                      color: 'blue',
                    },
                    {
                      label: 'Output Tokens',
                      value: selectedRun.usage.output,
                      icon: <Zap className="w-4 h-4 text-emerald-500" />,
                      color: 'emerald',
                    },
                    {
                      label: 'Total Tokens',
                      value: totalTokens,
                      icon: <Activity className="w-4 h-4 text-slate-500" />,
                      color: 'slate',
                      estimated: selectedRun.usageEstimated,
                    },
                    {
                      label: 'Requests',
                      value: selectedRun.requestCount,
                      icon: <Database className="w-4 h-4 text-amber-500" />,
                      color: 'amber',
                    },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className={cn(
                            'p-2 rounded-xl',
                            stat.color === 'blue' && 'bg-blue-50',
                            stat.color === 'emerald' && 'bg-emerald-50',
                            stat.color === 'slate' && 'bg-slate-50',
                            stat.color === 'amber' && 'bg-amber-50'
                          )}
                        >
                          {stat.icon}
                        </div>
                        {stat.estimated && (
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            估算
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                        {stat.label}
                      </p>
                      <p className="text-2xl font-bold text-slate-900 mono">
                        {stat.value.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Context Distribution Treemap */}
                <ContextDistribution runId={selectedRun.runId} />

                {/* Token Ratio Bar */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      Token 占比分析
                    </h3>
                    <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-slate-600">
                          Input ({inputRatio.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-slate-600">
                          Output ({(100 - inputRatio).toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${inputRatio}%` }}
                      className="h-full bg-blue-500 relative"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${100 - inputRatio}%` }}
                      className="h-full bg-emerald-500 relative"
                    />
                  </div>
                </div>

                {/* Tool Calls Timeline */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-amber-500" />
                    工具调用序列 ({selectedRun.toolCalls.length})
                  </h3>
                  {selectedRun.toolCalls.length > 0 ? (
                    <div className="space-y-0 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                      {selectedRun.toolCalls.map((tool, idx) => (
                        <div
                          key={tool.toolCallId ?? idx}
                          className="relative pl-10 pb-8 last:pb-0"
                        >
                          <div
                            className={cn(
                              'absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-white shadow-sm flex items-center justify-center z-10',
                              tool.error ? 'bg-rose-500' : 'bg-blue-500'
                            )}
                          >
                            <div className="w-1.5 h-1.5 bg-white rounded-full" />
                          </div>
                          <div className="flex items-start justify-between bg-slate-50/50 p-4 rounded-xl border border-slate-100 hover:border-blue-200 transition-colors">
                            <div className="space-y-1">
                              <p className="mono text-sm font-bold text-slate-800">
                                {tool.toolName}
                              </p>
                              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTime(tool.timestamp)}
                                </span>
                                {tool.durationMs != null && (
                                  <span className="flex items-center gap-1">
                                    <Activity className="w-3 h-3" />
                                    {tool.durationMs}ms
                                  </span>
                                )}
                              </div>
                            </div>
                            {tool.error && (
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-100">
                                FAILED
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                      <Terminal className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-xs font-medium">
                        此 Run 未调用任何外部工具
                      </p>
                    </div>
                  )}
                </div>

                {/* Sub-runs Overview */}
                {selectedRun.children.length > 0 && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-500" />
                      子 Run 概览 ({selectedRun.children.length})
                    </h3>
                    <div className="overflow-hidden border border-slate-100 rounded-xl">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-3">Run ID</th>
                            <th className="px-4 py-3">Total Tokens</th>
                            <th className="px-4 py-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {selectedRun.children.map((child) => (
                            <tr
                              key={child.runId}
                              className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                              onClick={() => {
                                logRunListDebug('select-child-run-from-table', {
                                  runId: child.runId,
                                  parentRunId: selectedRun.runId,
                                  previousSelectedRunId: selectedRun?.runId ?? null,
                                })
                                setSelectedRun(child)
                              }}
                            >
                              <td className="px-4 py-3">
                                <span className="mono text-xs font-medium text-slate-600 group-hover:text-blue-600 transition-colors">
                                  {child.runId.substring(0, 12)}...
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-bold text-slate-700 mono">
                                  {child.usage.total.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end">
                                  <StatusBadge status={child.status} />
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                  </>
                ) : (
                  <GitGraphVisualizer data={selectedRun} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
