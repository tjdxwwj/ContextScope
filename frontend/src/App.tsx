import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Activity,
  ChevronRight,
  ChevronDown,
  Clock,
  Database,
  Terminal,
  Layers,
  Search,
  Zap,
  LayoutDashboard,
  Calendar,
  DollarSign,
  RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { message, Modal } from 'antd'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ContextDistribution } from './components/ContextDistribution'
import { PricingTable } from './components/PricingTable'
import { PricingInfo } from './components/PricingInfo'
import { DateFilterPanel } from './components/DateFilterPanel'
import { StatusBadge } from './components/StatusBadge'
import { TaskTimeline } from './components/TaskTimeline'
import { TokenTreemap } from './components/TokenTreemap'
import { GlobalOverview } from './components/GlobalOverview'
import { loadLocalStore, loadRealTimeData } from './data/loadData'
import { LanguageSwitch, useI18n } from './i18n'
import {
  fetchChain,
  fetchTaskRunIds,
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

interface ChainToolCallSummary extends ToolCallSummary {
  runId: string
  result?: string
  status?: 'success' | 'error' | 'pending'
  tokenUsage?: {
    input: number
    output: number
    total: number
    estimated?: boolean
  }
}

const formatFullTime = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { hour12: false })
const logRunListDebug = (_event: string, _payload: Record<string, unknown> = {}) => {}
const asParamsRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}
const extractOutputTextFromItem = (item: ChainResponse['chain'][number]): string => {
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
  return ''
}
const extractLatestLlmOutputFromChain = (
  chainData: ChainResponse
): { text: string; timestamp: number } | null => {
  const items = [...chainData.chain].sort((a, b) => b.timestamp - a.timestamp)
  for (const item of items) {
    if (item.type !== 'output') continue
    const text = extractOutputTextFromItem(item)
    if (text) return { text, timestamp: item.timestamp }
  }
  return null
}
const mapToolCallsFromChain = (chainData: ChainResponse): ChainToolCallSummary[] => {
  const items = [...chainData.chain].sort((a, b) => a.timestamp - b.timestamp)
  const calls = new Map<string, ChainToolCallSummary>()
  for (const item of items) {
    if (item.type === 'tool_call') {
      const key = item.id || `${item.timestamp}-${item.metadata?.toolName || 'tool'}`
      const tokenUsage = extractToolTokenUsageFromItem(item)
      calls.set(key, {
        runId: item.runId,
        toolName: item.metadata?.toolName || 'Unknown Tool',
        toolCallId: item.id,
        timestamp: item.timestamp,
        durationMs: item.duration,
        params: asParamsRecord(item.input?.params),
        tokenUsage,
        status: item.metadata?.status,
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
      const resultText = extractOutputTextFromItem(item)
      const usageFromResult = extractToolTokenUsageFromItem(item)
      if (found) {
        if (item.duration != null) found.durationMs = item.duration
        if (resultText) found.result = resultText
        found.tokenUsage = mergeToolUsage(found.tokenUsage, usageFromResult)
        if (item.metadata?.status) found.status = item.metadata.status
        if (item.metadata?.status === 'error') {
          found.error = item.metadata.error || found.error || 'Tool call failed'
        }
      } else {
        const fallbackKey = key || `${item.runId}-${item.timestamp}-result`
        calls.set(fallbackKey, {
          runId: item.runId,
          toolName: item.metadata?.toolName || 'Unknown Tool',
          toolCallId: key,
          timestamp: item.timestamp,
          durationMs: item.duration,
          tokenUsage: usageFromResult,
          status: item.metadata?.status,
          result: resultText || undefined,
          error:
            item.metadata?.status === 'error'
              ? item.metadata.error || 'Tool call failed'
              : undefined,
        })
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
// 动态获取状态文本的函数，在组件内部使用 t() 函数
const getTaskStatusText = (t: (key: string) => string): Record<string, string> => ({
  completed: t('status.completed'),
  running: t('status.running'),
  error: t('status.error'),
  timeout: t('status.timeout'),
  aborted: t('status.aborted'),
})
const formatDuration = (durationMs?: number) => {
  if (durationMs == null || durationMs < 0) return '-'
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

// 从 pricing 工具导入（动态从 API 获取，无硬编码）
import { calculateCost, formatCost, ensurePricingLoaded } from './utils/pricing'

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
const toNonNegativeNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, value)
}
const extractUsageLike = (
  value: unknown
): { input: number; output: number; total: number } | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const input =
    toNonNegativeNumber(record.input) ??
    toNonNegativeNumber(record.prompt) ??
    toNonNegativeNumber(record.promptTokens) ??
    toNonNegativeNumber(record.prompt_tokens) ??
    toNonNegativeNumber(record.inputTokens) ??
    toNonNegativeNumber(record.input_tokens)
  const output =
    toNonNegativeNumber(record.output) ??
    toNonNegativeNumber(record.completion) ??
    toNonNegativeNumber(record.completionTokens) ??
    toNonNegativeNumber(record.completion_tokens) ??
    toNonNegativeNumber(record.outputTokens) ??
    toNonNegativeNumber(record.output_tokens)
  const total =
    toNonNegativeNumber(record.total) ??
    toNonNegativeNumber(record.totalTokens) ??
    toNonNegativeNumber(record.total_tokens)
  const hasAny = input != null || output != null || total != null
  if (!hasAny) return undefined
  const normalizedInput = input ?? 0
  const normalizedOutput = output ?? 0
  const normalizedTotal = total ?? normalizedInput + normalizedOutput
  return { input: normalizedInput, output: normalizedOutput, total: normalizedTotal }
}
const estimateTokensByText = (value: unknown): number => {
  if (value == null) return 0
  if (typeof value === 'string') return Math.max(0, Math.ceil(value.length / 4))
  try {
    const text = JSON.stringify(value)
    return text ? Math.max(0, Math.ceil(text.length / 4)) : 0
  } catch {
    return 0
  }
}
const extractToolTokenUsageFromItem = (
  item: ChainResponse['chain'][number]
): { input: number; output: number; total: number; estimated?: boolean } | undefined => {
  const fromUsage = extractUsageLike(item.usage)
  if (fromUsage) return fromUsage
  const fromOutputResult = extractUsageLike(item.output?.result)
  if (fromOutputResult) return fromOutputResult
  const inputEstimated = estimateTokensByText(item.input?.params)
  const outputEstimated = estimateTokensByText(item.output?.result) + estimateTokensByText(item.output?.text)
  const totalEstimated = inputEstimated + outputEstimated
  if (totalEstimated === 0) return undefined
  return {
    input: inputEstimated,
    output: outputEstimated,
    total: totalEstimated,
    estimated: true,
  }
}
const mergeToolUsage = (
  prev?: { input: number; output: number; total: number; estimated?: boolean },
  next?: { input: number; output: number; total: number; estimated?: boolean }
) => {
  if (!next) return prev
  if (!prev) return next
  const prevScore = prev.estimated ? 0 : prev.total + 1
  const nextScore = next.estimated ? 0 : next.total + 1
  if (nextScore >= prevScore) return next
  return prev
}
const buildRunTreeSignature = (tree: RunTreeNode[]): string =>
  tree
    .map((node) => `${node.runId}:${node.startTime}:${node.endTime}:${node.children.length}:${node.requestCount}`)
    .join('|')
const collectRunSubtree = (nodes: RunTreeNode[]): RunTreeNode[] => {
  const result: RunTreeNode[] = []
  const seen = new Set<string>()
  const walk = (node: RunTreeNode) => {
    if (seen.has(node.runId)) return
    seen.add(node.runId)
    result.push(node)
    node.children.forEach((child) => walk(child))
  }
  nodes.forEach((node) => walk(node))
  return result
}
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

const resolveDateFilterRange = (filter: { date?: string; startDate?: string; endDate?: string }) => {
  if (filter.date) {
    const start = new Date(`${filter.date}T00:00:00.000`).getTime()
    const end = new Date(`${filter.date}T23:59:59.999`).getTime()
    return { start, end }
  }
  const start = filter.startDate ? new Date(`${filter.startDate}T00:00:00.000`).getTime() : undefined
  const end = filter.endDate ? new Date(`${filter.endDate}T23:59:59.999`).getTime() : undefined
  return { start, end }
}

const filterTasksByDate = (
  tasks: TaskData[],
  filter: { date?: string; startDate?: string; endDate?: string }
) => {
  const { start, end } = resolveDateFilterRange(filter)
  if (start === undefined && end === undefined) return tasks
  return tasks.filter((task) => {
    if (start !== undefined && task.startTime < start) return false
    if (end !== undefined && task.startTime > end) return false
    return true
  })
}

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getTodayDateFilter = () => ({ date: formatDateInputValue(new Date()) })



export default function App() {
  const { lang, t } = useI18n()
  
  // Use language to format dates
  const formatDate = (ts: number) =>
    new Date(ts).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour12: false })
  
  // Get localized status text
  const taskStatusText = getTaskStatusText(t)
  const [roots, setRoots] = useState<RunTreeNode[]>([])
  const rootsSignatureRef = useRef('')
  const pollingInFlightRef = useRef(false)
  const [tasks, setTasks] = useState<TaskData[]>([])
  const [selectedRun, setSelectedRun] = useState<RunTreeNode | null>(null)
  const selectedRunRef = useRef<RunTreeNode | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskUserPrompt, setSelectedTaskUserPrompt] = useState<string | null>(null)
  const [selectedTaskLlmOutput, setSelectedTaskLlmOutput] = useState<string | null>(null)
  const [taskPromptLoading, setTaskPromptLoading] = useState(false)
  const leftPanelMode = 'task' as const
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'overview' | 'task'>('task')
  const [overviewTab, setOverviewTab] = useState<'timeline' | 'treemap' | 'pricing'>('timeline')
  const [dateFilter, setDateFilter] = useState<{ date?: string, startDate?: string, endDate?: string }>(() => getTodayDateFilter())
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [selectedRunChainToolCalls, setSelectedRunChainToolCalls] = useState<ChainToolCallSummary[] | null>(null)
  const [selectedTaskToolCalls, setSelectedTaskToolCalls] = useState<ChainToolCallSummary[] | null>(null)
  const [selectedTaskResolvedRunIds, setSelectedTaskResolvedRunIds] = useState<string[]>([])
  const [selectedTaskRunsLoading, setSelectedTaskRunsLoading] = useState(false)
  
  // 价格加载状态
  const [pricingLoading, setPricingLoading] = useState(true)
  const [pricingError, setPricingError] = useState<string | null>(null)
  
  useEffect(() => {
    const loadPricing = async () => {
      try {
        setPricingLoading(true)
        setPricingError(null)
        await ensurePricingLoaded()
        setPricingLoading(false)
      } catch (error) {
        setPricingError(t('msg.pricingLoadFailed'))
        setPricingLoading(false)
      }
    }
    loadPricing()
  }, [])
  
  const handleRetryPricing = async () => {
    try {
      setPricingLoading(true)
      setPricingError(null)
      await ensurePricingLoaded()
      setPricingLoading(false)
    } catch (error) {
      setPricingError(t('msg.pricingLoadFailed'))
      setPricingLoading(false)
    }
  }

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
      const ownerTask = tasks.find((task) => task.runIds.includes(runId))
      if (ownerTask) {
        setSelectedTaskId(ownerTask.taskId)
      }
      setViewMode('task')
      setTimeout(() => {
        const el = document.getElementById(`run-item-${runId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2')
          setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2'), 2000)
        }
      }, 100)
    }
  }, [roots, tasks])

  useEffect(() => {
    selectedRunRef.current = selectedRun
  }, [selectedRun])

  const taskMenuData = useMemo(() => deriveTaskMenuData(tasks, roots), [tasks, roots])
  const selectedTask = useMemo(
    () => (selectedTaskId ? taskMenuData.taskById.get(selectedTaskId) ?? null : null),
    [selectedTaskId, taskMenuData]
  )
  const selectedTaskStats = useMemo(() => {
    if (!selectedTask) {
      return {
        llmCalls: 0,
        toolCalls: 0,
        subagentSpawns: 0,
        totalInput: 0,
        totalOutput: 0,
        totalTokens: 0,
        estimatedCost: 0,
      }
    }
    return {
      llmCalls: selectedTask.stats?.llmCalls ?? 0,
      toolCalls: selectedTask.stats?.toolCalls ?? 0,
      subagentSpawns: selectedTask.stats?.subagentSpawns ?? 0,
      totalInput: selectedTask.stats?.totalInput ?? 0,
      totalOutput: selectedTask.stats?.totalOutput ?? 0,
      totalTokens: selectedTask.stats?.totalTokens ?? 0,
      estimatedCost: selectedTask.stats?.estimatedCost ?? 0,
    }
  }, [selectedTask])
  useEffect(() => {
    const controller = new AbortController()
    if (!selectedTask) {
      setSelectedTaskRunsLoading(false)
      setSelectedTaskResolvedRunIds([])
      return
    }
    if (selectedTask.runIds.length > 0) {
      setSelectedTaskRunsLoading(false)
      setSelectedTaskResolvedRunIds(selectedTask.runIds)
      return
    }
    setSelectedTaskRunsLoading(true)
    ;(async () => {
      const fallbackRunIds = await fetchTaskRunIds(selectedTask.taskId, 400)
      if (controller.signal.aborted) return
      setSelectedTaskResolvedRunIds(fallbackRunIds)
      setSelectedTaskRunsLoading(false)
    })()
    return () => {
      controller.abort()
    }
  }, [selectedTask])
  const selectedTaskRunNodes = useMemo(
    () =>
      selectedTask
        ? selectedTaskResolvedRunIds
            .map((runId) => findRunInTree(roots, runId))
            .filter((runNode): runNode is RunTreeNode => runNode != null)
        : [],
    [selectedTask, selectedTaskResolvedRunIds, roots]
  )
  const selectedTaskWorkflowRoots = useMemo(() => {
    if (selectedTaskRunNodes.length === 0) return []
    const runIdSet = new Set(selectedTaskRunNodes.map((runNode) => runNode.runId))
    const childIdSet = new Set<string>()
    selectedTaskRunNodes.forEach((runNode) => {
      runNode.children.forEach((child) => {
        if (runIdSet.has(child.runId)) childIdSet.add(child.runId)
      })
    })
    const rootRuns = selectedTaskRunNodes.filter((runNode) => !childIdSet.has(runNode.runId))
    return rootRuns.length > 0 ? rootRuns : selectedTaskRunNodes
  }, [selectedTaskRunNodes])
  const selectedTaskAllRunNodes = useMemo(
    () => collectRunSubtree(selectedTaskWorkflowRoots),
    [selectedTaskWorkflowRoots]
  )
  const selectedTaskAllRunIds = useMemo(
    () => selectedTaskAllRunNodes.map((runNode) => runNode.runId),
    [selectedTaskAllRunNodes]
  )
  const selectedTaskDataLoading = selectedTaskRunsLoading || taskPromptLoading
  const selectedTaskFallbackToolCalls = useMemo<ChainToolCallSummary[]>(
    () =>
      selectedTaskAllRunNodes.flatMap((runNode) =>
        runNode.toolCalls.map((tool, idx) => ({
          ...tool,
          runId: runNode.runId,
          toolCallId: tool.toolCallId ?? `${runNode.runId}-${tool.timestamp}-${idx}`,
          status: (tool.error ? 'error' : 'success') as 'error' | 'success',
        }))
      ),
    [selectedTaskAllRunNodes]
  )
  const selectedTaskDisplayStats = useMemo(() => {
    const aggregated = selectedTaskAllRunNodes.reduce(
      (acc, runNode) => ({
        totalInput: acc.totalInput + runNode.usage.input,
        totalOutput: acc.totalOutput + runNode.usage.output,
        totalTokens: acc.totalTokens + runNode.usage.total,
      }),
      { totalInput: 0, totalOutput: 0, totalTokens: 0 }
    )
    const taskTokenSum = selectedTaskStats.totalInput + selectedTaskStats.totalOutput
    const displayInput = selectedTaskStats.totalInput > 0 ? selectedTaskStats.totalInput : aggregated.totalInput
    const displayOutput = selectedTaskStats.totalOutput > 0 ? selectedTaskStats.totalOutput : aggregated.totalOutput
    const displayTotal =
      selectedTaskStats.totalTokens > 0
        ? selectedTaskStats.totalTokens
        : taskTokenSum > 0
          ? taskTokenSum
          : aggregated.totalTokens
    return {
      ...selectedTaskStats,
      llmCalls: Math.max(selectedTaskStats.llmCalls, selectedTaskAllRunNodes.length),
      toolCalls: Math.max(selectedTaskStats.toolCalls, selectedTaskFallbackToolCalls.length),
      totalInput: displayInput,
      totalOutput: displayOutput,
      totalTokens: displayTotal,
    }
  }, [selectedTaskStats, selectedTaskAllRunNodes, selectedTaskFallbackToolCalls])

  useEffect(() => {
    const controller = new AbortController()
    if (!selectedTask || selectedTaskAllRunIds.length === 0) {
      setSelectedTaskUserPrompt(null)
      setSelectedTaskLlmOutput(null)
      setSelectedTaskToolCalls(null)
      setTaskPromptLoading(false)
      return
    }

    const runCandidates = [...selectedTaskAllRunIds]

    setTaskPromptLoading(true)
    setSelectedTaskUserPrompt(null)
    setSelectedTaskLlmOutput(null)
    setSelectedTaskToolCalls(null)

    ;(async () => {
      let foundPrompt: string | null = null
      let latestOutput: { text: string; timestamp: number } | null = null
      const allToolCalls: ChainToolCallSummary[] = []
      try {
        for (const runId of runCandidates) {
          if (controller.signal.aborted) break
          const chainData = await fetchChain(runId, { signal: controller.signal, timeoutMs: 12000 })
          if (!chainData) continue
          allToolCalls.push(...mapToolCallsFromChain(chainData))
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
          const outputCandidate = extractLatestLlmOutputFromChain(chainData)
          if (outputCandidate && (!latestOutput || outputCandidate.timestamp > latestOutput.timestamp)) {
            latestOutput = outputCandidate
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Failed to fetch task prompts from chain:', error)
        }
      }
      if (!controller.signal.aborted) setSelectedTaskUserPrompt(foundPrompt)
      if (!controller.signal.aborted) setSelectedTaskLlmOutput(latestOutput?.text ?? null)
      if (!controller.signal.aborted) {
        const merged = [...selectedTaskFallbackToolCalls, ...allToolCalls]
        const deduped = new Map<string, ChainToolCallSummary>()
        for (const tool of merged) {
          const key = `${tool.toolCallId ?? ''}:${tool.runId}:${tool.timestamp}:${tool.toolName}`
          deduped.set(key, tool)
        }
        setSelectedTaskToolCalls(Array.from(deduped.values()).sort((a, b) => a.timestamp - b.timestamp))
      }
      if (!controller.signal.aborted) setTaskPromptLoading(false)
    })()

    return () => {
      controller.abort()
    }
  }, [selectedTask, selectedTaskAllRunIds, selectedTaskFallbackToolCalls])

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
    const controller = new AbortController()
    if (!selectedRun?.runId) {
      setSelectedRunChainToolCalls(null)
      return
    }
    setSelectedRunChainToolCalls(null)
    fetchChain(selectedRun.runId, { signal: controller.signal, timeoutMs: 12000 })
      .then((chainData) => {
        if (controller.signal.aborted || !chainData) return
        setSelectedRunChainToolCalls(mapToolCallsFromChain(chainData))
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Failed to fetch selected run chain:', error)
        }
        setSelectedRunChainToolCalls(null)
      })
    return () => {
      controller.abort()
    }
  }, [selectedRun?.runId])

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [raw, latestTasks] = await Promise.all([
        loadLocalStore(dateFilter),
        fetchTasks({ limit: 100 }),
      ])
      setTasks(filterTasksByDate(latestTasks, dateFilter))
      if (!raw) {
        setLoadError(
          t('msg.connectionError')
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
    } catch (error) {
      console.error('Failed to load initial data:', error)
      setLoadError(
        t('msg.timeoutError')
      )
      setRoots([])
      setSelectedRun(null)
    } finally {
      setLoading(false)
    }
  }, [dateFilter])

  useEffect(() => {
    logRunListDebug('polling-effect-mounted', {})
    loadData()
    
    // 实时数据轮询 - 每 5 秒从真实 API 获取最新数据
    const pollInterval = setInterval(async () => {
      // 只有在没有日期过滤且在概览模式下才自动刷新，或者根据需求调整
      const currentDate = formatDateInputValue(new Date())
      const isTodayFilter =
        dateFilter.date === currentDate &&
        !dateFilter.startDate &&
        !dateFilter.endDate
      if (Object.keys(dateFilter).length === 0 || isTodayFilter) {
        if (pollingInFlightRef.current) return
        pollingInFlightRef.current = true
        try {
          const realTimeData = await loadRealTimeData()
          if (realTimeData && realTimeData.requests.length > 0) {
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
        } finally {
          pollingInFlightRef.current = false
        }
      }
    }, 15000)
    
    return () => clearInterval(pollInterval)
  }, [loadData, dateFilter])

  const handleClearCache = async (all: boolean = false) => {
    const selectedDates = (() => {
      if (dateFilter.date) return [dateFilter.date]
      const start = dateFilter.startDate
      const end = dateFilter.endDate
      if (!start && !end) return []
      const rangeStart = start ?? end!
      const rangeEnd = end ?? start!
      const from = new Date(`${rangeStart}T00:00:00.000`)
      const to = new Date(`${rangeEnd}T00:00:00.000`)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return []
      const [minTime, maxTime] = from.getTime() <= to.getTime()
        ? [from.getTime(), to.getTime()]
        : [to.getTime(), from.getTime()]
      const dates: string[] = []
      for (let cursor = minTime; cursor <= maxTime; cursor += 24 * 60 * 60 * 1000) {
        dates.push(new Date(cursor).toISOString().slice(0, 10))
      }
      return dates
    })()
    if (!all && selectedDates.length === 0) {
      message.warning(t('msg.selectDate'))
      return
    }
    if (!all && selectedDates.length > 31) {
      message.warning(t('msg.dateRangeLimit'))
      return
    }
    const clearTargetText = all
      ? t('msg.clearAllCache')
      : selectedDates.length === 1
        ? `${selectedDates[0]}`
        : `${selectedDates[0]} - ${selectedDates[selectedDates.length - 1]} (${selectedDates.length} days)`

    Modal.confirm({
      title: t('msg.confirmClearCache'),
      content: `Clear ${clearTargetText}? This action cannot be undone.`,
      okText: t('msg.ok'),
      cancelText: t('msg.cancel'),
      okType: 'danger',
      onOk: async () => {
        setIsClearingCache(true)
        try {
          if (all) {
            const params = new URLSearchParams()
            params.append('all', 'true')
            const res = await fetch(`/plugins/contextscope/api/cache?${params.toString()}`, {
              method: 'DELETE'
            })
            if (!res.ok) {
              const err = await res.json()
              message.error(`清除失败: ${err.error}`)
              return
            }
            message.success('缓存清除成功')
          } else {
            for (const date of selectedDates) {
              const params = new URLSearchParams()
              params.append('date', date)
              const res = await fetch(`/plugins/contextscope/api/cache?${params.toString()}`, {
                method: 'DELETE'
              })
              if (!res.ok) {
                const err = await res.json()
                message.error(`清除失败: ${err.error}`)
                return
              }
            }
            message.success(`缓存清除成功（${selectedDates.length} 天）`)
          }
          await loadData()
          setShowDatePicker(false)
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
  const loadedCountLabel = `${taskMenuData.rootTaskIds.length} 个用户任务`
  const runTokenUsageById = useMemo(() => {
    const usageMap = new Map<string, number>()
    const walk = (node: RunTreeNode) => {
      usageMap.set(node.runId, node.usage.total)
      node.children.forEach((child) => walk(child))
    }
    roots.forEach((rootNode) => walk(rootNode))
    return usageMap
  }, [roots])
  const inputRatio =
    totalTokens > 0 ? (selectedRun!.usage.input / totalTokens) * 100 : 0
  const renderTaskMenuNode = (node: TaskMenuNode, depth: number = 0): JSX.Element | null => {
    const task = taskMenuData.taskById.get(node.taskId)
    if (!task) return null
    const fallbackTokenTotal = task.runIds.reduce(
      (sum, runId) => sum + (runTokenUsageById.get(runId) ?? 0),
      0
    )
    const displayTokenTotal = task.stats.totalTokens > 0 ? task.stats.totalTokens : fallbackTokenTotal
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
            onClick={() => {
              setSelectedTaskId(task.taskId)
              setViewMode('task')
            }}
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
                {displayTokenTotal.toLocaleString()} Token
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
                  : t('msg.allDates')
              }
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
            
            <DateFilterPanel
              show={showDatePicker}
              dateFilter={dateFilter}
              isClearingCache={isClearingCache}
              onSetSingleDate={(date) => {
                setDateFilter({ date })
                setShowDatePicker(false)
              }}
              onSetStartDate={(startDate) =>
                setDateFilter((prev) => ({ ...prev, date: undefined, startDate }))
              }
              onSetEndDate={(endDate) =>
                setDateFilter((prev) => ({ ...prev, date: undefined, endDate }))
              }
              onReset={() => {
                setDateFilter({})
                setShowDatePicker(false)
              }}
              onClose={() => setShowDatePicker(false)}
              onClearCurrent={() => handleClearCache(false)}
              onClearAll={() => handleClearCache(true)}
            />
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
                ? t('msg.loading')
                : loadError
                  ? t('msg.noData')
                  : `${t('msg.loaded')} ${loadedCountLabel}`}
            </span>
          </div>
          
          {/* Language Switch */}
          <LanguageSwitch />
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
                placeholder={t('ui.searchTask')}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
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
            
            {/* 全局总览入口 */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setViewMode('overview')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
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
                查看所有用户任务的时间线与统计
              </p>
            </div>
            
            {/* 用户任务列表 */}
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
            {loading && !loadError && (
              <div className="mx-4 p-4 text-slate-500 text-xs animate-pulse">
                用户任务加载中...
              </div>
            )}
            {taskMenuData.rootNodes.map((node) => renderTaskMenuNode(node))}
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
            ) : leftPanelMode === 'task' ? (
              !selectedTask ? (
                <motion.div
                  key="empty-task"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="max-w-5xl mx-auto py-20 text-center text-slate-500"
                >
                  {loading ? (
                    <div className="inline-flex items-center gap-2 text-slate-500">
                      <Activity className="w-4 h-4 animate-spin" />
                      <span>数据加载中，请稍候...</span>
                    </div>
                  ) : (
                    '在左侧点击一个用户任务查看详情'
                  )}
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
                    const model = selectedTaskWorkflowRoots[0]?.model || ''
                    const inputResult = calculateCost(model, selectedTaskDisplayStats.totalInput, 0)
                    const outputResult = calculateCost(model, 0, selectedTaskDisplayStats.totalOutput)
                    const totalResult = calculateCost(model, selectedTaskDisplayStats.totalInput, selectedTaskDisplayStats.totalOutput)
                    
                    return (
                      <div className="grid grid-cols-5 gap-4">
                        {[
                          { 
                            label: 'Input Tokens', 
                            value: selectedTaskDisplayStats.totalInput.toLocaleString(),
                            cost: inputResult.matched ? formatCost(inputResult.cost) : '未匹配',
                            matched: inputResult.matched,
                          },
                          { 
                            label: 'Output Tokens', 
                            value: selectedTaskDisplayStats.totalOutput.toLocaleString(),
                            cost: outputResult.matched ? formatCost(outputResult.cost) : '未匹配',
                            matched: outputResult.matched,
                          },
                          { 
                            label: 'Total Tokens', 
                            value: selectedTaskDisplayStats.totalTokens.toLocaleString(),
                            cost: totalResult.matched ? formatCost(totalResult.cost) : '未匹配',
                            matched: totalResult.matched,
                          },
                          { label: 'LLM Calls', value: selectedTaskDisplayStats.llmCalls.toLocaleString() },
                          { 
                            label: 'Total Cost', 
                            value: pricingLoading ? (
                              <span className="flex items-center gap-2 text-lg">
                                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                                <span className="text-slate-400">加载中...</span>
                              </span>
                            ) : pricingError ? (
                              <button
                                onClick={handleRetryPricing}
                                className="text-lg text-rose-600 hover:text-rose-700 flex items-center gap-2 transition-colors"
                                title="点击重试"
                              >
                                <RefreshCw className="w-4 h-4" />
                                <span>加载失败，点击重试</span>
                              </button>
                            ) : (
                              totalResult.matched ? formatCost(totalResult.cost) : '价格未匹配'
                            ),
                          },
                        ].map((stat) => (
                          <div
                            key={stat.label}
                            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"
                          >
                            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
                              {stat.label}
                            </p>
                            {'cost' in stat && typeof stat.cost === 'string' ? (
                              <>
                                <p className="text-lg font-bold text-slate-900 mono">
                                  {stat.value}
                                </p>
                                <p className={cn(
                                  "text-[11px] font-bold mono mt-0.5",
                                  pricingLoading ? "text-slate-400" :
                                  pricingError ? "text-rose-600" :
                                  stat.matched ? "text-emerald-600" : "text-slate-400 italic"
                                )}>
                                  {pricingLoading ? (
                                    <span className="flex items-center gap-1">
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                      加载中...
                                    </span>
                                  ) : pricingError ? (
                                    <button
                                      onClick={handleRetryPricing}
                                      className="hover:underline flex items-center gap-1"
                                      title="点击重试"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      加载失败，点击重试
                                    </button>
                                  ) : (
                                    stat.cost
                                  )}
                                </p>
                              </>
                            ) : (
                              <p className="text-2xl font-bold mono text-slate-900">
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
                    {selectedTaskDataLoading ? (
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
                    <h3 className="text-sm font-bold text-slate-800 mb-3">最终文字回复（Final Output）</h3>
                    {selectedTaskDataLoading ? (
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
                  
                  {/* Context 分析 */}
                  {selectedTaskResolvedRunIds.length > 0 && (
                    <ContextDistribution runId={selectedTaskResolvedRunIds[0]} />
                  )}
                  {selectedTaskDataLoading && selectedTaskResolvedRunIds.length === 0 && (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <p className="text-xs text-slate-500">加载上下文分析中...</p>
                    </div>
                  )}
                  {!selectedTaskDataLoading && selectedTaskResolvedRunIds.length === 0 && (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                      <p className="text-xs text-slate-500">暂无可用调用链上下文</p>
                    </div>
                  )}
                  
                  <TaskTimeline 
                    runs={selectedTaskAllRunNodes}
                    toolCalls={selectedTaskToolCalls ?? []}
                    loading={selectedTaskDataLoading}
                  />
                  
                </motion.div>
              )
            ) : !selectedRun ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="max-w-5xl mx-auto py-20 text-center text-slate-500"
              >
                {loading ? (
                  <div className="inline-flex items-center gap-2 text-slate-500">
                    <Activity className="w-4 h-4 animate-spin" />
                    <span>数据加载中，请稍候...</span>
                  </div>
                ) : (
                  '在左侧点击一个大模型调用查看详情'
                )}
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
                        <span>{formatDate(selectedRun.endTime)}</span>
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
                                  {formatDate(tool.timestamp)}
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
