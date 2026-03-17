import { useMemo, useState } from 'react'
import {
  Activity,
  ChevronRight,
  Clock,
  Layers,
  Minimize2,
  Terminal,
  Zap,
} from 'lucide-react'
import { Modal } from 'antd'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { RunTreeNode, ToolCallSummary } from '../data/runTree'
import { StatusBadge } from './StatusBadge'
import { calculateCost, formatCost } from '../utils/pricing'

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

interface TokenUsageData {
  inputTokens: number
  outputTokens: number
  model?: string
}

interface TaskTimelineEvent {
  id: string
  type: 'run' | 'tool' | 'input' | 'output'
  startTime: number
  endTime: number
  label: string
  data: RunTreeNode | ChainToolCallSummary | TokenUsageData
}

interface TaskTimelineProps {
  runs: RunTreeNode[]
  toolCalls: ChainToolCallSummary[]
  loading?: boolean
}

export const TaskTimeline = ({ runs, toolCalls, loading = false }: TaskTimelineProps) => {
  const [selectedEvent, setSelectedEvent] = useState<TaskTimelineEvent | null>(null)

  const allEvents = useMemo(() => {
    const events: TaskTimelineEvent[] = []

    runs.forEach((run) => {
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

    toolCalls.forEach((tool) => {
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

  return (
    <>
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          任务执行时间线
        </h3>

        <div className="space-y-2">
          {allEvents.map((event) => (
            <TimelineEventRow
              key={event.id}
              event={event}
              onClick={() => setSelectedEvent(event)}
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
      ? `Σ ${((event.data as TokenUsageData).inputTokens || 0).toLocaleString()} tokens`
      : event.type === 'output'
      ? `Σ ${((event.data as TokenUsageData).outputTokens || 0).toLocaleString()} tokens`
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
            <div
              className={cn(
                'w-3 h-3 rounded-full',
                event.type === 'run'
                  ? 'bg-blue-500'
                  : event.type === 'input'
                  ? 'bg-emerald-500'
                  : event.type === 'output'
                  ? 'bg-amber-500'
                  : 'bg-purple-500'
              )}
            />
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
          <TokenDetailContent data={event.data as TokenUsageData} type={event.type} />
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
          <span
            className={cn(
              'px-2 py-0.5 text-[10px] font-bold rounded-full',
              tool.error ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
            )}
          >
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

const TokenDetailContent = ({ data, type }: { data: TokenUsageData; type: 'input' | 'output' }) => {
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

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
