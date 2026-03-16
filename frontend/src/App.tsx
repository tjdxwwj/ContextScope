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

// ==================== Task Timeline 组件 ====================
interface TaskTimelineEvent {
  id: string
  type: 'run' | 'tool' | 'input' | 'output'
  startTime: number
  endTime: number
  label: string
  data: RunTreeNode | ChainToolCallSummary | { inputTokens: number; outputTokens: number; model?: string }
}

interface TaskTimelineProps {
  runs: RunTreeNode[]
  toolCalls: ChainToolCallSummary[]
  loading?: boolean
}

const TaskTimeline = ({ runs, toolCalls, loading = false }: TaskTimelineProps) => {
  const [selectedEvent, setSelectedEvent] = useState<TaskTimelineEvent | null>(null)
  
  const allEvents = useMemo(() => {
    const events: TaskTimelineEvent[] = []
    
    runs.forEach(run => {
      events.push({
        id: run.runId,
        type: 'run',
        startTime: run.startTime,
        endTime: run.endTime,
        label: `${run.runId.substring(0, 8)} (${run.model?.split('/').pop() ?? 'Unknown'})`,
        data: run,
      })
      
      if (run.usage.input > 0) {
        events.push({
          id: `${run.runId}-input`,
          type: 'input',
          startTime: run.startTime,
          endTime: run.startTime + 1000,
          label: `IN ${run.usage.input.toLocaleString()}`,
          data: { inputTokens: run.usage.input, outputTokens: 0, model: run.model },
        })
      }
      
      if (run.usage.output > 0) {
        events.push({
          id: `${run.runId}-output`,
          type: 'output',
          startTime: run.endTime - 1000,
          endTime: run.endTime,
          label: `OUT ${run.usage.output.toLocaleString()}`,
          data: { inputTokens: 0, outputTokens: run.usage.output, model: run.model },
        })
      }
    })
    
    toolCalls.forEach(tool => {
      events.push({
        id: tool.toolCallId ?? `${tool.timestamp}`,
        type: 'tool',
        startTime: tool.timestamp,
        endTime: tool.timestamp + (tool.durationMs ?? 0),
        label: tool.toolName,
        data: tool,
      })
    })
    
    return events.sort((a, b) => a.startTime - b.startTime)
  }, [runs, toolCalls])
  
  const handleEventClick = (event: TaskTimelineEvent) => {
    setSelectedEvent(event)
  }
  
  return (
    <>
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          任务执行时间线
        </h3>
        
        <div className="space-y-2">
          {allEvents.map(event => (
            <TimelineEventRow
              key={event.id}
              event={event}
              onClick={() => handleEventClick(event)}
            />
          ))}
        </div>
        
        {!loading && allEvents.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-8">暂无执行记录</p>
        )}
        {loading && (
          <p className="text-xs text-slate-500 text-center py-8">加载时间线中...</p>
        )}
      </div>
      
      {selectedEvent && (
        <TimelineEventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </>
  )
}

const TimelineEventRow = ({ event, onClick }: { event: TaskTimelineEvent; onClick: () => void }) => {
  const config = {
    run: { color: 'bg-blue-500', icon: Activity, label: 'LLM 调用' },
    input: { color: 'bg-emerald-500', icon: Layers, label: 'Input' },
    output: { color: 'bg-amber-500', icon: Zap, label: 'Output' },
    tool: { color: 'bg-purple-500', icon: Terminal, label: '工具调用' },
  }
  const tokenUsageText =
    event.type === 'run'
      ? `Σ ${(event.data as RunTreeNode).usage.total.toLocaleString()} tokens`
      : event.type === 'input'
      ? `Σ ${((event.data as { inputTokens: number }).inputTokens || 0).toLocaleString()} tokens`
      : event.type === 'output'
      ? `Σ ${((event.data as { outputTokens: number }).outputTokens || 0).toLocaleString()} tokens`
      : (() => {
          const usage = (event.data as ChainToolCallSummary).tokenUsage
          if (!usage) return 'Σ - tokens'
          return `Σ ${usage.total.toLocaleString()} tokens${usage.estimated ? ' (估算)' : ''}`
        })()
  
  const { color, icon: Icon, label } = config[event.type]
  
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors border border-slate-100 group"
    >
      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0', color)}>
        <Icon className="w-3 h-3" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-bold text-slate-800 truncate">{event.label}</span>
          <span className="text-[10px] text-slate-500 shrink-0">{formatTime(event.startTime)}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span>{label}</span>
          <span>•</span>
          <span>{tokenUsageText}</span>
          {event.type === 'tool' && (
            <>
              <span>•</span>
              <span>{(event.data as ChainToolCallSummary).durationMs}ms</span>
            </>
          )}
        </div>
      </div>
      
      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
    </div>
  )
}

const TimelineEventModal = ({ event, onClose }: { event: TaskTimelineEvent; onClose: () => void }) => {
  return (
    <Modal open={true} onCancel={onClose} footer={null} width={600} centered>
      <div className="p-4">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-3 h-3 rounded-full',
              event.type === 'run' ? 'bg-blue-500' :
              event.type === 'input' ? 'bg-emerald-500' :
              event.type === 'output' ? 'bg-amber-500' :
              'bg-purple-500'
            )} />
            <span className="text-sm font-bold uppercase text-slate-500">
              {event.type}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded transition-colors">
            <Minimize2 className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        
        {event.type === 'tool' && <ToolDetailContent tool={event.data as ChainToolCallSummary} />}
        {event.type === 'run' && <RunDetailContent run={event.data as RunTreeNode} />}
        {(event.type === 'input' || event.type === 'output') && (
          <TokenDetailContent data={event.data as any} type={event.type} />
        )}
      </div>
    </Modal>
  )
}

const ToolDetailContent = ({ tool }: { tool: ChainToolCallSummary }) => {
  const inputTokens = tool.tokenUsage?.input ?? 0
  const outputTokens = tool.tokenUsage?.output ?? 0
  const totalTokens = tool.tokenUsage?.total ?? 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Tool Name</p>
          <p className="text-sm font-bold text-slate-800 mono">{tool.toolName}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Duration</p>
          <p className="text-sm font-bold text-slate-800">{tool.durationMs}ms</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Timestamp</p>
          <p className="text-sm font-bold text-slate-800">{formatTime(tool.timestamp)}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Status</p>
          <span className={cn(
            'px-2 py-0.5 text-[10px] font-bold rounded-full',
            tool.error ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
          )}>
            {tool.error ? 'FAILED' : 'SUCCESS'}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] text-slate-500 uppercase font-bold">Token Usage</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-[9px] text-slate-500">Input</p>
            <p className="text-sm font-bold text-slate-800 mono">{inputTokens.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-[9px] text-slate-500">Output</p>
            <p className="text-sm font-bold text-slate-800 mono">{outputTokens.toLocaleString()}</p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2">
            <p className="text-[9px] text-purple-600">Total</p>
            <p className="text-sm font-bold text-purple-700 mono">{totalTokens.toLocaleString()}</p>
            <p className="text-[9px] text-purple-600">{tool.tokenUsage?.estimated ? '估算' : tool.tokenUsage ? '实际' : '-'}</p>
          </div>
        </div>
      </div>
      
      {tool.params && Object.keys(tool.params).length > 0 && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Parameters</p>
          <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
            {JSON.stringify(tool.params, null, 2)}
          </pre>
        </div>
      )}
      
      {tool.result && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Output</p>
          <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
            {tool.result}
          </pre>
        </div>
      )}
      
      {tool.error && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold mb-2">Error</p>
          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">
            {tool.error}
          </div>
        </div>
      )}
    </div>
  )
}

const RunDetailContent = ({ run }: { run: RunTreeNode }) => {
  const inputResult = calculateCost(run.model || '', run.usage.input, 0)
  const outputResult = calculateCost(run.model || '', 0, run.usage.output)
  const totalResult = calculateCost(run.model || '', run.usage.input, run.usage.output)
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Run ID</p>
          <p className="text-xs font-bold text-slate-800 mono">{run.runId}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Model</p>
          <p className="text-sm font-bold text-slate-800">{run.model || '-'}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Duration</p>
          <p className="text-sm font-bold text-slate-800">{Math.floor(run.endTime - run.startTime)}ms</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Status</p>
          <StatusBadge status={run.status} />
        </div>
      </div>
      
      <div className="space-y-2">
        <p className="text-[10px] text-slate-500 uppercase font-bold">Token Usage</p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-[9px] text-slate-500">Input</p>
            <p className="text-sm font-bold text-slate-800 mono">{run.usage.input.toLocaleString()}</p>
            <p className="text-[9px] font-mono text-emerald-600">{inputResult.matched ? formatCost(inputResult.cost) : '未匹配'}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-[9px] text-slate-500">Output</p>
            <p className="text-sm font-bold text-slate-800 mono">{run.usage.output.toLocaleString()}</p>
            <p className="text-[9px] font-mono text-emerald-600">{outputResult.matched ? formatCost(outputResult.cost) : '未匹配'}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
            <p className="text-[9px] text-emerald-600">Total</p>
            <p className="text-sm font-bold text-emerald-700 mono">{run.usage.total.toLocaleString()}</p>
            <p className="text-[9px] font-mono text-emerald-600">{totalResult.matched ? formatCost(totalResult.cost) : '未匹配'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const TokenDetailContent = ({ data, type }: { data: any; type: 'input' | 'output' }) => {
  const tokens = type === 'input' ? data.inputTokens : data.outputTokens
  const result = calculateCost(data.model || '', type === 'input' ? tokens : 0, type === 'output' ? tokens : 0)
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Type</p>
          <p className="text-sm font-bold text-slate-800">{type === 'input' ? 'Input Tokens' : 'Output Tokens'}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase font-bold">Model</p>
          <p className="text-sm font-bold text-slate-800">{data.model || '-'}</p>
        </div>
      </div>
      
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Tokens</p>
        <p className="text-2xl font-bold text-slate-800 mono">{tokens?.toLocaleString()}</p>
        <p className="text-[10px] font-mono text-emerald-600 mt-1">{result.matched ? formatCost(result.cost) : '价格未匹配'}</p>
      </div>
    </div>
  )
}
// ==================== Task Timeline 组件结束 ====================

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

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
const formatFullTime = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { hour12: false })
const logRunListDebug = (event: string, payload: Record<string, unknown> = {}) => {
  console.log(`[RunListDebug] ${event}`, payload)
}
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
                      inputResult.matched ? "text-emerald-600" : "text-slate-400 italic"
                    )}>
                      {inputResult.matched ? formatCost(inputResult.cost) : '未匹配'}
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
                      outputResult.matched ? "text-emerald-600" : "text-slate-400 italic"
                    )}>
                      {outputResult.matched ? formatCost(outputResult.cost) : '未匹配'}
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
                      totalResult.matched ? "text-emerald-600" : "text-slate-400 italic"
                    )}>
                      {totalResult.matched ? formatCost(totalResult.cost) : '未匹配'}
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

// ==================== 全局总览：执行时间线 + 统计 ====================
interface TimelineEvent {
  id: string
  type: 'run' | 'tool' | 'input' | 'output'
  startTime: number
  endTime: number
  label: string
  level: number
  data: RunTreeNode | { toolName: string; timestamp: number; durationMs?: number } | { inputTokens: number; outputTokens: number; model?: string }
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
      // Run 事件
      events.push({
        id: node.runId,
        type: 'run',
        startTime: node.startTime,
        endTime: node.endTime,
        label: node.runId.substring(0, 8),
        level,
        data: node,
      })
      
      // Input 事件
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
      
      // Output 事件
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
      
      // Tool Calls 事件
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
                      selectedEvent.type === 'run' ? 'bg-blue-500' :
                      selectedEvent.type === 'input' ? 'bg-emerald-500' :
                      selectedEvent.type === 'output' ? 'bg-amber-500' :
                      'bg-purple-500'
                    )}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {selectedEvent.type === 'input' ? 'Input' :
                     selectedEvent.type === 'output' ? 'Output' :
                     selectedEvent.type}
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
  const pollingInFlightRef = useRef(false)
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
  const [viewMode, setViewMode] = useState<'overview' | 'task'>('task')
  const [overviewTab, setOverviewTab] = useState<'timeline' | 'treemap' | 'pricing'>('timeline')
  const [dateFilter, setDateFilter] = useState<{ date?: string, startDate?: string, endDate?: string }>({})
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [selectedRunChainToolCalls, setSelectedRunChainToolCalls] = useState<ChainToolCallSummary[] | null>(null)
  const [selectedTaskToolCalls, setSelectedTaskToolCalls] = useState<ChainToolCallSummary[] | null>(null)
  const [selectedTaskResolvedRunIds, setSelectedTaskResolvedRunIds] = useState<string[]>([])
  const [selectedTaskRunsLoading, setSelectedTaskRunsLoading] = useState(false)
  
  useEffect(() => {
    ensurePricingLoaded()
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
      const ownerTask = tasks.find((task) => task.runIds.includes(runId))
      if (ownerTask) {
        setSelectedTaskId(ownerTask.taskId)
      }
      setLeftPanelMode('task')
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
  const selectedTaskWorkflowRun = useMemo(() => {
    if (!selectedTask) return null
    const workflowRoots = selectedTaskWorkflowRoots
    if (workflowRoots.length === 0) return null
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
  }, [selectedTask, selectedTaskWorkflowRoots])

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
        if (latestTasks.length === 0 && tree.length > 0) {
          setLeftPanelMode('task')
        }
        
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
        '实时数据加载超时，请确认 OpenClaw 网关与 /plugins/contextscope/api 可访问。'
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
      if (Object.keys(dateFilter).length === 0) {
        if (pollingInFlightRef.current) return
        pollingInFlightRef.current = true
        try {
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
      message.warning('请先选择要清除的日期')
      return
    }
    if (!all && selectedDates.length > 31) {
      message.warning('日期范围最多支持 31 天，请缩小范围后重试')
      return
    }
    const clearTargetText = all
      ? '所有缓存'
      : selectedDates.length === 1
        ? `${selectedDates[0]} 的缓存`
        : `${selectedDates[0]} 到 ${selectedDates[selectedDates.length - 1]} 的缓存（共 ${selectedDates.length} 天）`

    Modal.confirm({
      title: '确认清除缓存',
      content: `确定要清除 ${clearTargetText} 吗？此操作不可恢复。`,
      okText: '确定',
      cancelText: '取消',
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
              setLeftPanelMode('task')
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
                            !(dateFilter.date || dateFilter.startDate || dateFilter.endDate)
                              ? "border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50"
                              : "border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                          )}
                          title={dateFilter.date || dateFilter.startDate || dateFilter.endDate ? "清除当前选中日期或范围的缓存" : "请先选择日期或日期范围"}
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
                placeholder="搜索用户任务 ID..."
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
                setLeftPanelMode('run')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setViewMode('overview')
                  setLeftPanelMode('run')
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
                    const model = selectedTaskWorkflowRun?.model || ''
                    const inputResult = calculateCost(model, selectedTaskDisplayStats.totalInput, 0)
                    const outputResult = calculateCost(model, 0, selectedTaskDisplayStats.totalOutput)
                    const totalResult = calculateCost(model, selectedTaskDisplayStats.totalInput, selectedTaskDisplayStats.totalOutput)
                    
                    return (
                      <div className="grid grid-cols-5 gap-4">
                        {[
                          { 
                            label: 'Input Tokens', 
                            value: selectedTaskDisplayStats.totalInput.toLocaleString(),
                            subValue: inputResult.matched ? formatCost(inputResult.cost) : '未匹配',
                            matched: inputResult.matched,
                            isCost: false 
                          },
                          { 
                            label: 'Output Tokens', 
                            value: selectedTaskDisplayStats.totalOutput.toLocaleString(),
                            subValue: outputResult.matched ? formatCost(outputResult.cost) : '未匹配',
                            matched: outputResult.matched,
                            isCost: false 
                          },
                          { 
                            label: 'Total Tokens', 
                            value: selectedTaskDisplayStats.totalTokens.toLocaleString(),
                            subValue: totalResult.matched ? formatCost(totalResult.cost) : '未匹配',
                            matched: totalResult.matched,
                            isCost: false 
                          },
                          { label: 'LLM Calls', value: selectedTaskDisplayStats.llmCalls.toLocaleString(), isCost: false },
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
