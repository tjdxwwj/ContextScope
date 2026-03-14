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
  Calendar,
  Trash2,
  DollarSign,
  RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { message, Modal } from 'antd'
import * as d3 from 'd3'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ContextDistribution } from './components/ContextDistribution'
import { PricingTable } from './components/PricingTable'
import { PricingInfo } from './components/PricingInfo'
import { loadLocalStore, loadRealTimeData } from './data/loadData'
import {
  fetchChain,
  fetchTasks,
  type ChainResponse,
  type TaskData,
} from './data/apiClient'
import {
  buildRunTree,
  findRunInTree,
  type RunTreeNode,
  type ToolCallSummary,
} from './data/runTree'

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
const mapToolCallsFromChain = (chainData: ChainResponse): ToolCallSummary[] => {
  const items = [...chainData.chain].sort((a, b) => a.timestamp - b.timestamp)
  const calls = new Map<string, ToolCallSummary>()
  for (const item of items) {
    if (item.type === 'tool_call') {
      const key = item.id || `${item.timestamp}-${item.metadata?.toolName || 'tool'}`
      calls.set(key, {
        toolName: item.metadata?.toolName || 'Unknown Tool',
        toolCallId: item.id,
        timestamp: item.timestamp,
        durationMs: item.duration,
        error:
          item.metadata?.status === 'error'
            ? item.metadata.error || 'Tool call failed'
            : undefined,
      })
      continue
    }
    if (item.type === 'tool_result') {
      const key = item.id
      const found = key ? calls.get(key) : undefined
      if (found) {
        if (item.duration != null) found.durationMs = item.duration
        if (item.metadata?.status === 'error') {
          found.error = item.metadata.error || found.error || 'Tool call failed'
        }
      }
    }
  }
  return Array.from(calls.values()).sort((a, b) => a.timestamp - b.timestamp)
}
const taskStatusClass: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  running: 'bg-blue-100 text-blue-700 border-blue-200',
  error: 'bg-rose-100 text-rose-700 border-rose-200',
  timeout: 'bg-amber-100 text-amber-700 border-amber-200',
  aborted: 'bg-slate-200 text-slate-700 border-slate-300',
}
const taskStatusText: Record<string, string> = {
  completed: '已完成',
  running: '进行中',
  error: '失败',
  timeout: '超时',
  aborted: '已中止',
}
const formatDuration = (durationMs?: number) => {
  if (durationMs == null || durationMs < 0) return '-'
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

// 从 pricing 工具导入（动态从 API 获取，无硬编码）
import { calculateCost, formatCost, ensurePricingLoaded, getPricingStatus } from './utils/pricing'

const extractUserTaskFromPrompt = (raw: string): string => {
  if (!raw) return ''
  const noCodeFence = raw.replace(/```[\s\S]*?```/g, '\n')
  const noMetadataSections = noCodeFence
    .replace(/^\s*System:.*$/gim, '')
    .replace(/^\s*Conversation info.*$/gim, '')
    .replace(/^\s*Sender \(untrusted metadata\):.*$/gim, '')
    .replace(/^\s*Sender:.*$/gim, '')
  const lines = noMetadataSections
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith('{') &&
        !line.startsWith('}') &&
        !line.startsWith('"') &&
        !line.startsWith('[') &&
        !line.startsWith(']')
    )
  if (lines.length === 0) return raw.trim()
  return lines[lines.length - 1]
}
const normalizeLlmOutput = (value: unknown): string => {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
const extractLlmOutputFromChain = (chainData: ChainResponse): string => {
  const items = [...chainData.chain].sort((a, b) => b.timestamp - a.timestamp)
  for (const item of items) {
    if (item.type !== 'output') continue
    const text = item.output?.text?.trim()
    if (text) return text
    const assistantTexts = (item.output?.assistantTexts ?? [])
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join('\n')
    if (assistantTexts) return assistantTexts
    const result = normalizeLlmOutput(item.output?.result)
    if (result) return result
    const outcome = item.output?.outcome?.trim()
    if (outcome) return outcome
  }
  return ''
}
const buildRunTreeSignature = (tree: RunTreeNode[]): string =>
  tree
    .map((node) => `${node.runId}:${node.startTime}:${node.endTime}:${node.children.length}:${node.requestCount}`)
    .join('|')
interface TaskMenuNode {
  taskId: string
  children: TaskMenuNode[]
}

const deriveTaskMenuData = (tasks: TaskData[], roots: RunTreeNode[]) => {
  const taskMap = new Map(tasks.map((task) => [task.taskId, task]))
  const childrenByParent = new Map<string, string[]>()
  const parentByChild = new Map<string, string>()
  const runParentMap = new Map<string, string>()
  const walkRuns = (node: RunTreeNode, parentRunId?: string) => {
    if (parentRunId) runParentMap.set(node.runId, parentRunId)
    node.children.forEach((child) => walkRuns(child, node.runId))
  }
  roots.forEach((rootNode) => walkRuns(rootNode))

  const linkParentChild = (parentId: string, childId: string) => {
    if (!taskMap.has(parentId) || !taskMap.has(childId) || parentId === childId) return
    const existingParentId = parentByChild.get(childId)
    if (existingParentId && existingParentId !== parentId) return
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
    const list = childrenByParent.get(parentId)!
    if (!list.includes(childId)) list.push(childId)
    if (!parentByChild.has(childId)) parentByChild.set(childId, parentId)
  }

  tasks.forEach((parentTask) => {
    ;(parentTask.childTaskIds ?? []).forEach((childId) => {
      linkParentChild(parentTask.taskId, childId)
    })
  })

  tasks.forEach((task) => {
    if (task.parentTaskId) linkParentChild(task.parentTaskId, task.taskId)
  })

  const runToTaskId = new Map<string, string>()
  tasks.forEach((task) => {
    task.runIds.forEach((runId) => {
      if (!runToTaskId.has(runId)) runToTaskId.set(runId, task.taskId)
    })
  })

  tasks.forEach((task) => {
    if (parentByChild.has(task.taskId)) return
    for (const runId of task.runIds) {
      const parentRunId = runParentMap.get(runId)
      if (!parentRunId) continue
      const parentTaskId = runToTaskId.get(parentRunId)
      if (parentTaskId) {
        linkParentChild(parentTaskId, task.taskId)
        break
      }
    }
  })

  const tasksBySession = new Map<string, TaskData[]>()
  tasks.forEach((task) => {
    if (!tasksBySession.has(task.sessionId)) tasksBySession.set(task.sessionId, [])
    tasksBySession.get(task.sessionId)!.push(task)
  })
  tasksBySession.forEach((list) => list.sort((a, b) => a.startTime - b.startTime))
  tasks.forEach((task) => {
    if (parentByChild.has(task.taskId) || !task.parentSessionId) return
    const candidateParents = (tasksBySession.get(task.parentSessionId) ?? []).filter(
      (candidate) => candidate.taskId !== task.taskId && candidate.startTime <= task.startTime
    )
    const parentTask = candidateParents.length > 0
      ? candidateParents[candidateParents.length - 1]
      : (tasksBySession.get(task.parentSessionId) ?? []).find((candidate) => candidate.taskId !== task.taskId)
    if (parentTask) linkParentChild(parentTask.taskId, task.taskId)
  })

  const allTaskIds = tasks.map((task) => task.taskId)
  const rootTaskIds = allTaskIds.filter((taskId) => !parentByChild.has(taskId))
  const effectiveRootTaskIds = rootTaskIds.length > 0 ? rootTaskIds : allTaskIds

  const buildMenuNode = (taskId: string, visited: Set<string>): TaskMenuNode => {
    if (visited.has(taskId)) return { taskId, children: [] }
    visited.add(taskId)
    const children = (childrenByParent.get(taskId) ?? [])
      .slice()
      .sort((a, b) => (taskMap.get(a)?.startTime ?? 0) - (taskMap.get(b)?.startTime ?? 0))
      .map((childId) => buildMenuNode(childId, visited))
    return { taskId, children }
  }

  const globalVisited = new Set<string>()
  const rootNodes = effectiveRootTaskIds
    .slice()
    .sort((a, b) => (taskMap.get(b)?.startTime ?? 0) - (taskMap.get(a)?.startTime ?? 0))
    .filter((taskId) => !globalVisited.has(taskId))
    .map((taskId) => buildMenuNode(taskId, globalVisited))

  return {
    rootNodes,
    rootTaskIds: effectiveRootTaskIds,
    taskById: taskMap,
  }
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
  const label = isSuccess ? '已完成' : isRunning ? '进行中' : isError ? '失败' : '未知'
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
            {formatFullTime(node.startTime)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
          <Database className="w-3 h-3" />
          <span>
            {node.provider || '-'} / {node.model || '-'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          {(() => {
            const inputResult = calculateCost(node.model || '', node.usage.input, 0)
            const outputResult = calculateCost(node.model || '', 0, node.usage.output)
            const totalResult = calculateCost(node.model || '', node.usage.input, node.usage.output)
            
            return (
              <div className="flex items-center gap-3 text-[10px] font-medium">
                <div className="flex flex-col">
                  <span className="text-slate-400 uppercase text-[8px]">In</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-600">
                      {node.usage.input.toLocaleString()}
                    </span>
                    <span className={cn(
                      "text-[8px] font-mono",
                      !pricingLoaded ? "text-slate-400" : inputResult.matched ? "text-emerald-600" : "text-slate-400 italic"
                    )}>
                      {!pricingLoaded ? <RefreshCw className="w-3 h-3 animate-spin" /> : (inputResult.matched ? formatCost(inputResult.cost) : '未匹配')}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-400 uppercase text-[8px]">Out</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-600">
                      {node.usage.output.toLocaleString()}
                    </span>
                    <span className={cn(
                      "text-[8px] font-mono",
                      !pricingLoaded ? "text-slate-400" : outputResult.matched ? "text-emerald-600" : "text-slate-400 italic"
                    )}>
                      {!pricingLoaded ? <RefreshCw className="w-3 h-3 animate-spin" /> : (outputResult.matched ? formatCost(outputResult.cost) : '未匹配')}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-400 uppercase text-[8px]">Total</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-900">
                      {node.usageEstimated ? '≈' : ''}
                      {node.usage.total.toLocaleString()}
                    </span>
                    <span className={cn(
                      "text-[8px] font-mono font-bold",
                      !pricingLoaded ? "text-slate-400" : totalResult.matched ? "text-emerald-600" : "text-slate-400 italic"
                    )}>
                      {!pricingLoaded ? <RefreshCw className="w-3 h-3 animate-spin" /> : (totalResult.matched ? formatCost(totalResult.cost) : '未匹配')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })()}
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
      const children = node.children.length > 0 ? node.children.map(transform) : []
      const childrenTotal = children.reduce((s, c) => s + (c.value ?? 0), 0)
      const selfTotal = node.usage.total
      const subtreeTotal = selfTotal + childrenTotal
      
      const modelName = node.model ? node.model.split('/').pop() ?? node.model : 'Unknown'
      const timeText = new Date(node.startTime).toLocaleTimeString('zh-CN', {
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
            <h3 className="text-sm font-bold text-slate-800">Token 消耗体积分析</h3>
            <p className="text-[11px] text-slate-500">
              面积 = Σ token，父块包含所有子块
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
              返回全部
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
                            "font-mono text-[9px]",
                            inputResult.matched ? "text-emerald-400" : "text-slate-500 italic"
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
                            "font-mono text-[9px]",
                            outputResult.matched ? "text-emerald-400" : "text-slate-500 italic"
                          )}>
                            {outputResult.matched ? formatCost(outputResult.cost) : '未匹配'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Total Cost Display */}
                    <div className="pt-2 mt-2 border-t border-white/10">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400">Total Cost</span>
                        <span className={cn(
                          "font-bold font-mono",
                          totalResult.matched ? "text-emerald-400" : "text-slate-500 italic"
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

// --- GitGraph 执行流：树形展示任务内调用链（含工具与子代理） ---
type GraphNodeKind = 'agent' | 'subagent' | 'tool'

interface GraphNode {
  id: string
  label: string
  kind: GraphNodeKind
  /** 垂直阶段（同一 row 代表同一阶段，体现“并行”） */
  row: number
  /** 水平泳道：0 = 父，1+ = 各子 / 工具分支 */
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
  type: 'branch'
  label?: string
}

// 树形布局：lane 表示深度，row 表示遍历顺序，包含 run + tool + 子 run 全节点
function buildGitGraph(node: RunTreeNode): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  let row = 0
  const walk = (run: RunTreeNode, depth: number, parent?: GraphNode) => {
    const runNode: GraphNode = {
      id: `run-${run.runId}`,
      label: run.runId.substring(0, 8),
      kind: (run.sessionKey ?? '').includes('subagent') || depth > 0 ? 'subagent' : 'agent',
      row: row++,
      lane: depth,
      runId: run.runId,
      usage: run.usage,
      status: run.status,
      fullData: run,
    }
    nodes.push(runNode)
    if (parent) edges.push({ from: parent, to: runNode, type: 'branch' })

    run.toolCalls.forEach((tool, idx) => {
      const toolNode: GraphNode = {
        id: tool.toolCallId ?? `tool-${run.runId}-${idx}`,
        label: tool.toolName,
        kind: 'tool',
        row: row++,
        lane: depth + 1,
        toolName: tool.toolName,
        durationMs: tool.durationMs,
      }
      nodes.push(toolNode)
      edges.push({ from: runNode, to: toolNode, type: 'branch' })
    })

    run.children.forEach((child) => walk(child, depth + 1, runNode))
  }

  walk(node, 0)
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
    }

    edges.forEach((e) => {
      const x1 = xScale(e.from.lane)
      const y1 = yScale(e.from.row)
      const x2 = xScale(e.to.lane)
      const y2 = yScale(e.to.row)
      const midY = (y1 + y2) / 2
      const pts: [number, number][] = [
        [x1, y1],
        [x1, midY],
        [x2, midY],
        [x2, y2],
      ]
      const line = d3.line<[number, number]>().curve(d3.curveBasis)
      g.append('path')
        .attr('d', line(pts))
        .attr('fill', 'none')
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '0')
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
      .attr('r', NODE_R)
      .attr('fill', (d) => colors[d.kind])
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('class', 'cursor-pointer')

    nodeGroups
      .append('text')
      .attr('x', NODE_R + 8)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#334155')
      .attr('class', 'pointer-events-none')
      .text((d) => d.label)

    nodeGroups
      .filter((d) => d.kind !== 'tool')
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
          调用链视图（树形）
        </h3>
        <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
          用户任务 · 子代理 · 工具节点
        </span>
      </div>
      <div className="overflow-y-auto overflow-x-auto p-4 bg-slate-50/20 min-h-[240px] max-h-[720px]">
        <svg ref={svgRef} className="block" width={800} height={1200} style={{ minHeight: 200 }} />
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
                {(() => {
                  const model = hoveredNode.fullData?.model || ''
                  const inputResult = calculateCost(model, hoveredNode.usage.input, 0)
                  const outputResult = calculateCost(model, 0, hoveredNode.usage.output)
                  const totalResult = calculateCost(model, hoveredNode.usage.input, hoveredNode.usage.output)
                  
                  return (
                    <>
                      <div className="bg-white/5 p-2 rounded-lg flex justify-between items-center">
                        <div>
                          <span className="text-[8px] text-slate-400 uppercase block">Input</span>
                          <span className="text-xs font-bold mono text-white">
                            {hoveredNode.usage.input.toLocaleString()}
                          </span>
                        </div>
                        <span className={cn(
                          "text-xs font-bold mono",
                          inputResult.matched ? "text-emerald-400" : "text-slate-500 italic"
                        )}>
                          {inputResult.matched ? formatCost(inputResult.cost) : '未匹配'}
                        </span>
                      </div>
                      <div className="bg-white/5 p-2 rounded-lg flex justify-between items-center">
                        <div>
                          <span className="text-[8px] text-slate-400 uppercase block">Output</span>
                          <span className="text-xs font-bold mono text-white">
                            {hoveredNode.usage.output.toLocaleString()}
                          </span>
                        </div>
                        <span className={cn(
                          "text-xs font-bold mono",
                          outputResult.matched ? "text-emerald-400" : "text-slate-500 italic"
                        )}>
                          {outputResult.matched ? formatCost(outputResult.cost) : '未匹配'}
                        </span>
                      </div>
                      <div className="bg-emerald-500/10 p-2 rounded-lg flex justify-between items-center border border-emerald-500/20">
                        <div>
                          <span className="text-[8px] text-emerald-400 uppercase font-bold block">
                            Total Tokens
                          </span>
                          <span className="text-xs font-bold mono text-emerald-300">
                            {hoveredNode.usage.total.toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="bg-emerald-500/20 p-2 rounded-lg flex justify-between items-center border border-emerald-500/30">
                        <span className="text-[8px] text-emerald-300 uppercase font-bold">
                          Total Cost
                        </span>
                        <span className={cn(
                          "text-xs font-bold mono",
                          totalResult.matched ? "text-emerald-300" : "text-slate-500 italic"
                        )}>
                          {totalResult.matched ? formatCost(totalResult.cost) : '未匹配'}
                        </span>
                      </div>
                    </>
                  )
                })()}
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
        {(() => {
          const totalInputTokens = runs.reduce((sum, r) => sum + r.usage.input, 0)
          const totalOutputTokens = runs.reduce((sum, r) => sum + r.usage.output, 0)
          const totalInputResult = runs.reduce((acc, r) => {
            const result = calculateCost(r.model || '', r.usage.input, 0)
            return {
              cost: acc.cost + result.cost,
              matched: acc.matched || result.matched
            }
          }, { cost: 0, matched: false })
          const totalOutputResult = runs.reduce((acc, r) => {
            const result = calculateCost(r.model || '', 0, r.usage.output)
            return {
              cost: acc.cost + result.cost,
              matched: acc.matched || result.matched
            }
          }, { cost: 0, matched: false })
          const totalResult = runs.reduce((acc, r) => {
            const result = calculateCost(r.model || '', r.usage.input, r.usage.output)
            return {
              cost: acc.cost + result.cost,
              matched: acc.matched || result.matched
            }
          }, { cost: 0, matched: false })
          
          const allMatched = runs.every(r => calculateCost(r.model || '', r.usage.input, r.usage.output).matched)
          
          return (
            <div className="flex gap-4">
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Input</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold text-blue-600 mono">
                    {totalInputTokens.toLocaleString()}
                  </p>
                  <p className={cn(
                    "text-[10px] font-bold mono",
                    allMatched ? "text-emerald-600" : "text-slate-400 italic"
                  )}>
                    {allMatched ? formatCost(totalInputResult.cost) : '部分未匹配'}
                  </p>
                </div>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Output</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold text-emerald-600 mono">
                    {totalOutputTokens.toLocaleString()}
                  </p>
                  <p className={cn(
                    "text-[10px] font-bold mono",
                    allMatched ? "text-emerald-600" : "text-slate-400 italic"
                  )}>
                    {allMatched ? formatCost(totalOutputResult.cost) : '部分未匹配'}
                  </p>
                </div>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase">Total</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold text-slate-900 mono">
                    {totalTokens.toLocaleString()}
                  </p>
                  <p className={cn(
                    "text-[10px] font-bold mono",
                    allMatched ? "text-emerald-600" : "text-slate-400 italic"
                  )}>
                    {allMatched ? formatCost(totalResult.cost) : '部分未匹配'}
                  </p>
                </div>
              </div>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] text-slate-400 font-bold uppercase">工具调用</p>
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
  const rootsSignatureRef = useRef('')
  const [tasks, setTasks] = useState<TaskData[]>([])
  const [selectedRun, setSelectedRun] = useState<RunTreeNode | null>(null)
  const selectedRunRef = useRef<RunTreeNode | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskUserPrompt, setSelectedTaskUserPrompt] = useState<string | null>(null)
  const [selectedTaskLlmOutput, setSelectedTaskLlmOutput] = useState<string | null>(null)
  const [taskPromptLoading, setTaskPromptLoading] = useState(false)
  const [leftPanelMode, setLeftPanelMode] = useState<'run' | 'task'>('task')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'overview' | 'run'>('run')
  const [overviewTab, setOverviewTab] = useState<'timeline' | 'treemap' | 'pricing'>('timeline')
  const [dateFilter, setDateFilter] = useState<{ date?: string, startDate?: string, endDate?: string }>({})
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [selectedRunChainToolCalls, setSelectedRunChainToolCalls] = useState<ToolCallSummary[] | null>(null)
  
  // 价格加载状态
  const [pricingLoaded, setPricingLoaded] = useState(false)
  
  useEffect(() => {
    const loadPricing = async () => {
      await ensurePricingLoaded()
      const status = getPricingStatus()
      setPricingLoaded(status.loaded)
    }
    loadPricing()
  }, [])

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

  const taskMenuData = useMemo(() => deriveTaskMenuData(tasks, roots), [tasks, roots])
  const selectedTask = useMemo(
    () => (selectedTaskId ? taskMenuData.taskById.get(selectedTaskId) ?? null : null),
    [selectedTaskId, taskMenuData]
  )
  const selectedTaskWorkflowRun = useMemo(() => {
    if (!selectedTask) return null
    const runNodes = selectedTask.runIds
      .map((runId) => findRunInTree(roots, runId))
      .filter((runNode): runNode is RunTreeNode => runNode != null)
    if (runNodes.length === 0) return null

    const runIdSet = new Set(runNodes.map((runNode) => runNode.runId))
    const childIdSet = new Set<string>()
    runNodes.forEach((runNode) => {
      runNode.children.forEach((child) => {
        if (runIdSet.has(child.runId)) childIdSet.add(child.runId)
      })
    })
    const rootRuns = runNodes.filter((runNode) => !childIdSet.has(runNode.runId))
    const workflowRoots = rootRuns.length > 0 ? rootRuns : runNodes
    if (workflowRoots.length === 1) return workflowRoots[0]

    const usage = workflowRoots.reduce(
      (acc, runNode) => ({
        input: acc.input + runNode.usage.input,
        output: acc.output + runNode.usage.output,
        total: acc.total + runNode.usage.total,
      }),
      { input: 0, output: 0, total: 0 }
    )
    const hasError = workflowRoots.some((runNode) => runNode.status === 'error')
    const hasRunning = workflowRoots.some((runNode) => runNode.status === 'running')
    const isAllSuccess = workflowRoots.every((runNode) => runNode.status === 'success')
    const status: RunTreeNode['status'] = hasError
      ? 'error'
      : hasRunning
        ? 'running'
        : isAllSuccess
          ? 'success'
          : 'unknown'
    return {
      runId: selectedTask.taskId,
      sessionId: selectedTask.sessionId,
      sessionKey: selectedTask.sessionKey,
      startTime: Math.min(...workflowRoots.map((runNode) => runNode.startTime)),
      endTime: Math.max(...workflowRoots.map((runNode) => runNode.endTime)),
      usage,
      requestCount: workflowRoots.reduce((sum, runNode) => sum + runNode.requestCount, 0),
      status,
      children: workflowRoots,
      toolCalls: [],
    }
  }, [selectedTask, roots])

  useEffect(() => {
    let canceled = false
    if (!selectedTask || selectedTask.runIds.length === 0) {
      setSelectedTaskUserPrompt(null)
      setSelectedTaskLlmOutput(null)
      setTaskPromptLoading(false)
      return
    }

    const runCandidates = [...selectedTask.runIds]

    setTaskPromptLoading(true)
    setSelectedTaskUserPrompt(null)
    setSelectedTaskLlmOutput(null)

    ;(async () => {
      let foundPrompt: string | null = null
      let foundOutput: string | null = null
      for (const runId of runCandidates) {
        const chainData = await fetchChain(runId)
        if (!chainData) continue
        if (!foundPrompt) {
          const promptItem = [...chainData.chain]
            .sort((a, b) => a.timestamp - b.timestamp)
            .find(
              (item) =>
                item.type === 'input' &&
                ((item.input?.prompt && item.input.prompt.trim().length > 0) ||
                  (item.input?.task && item.input.task.trim().length > 0))
            )
          const promptText = promptItem?.input?.prompt?.trim() || promptItem?.input?.task?.trim()
          if (promptText) foundPrompt = extractUserTaskFromPrompt(promptText)
        }
        if (!foundOutput) {
          const outputText = extractLlmOutputFromChain(chainData)
          if (outputText) foundOutput = outputText
        }
        if (foundPrompt && foundOutput) break
      }
      if (!canceled) setSelectedTaskUserPrompt(foundPrompt)
      if (!canceled) setSelectedTaskLlmOutput(foundOutput)
      if (!canceled) setTaskPromptLoading(false)
    })()

    return () => {
      canceled = true
    }
  }, [selectedTask])

  useEffect(() => {
    if (taskMenuData.rootTaskIds.length === 0) {
      setSelectedTaskId(null)
      return
    }
    setSelectedTaskId((prev) =>
      prev && taskMenuData.taskById.has(prev) ? prev : taskMenuData.rootTaskIds[0]
    )
  }, [taskMenuData])

  useEffect(() => {
    let canceled = false
    if (!selectedRun?.runId) {
      setSelectedRunChainToolCalls(null)
      return
    }
    setSelectedRunChainToolCalls(null)
    fetchChain(selectedRun.runId)
      .then((chainData) => {
        if (canceled || !chainData) return
        setSelectedRunChainToolCalls(mapToolCallsFromChain(chainData))
      })
      .catch(() => {
        if (!canceled) setSelectedRunChainToolCalls(null)
      })
    return () => {
      canceled = true
    }
  }, [selectedRun?.runId])

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const [raw, latestTasks] = await Promise.all([
      loadLocalStore(dateFilter),
      fetchTasks({ limit: 100 }),
    ])
    setTasks(latestTasks)
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
      rootsSignatureRef.current = buildRunTreeSignature(tree)
      setRoots(tree)
      
      // Try to preserve selection
      if (selectedRunRef.current) {
        const found = findRunInTree(tree, selectedRunRef.current.runId)
        if (found) {
          setSelectedRun(found)
        } else if (tree.length > 0) {
          setSelectedRun(tree[0])
        } else {
          setSelectedRun(null)
        }
      } else if (tree.length > 0) {
        setSelectedRun(tree[0])
      } else {
        setSelectedRun(null)
      }
    }
    setLoading(false)
  }, [dateFilter])

  useEffect(() => {
    logRunListDebug('polling-effect-mounted', {})
    loadData()
    
    // 实时数据轮询 - 每 5 秒从真实 API 获取最新数据
    const pollInterval = setInterval(async () => {
      // 只有在没有日期过滤且在概览模式下才自动刷新，或者根据需求调整
      if (Object.keys(dateFilter).length === 0) {
        const realTimeData = await loadRealTimeData()
        if (realTimeData && realTimeData.requests.length > 0) {
          console.log('[Real-time] New data from API:', realTimeData.requests.length, 'requests')
          const tree = buildRunTree(realTimeData)
          const nextSignature = buildRunTreeSignature(tree)
          if (nextSignature === rootsSignatureRef.current) return
          rootsSignatureRef.current = nextSignature
          setRoots(tree)
          // 保持当前选中的 run（如果还存在）
          const currentSelectedRun = selectedRunRef.current
          if (currentSelectedRun) {
            const stillExists = findRunInTree(tree, currentSelectedRun.runId)
            if (stillExists) {
              setSelectedRun(stillExists)
            }
          }
        }
      }
    }, 5000) // 5 秒轮询一次
    
    return () => clearInterval(pollInterval)
  }, [loadData, dateFilter])

  const handleClearCache = async (all: boolean = false) => {
    if (!all && !dateFilter.date) {
      if (dateFilter.startDate || dateFilter.endDate) {
        message.warning('暂不支持清除日期范围，请先选择单个日期进行清除')
      } else {
        message.warning('请先选择要清除的日期')
      }
      return
    }

    Modal.confirm({
      title: '确认清除缓存',
      content: all ? '确定要清除所有缓存吗？此操作不可恢复。' : `确定要清除 ${dateFilter.date} 的缓存吗？此操作不可恢复。`,
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        setIsClearingCache(true)
        try {
          const params = new URLSearchParams()
          if (all) {
            params.append('all', 'true')
          } else if (dateFilter.date) {
            params.append('date', dateFilter.date)
          } else {
            message.warning('请先选择具体日期再清除缓存')
            setIsClearingCache(false)
            return
          }
    
          const res = await fetch(`/plugins/contextscope/api/cache?${params.toString()}`, {
            method: 'DELETE'
          })
          
          if (res.ok) {
            message.success('缓存清除成功')
            await loadData() // Reload data
            setShowDatePicker(false) // 关闭日期选择器
          } else {
            const err = await res.json()
            message.error(`清除失败: ${err.error}`)
          }
        } catch (e) {
          console.error('Failed to clear cache:', e)
          message.error('清除失败')
        } finally {
          setIsClearingCache(false)
        }
      }
    })
  }

  useEffect(() => {
    logRunListDebug('selected-run-changed', {
      selectedRunId: selectedRun?.runId ?? null,
      viewMode,
    })
  }, [selectedRun, viewMode])

  const totalTokens = selectedRun?.usage.total ?? 0
  const selectedRunToolCalls =
    selectedRunChainToolCalls !== null
      ? selectedRunChainToolCalls
      : (selectedRun?.toolCalls ?? [])
  const loadedCountLabel =
    leftPanelMode === 'task'
      ? `${taskMenuData.rootTaskIds.length} 个用户任务`
      : `${roots.length} 个大模型调用`
  const inputRatio =
    totalTokens > 0 ? (selectedRun!.usage.input / totalTokens) * 100 : 0
  const renderTaskMenuNode = (node: TaskMenuNode, depth: number = 0): JSX.Element | null => {
    const task = taskMenuData.taskById.get(node.taskId)
    if (!task) return null
    return (
      <div key={node.taskId}>
        <div className={cn('px-4', depth > 0 && 'pl-7')}>
          <button
            type="button"
            className={cn(
              'w-full mb-2 p-3 text-left rounded-xl border transition-all',
              selectedTaskId === task.taskId
                ? 'bg-blue-50 border-blue-200'
                : 'bg-white border-slate-200 hover:bg-slate-50'
            )}
            style={{ marginLeft: `${depth * 10}px` }}
            onClick={() => setSelectedTaskId(task.taskId)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="mono text-[11px] font-bold text-slate-700">
                {task.taskId.substring(0, 12)}...
              </span>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-semibold rounded-full border',
                  taskStatusClass[task.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                )}
              >
                {taskStatusText[task.status] || task.status}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
              <span>{formatFullTime(task.startTime)}</span>
              <span>
                {(task.stats.totalTokens || 0).toLocaleString()} Token
                {(node.children.length ?? 0) > 0
                  ? ` · +${node.children.length} subAgents`
                  : ''}
              </span>
            </div>
          </button>
        </div>
        {node.children.map((childNode) => renderTaskMenuNode(childNode, depth + 1))}
      </div>
    )
  }

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
          <div className="relative text-slate-600">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
                dateFilter.date || dateFilter.startDate 
                  ? "bg-blue-50 border-blue-200 text-blue-700" 
                  : "bg-white/10 border-white/20 text-slate-200 hover:bg-white/20"
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              {dateFilter.date 
                ? dateFilter.date 
                : dateFilter.startDate 
                  ? `${dateFilter.startDate} - ${dateFilter.endDate || 'Now'}` 
                  : "所有日期"
              }
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
            
            {showDatePicker && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 text-slate-600">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">单日选择</label>
                    <input 
                      type="date" 
                      className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      value={dateFilter.date || ''}
                      onChange={(e) => {
                        setDateFilter({ date: e.target.value })
                        setShowDatePicker(false)
                      }}
                    />
                  </div>
                  
                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink-0 mx-2 text-xs text-slate-300">OR</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">日期范围</label>
                    <div className="flex gap-2">
                      <input 
                        type="date" 
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        value={dateFilter.startDate || ''}
                        onChange={(e) => setDateFilter(prev => ({ ...prev, date: undefined, startDate: e.target.value }))}
                      />
                      <span className="self-center text-slate-400">-</span>
                      <input 
                        type="date" 
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        value={dateFilter.endDate || ''}
                        onChange={(e) => setDateFilter(prev => ({ ...prev, date: undefined, endDate: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-between">
                    <button
                      onClick={() => {
                        setDateFilter({})
                        setShowDatePicker(false)
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      重置
                    </button>
                    <button
                      onClick={() => setShowDatePicker(false)}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors shadow-sm shadow-blue-500/20"
                    >
                      确定
                    </button>
                  </div>
                  
                  <div className="pt-2 border-t border-slate-100 mt-2">
                     <p className="text-[10px] font-bold text-slate-400 mb-2">数据管理</p>
                     <div className="flex gap-2">
                       <button
                          onClick={() => handleClearCache(false)}
                          disabled={isClearingCache}
                          className={cn(
                            "flex-1 px-2 py-1.5 text-xs border rounded-lg flex items-center justify-center gap-1",
                            !dateFilter.date 
                              ? "border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50"
                              : "border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                          )}
                          title={dateFilter.date ? "清除当前选中日期的缓存" : "请先选择单个日期"}
                        >
                          <Trash2 className="w-3 h-3" />
                          清除当前
                        </button>
                       <button
                         onClick={() => handleClearCache(true)}
                         disabled={isClearingCache}
                         className="flex-1 px-2 py-1.5 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                         title="清除所有缓存数据"
                       >
                         <Trash2 className="w-3 h-3" />
                         清除所有
                       </button>
                     </div>
                  </div>
                </div>
              </div>
            )}
          </div>

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
                  : `已加载 ${loadedCountLabel}`}
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
                placeholder={leftPanelMode === 'task' ? '搜索用户任务 ID...' : '搜索大模型调用 ID...'}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="flex bg-slate-200 p-1 rounded-lg mt-3">
              <button
                type="button"
                onClick={() => setLeftPanelMode('task')}
                className={cn(
                  'flex-1 px-3 py-1 text-[11px] font-bold rounded-md transition-all',
                  leftPanelMode === 'task'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                用户任务视图
              </button>
              <button
                type="button"
                onClick={() => setLeftPanelMode('run')}
                className={cn(
                  'flex-1 px-3 py-1 text-[11px] font-bold rounded-md transition-all',
                  leftPanelMode === 'run'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                大模型调用视图
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
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
            {leftPanelMode === 'run' ? (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setLeftPanelMode('run')
                    setViewMode('overview')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setLeftPanelMode('run')
                      setViewMode('overview')
                    }
                  }}
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
                    查看所有大模型调用链的时间线与统计
                  </p>
                </div>
                <div className="px-4 py-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    大模型调用列表
                  </p>
                </div>
                {!loading && !loadError && roots.length === 0 && (
                  <div className="mx-4 p-4 text-slate-500 text-xs">
                    暂无大模型调用
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
                      setLeftPanelMode('run')
                      setViewMode('run')
                    }}
                  />
                ))}
              </>
            ) : (
              <>
                <div className="px-4 pt-4 pb-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    用户任务列表
                  </p>
                </div>
                {!loading && !loadError && taskMenuData.rootNodes.length === 0 && (
                  <div className="mx-4 p-4 text-slate-500 text-xs">
                    暂无用户任务
                  </div>
                )}
                {taskMenuData.rootNodes.map((node) => renderTaskMenuNode(node))}
              </>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
          <AnimatePresence mode="wait">
            {leftPanelMode === 'task' ? (
              !selectedTask ? (
                <motion.div
                  key="empty-task"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="max-w-5xl mx-auto py-20 text-center text-slate-500"
                >
                  在左侧点击一个用户任务查看详情
                </motion.div>
              ) : (
                <motion.div
                  key={selectedTask.taskId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="max-w-5xl mx-auto space-y-8"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h2 className="mono text-2xl font-bold text-slate-800 tracking-tight break-all">
                        {selectedTask.taskId}
                      </h2>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span className="mono text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {selectedTask.sessionId}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {formatFullTime(selectedTask.startTime)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          耗时 {formatDuration(selectedTask.duration)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'px-3 py-1 text-[11px] font-semibold rounded-full border',
                        taskStatusClass[selectedTask.status] || 'bg-slate-100 text-slate-700 border-slate-200'
                      )}
                    >
                      {taskStatusText[selectedTask.status] || selectedTask.status}
                    </span>
                  </div>
                  {(() => {
                    const model = selectedTaskWorkflowRun?.model || ''
                    const inputResult = calculateCost(model, selectedTask.stats.totalInput, 0)
                    const outputResult = calculateCost(model, 0, selectedTask.stats.totalOutput)
                    const totalResult = calculateCost(model, selectedTask.stats.totalInput, selectedTask.stats.totalOutput)
                    
                    return (
                      <div className="grid grid-cols-5 gap-4">
                        {[
                          { 
                            label: 'Input Tokens', 
                            value: selectedTask.stats.totalInput.toLocaleString(),
                            subValue: inputResult.matched ? formatCost(inputResult.cost) : '未匹配',
                            matched: inputResult.matched,
                            isCost: false 
                          },
                          { 
                            label: 'Output Tokens', 
                            value: selectedTask.stats.totalOutput.toLocaleString(),
                            subValue: outputResult.matched ? formatCost(outputResult.cost) : '未匹配',
                            matched: outputResult.matched,
                            isCost: false 
                          },
                          { 
                            label: 'Total Tokens', 
                            value: selectedTask.stats.totalTokens.toLocaleString(),
                            subValue: totalResult.matched ? formatCost(totalResult.cost) : '未匹配',
                            matched: totalResult.matched,
                            isCost: false 
                          },
                          { label: 'LLM Calls', value: selectedTask.stats.llmCalls.toLocaleString(), isCost: false },
                          { 
                            label: 'Total Cost', 
                            value: totalResult.matched ? formatCost(totalResult.cost) : '价格未匹配', 
                            matched: totalResult.matched,
                            isCost: true
                          },
                        ].map((stat) => (
                          <div
                            key={stat.label}
                            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"
                          >
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                              {stat.label}
                            </p>
                            {stat.subValue ? (
                              <>
                                <p className="text-lg font-bold text-slate-900 mono">
                                  {stat.value}
                                </p>
                                <p className={cn(
                                  "text-[11px] font-bold mono mt-0.5",
                                  stat.matched ? "text-emerald-600" : "text-slate-400 italic"
                                )}>
                                  {stat.subValue}
                                </p>
                              </>
                            ) : (
                              <p className={cn(
                                "text-2xl font-bold mono",
                                stat.isCost ? "text-emerald-600" : "text-slate-900"
                              )}>
                                {stat.value}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-3">用户发起任务（User Prompt）</h3>
                    {taskPromptLoading ? (
                      <p className="text-xs text-slate-500">加载中...</p>
                    ) : selectedTaskUserPrompt ? (
                      <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-6">
                          {selectedTaskUserPrompt}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">未获取到用户发起任务内容</p>
                    )}
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-3">LLM 输出（Output）</h3>
                    {taskPromptLoading ? (
                      <p className="text-xs text-slate-500">加载中...</p>
                    ) : selectedTaskLlmOutput ? (
                      <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-6">
                          {selectedTaskLlmOutput}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">未获取到 LLM 输出内容</p>
                    )}
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-2">任务调用链工作流</h3>
                    <p className="text-xs text-slate-500 mb-4">
                      按用户要求展示任务调用链（含工具与子代理节点）
                    </p>
                    {selectedTaskWorkflowRun ? (
                      <GitGraphVisualizer data={selectedTaskWorkflowRun} />
                    ) : (
                      <p className="text-xs text-slate-500">当前任务暂无可展示的调用链</p>
                    )}
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4">
                      关联大模型调用 ({selectedTask.runIds.length})
                    </h3>
                    {selectedTask.runIds.length === 0 ? (
                      <p className="text-xs text-slate-500">当前用户任务暂无大模型调用</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedTask.runIds.map((runId) => (
                          <button
                            type="button"
                            key={runId}
                            className="mono text-[11px] px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 hover:bg-blue-50 hover:border-blue-200"
                            onClick={() => {
                              const node = findRunInTree(roots, runId)
                              if (!node) {
                                message.warning('该大模型调用不在当前列表，请切换日期范围后重试')
                                return
                              }
                              setSelectedRun(node)
                              setLeftPanelMode('run')
                              setViewMode('run')
                            }}
                          >
                            {runId}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            ) : viewMode === 'overview' ? (
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
                  <button
                    type="button"
                    onClick={() => setOverviewTab('pricing')}
                    className={cn(
                      'px-4 py-2 text-xs font-bold rounded-lg transition-all',
                      overviewTab === 'pricing'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    )}
                  >
                    模型价格
                  </button>
                </div>
                {overviewTab === 'timeline' ? (
                  <GlobalOverview runs={roots} onLocate={handleLocate} />
                ) : overviewTab === 'treemap' ? (
                  <TokenTreemap runs={roots} />
                ) : (
                  <PricingTable />
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
                在左侧点击一个大模型调用查看详情
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
                  </div>
                </div>

                <>
                {(() => {
                  const inputResult = calculateCost(selectedRun.model || '', selectedRun.usage.input, 0)
                  const outputResult = calculateCost(selectedRun.model || '', 0, selectedRun.usage.output)
                  const totalResult = calculateCost(selectedRun.model || '', selectedRun.usage.input, selectedRun.usage.output)
                  
                  return (
                    <div className="grid grid-cols-5 gap-4">
                      {[
                        {
                          label: 'Input Tokens',
                          value: selectedRun.usage.input.toLocaleString(),
                          subValue: inputResult.matched ? formatCost(inputResult.cost) : '未匹配',
                          matched: inputResult.matched,
                          icon: <Layers className="w-4 h-4 text-blue-500" />,
                          color: 'blue',
                        },
                        {
                          label: 'Output Tokens',
                          value: selectedRun.usage.output.toLocaleString(),
                          subValue: outputResult.matched ? formatCost(outputResult.cost) : '未匹配',
                          matched: outputResult.matched,
                          icon: <Zap className="w-4 h-4 text-emerald-500" />,
                          color: 'emerald',
                        },
                        {
                          label: 'Total Tokens',
                          value: totalTokens.toLocaleString(),
                          subValue: totalResult.matched ? formatCost(totalResult.cost) : '未匹配',
                          matched: totalResult.matched,
                          icon: <Activity className="w-4 h-4 text-slate-500" />,
                          color: 'slate',
                          estimated: selectedRun.usageEstimated,
                        },
                        {
                          label: 'Requests',
                          value: selectedRun.requestCount.toLocaleString(),
                          icon: <Database className="w-4 h-4 text-amber-500" />,
                          color: 'amber',
                        },
                        {
                          label: 'Total Cost',
                          value: totalResult.matched ? formatCost(totalResult.cost) : '价格未匹配',
                          matched: totalResult.matched,
                          icon: <DollarSign className="w-4 h-4 text-emerald-600" />,
                          color: 'emerald',
                          isTotalCost: true,
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
                          {stat.subValue ? (
                            <>
                              <p className="text-lg font-bold text-slate-900 mono">
                                {stat.value}
                              </p>
                              <p className={cn(
                                "text-[11px] font-bold mono mt-0.5",
                                stat.matched ? "text-emerald-600" : "text-slate-400 italic"
                              )}>
                                {stat.subValue}
                              </p>
                            </>
                          ) : (
                            <p className={cn(
                              "text-2xl font-bold mono",
                              stat.isTotalCost ? "text-emerald-600" : "text-slate-900"
                            )}>
                              {stat.value}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })()}

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
                    工具调用序列 ({selectedRunToolCalls.length})
                  </h3>
                  {selectedRunToolCalls.length > 0 ? (
                    <div className="space-y-0 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                      {selectedRunToolCalls.map((tool, idx) => (
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
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* 价格计算规则说明按钮 */}
      <PricingInfo />
    </div>
  )
}
