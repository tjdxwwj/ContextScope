/**
 * API Client - 连接真实后端服务
 * 从 OpenClaw Gateway 获取实时数据
 */

import type { RawStore, RequestData, SubagentLinkData, ToolCallData } from './rawTypes'

const API_BASE = '/plugins/contextscope/api'

export interface ChainResponse {
  runId: string
  sessionId: string
  provider: string
  model: string
  startTime: number
  endTime?: number
  duration?: number
  pagination: {
    limit: number
    offset: number
    total: number
    hasMore: boolean
  }
  chain: Array<{
    id: string
    runId: string
    parentRunId?: string
    type: 'input' | 'output' | 'tool_call' | 'tool_result' | 'subagent_spawn' | 'subagent_result'
    timestamp: number
    duration?: number
    input?: {
      prompt?: string
      systemPrompt?: string
      historyMessages?: unknown[]
      params?: unknown
      task?: string
    }
    output?: {
      text?: string
      assistantTexts?: string[]
      result?: unknown
      outcome?: string
    }
    usage?: {
      input: number
      output: number
      total: number
    }
    metadata?: {
      provider?: string
      model?: string
      toolName?: string
      agentId?: string
      status?: 'success' | 'error' | 'pending'
      error?: string
    }
  }>
  stats: {
    totalItems: number
    inputCount: number
    outputCount: number
    toolCallCount: number
    subagentCount: number
    totalTokens: number
  }
}

export interface DateFilter {
  date?: string
  startDate?: string
  endDate?: string
}

export type TaskStatus = 'running' | 'completed' | 'error' | 'timeout' | 'aborted'

export interface TaskStats {
  llmCalls: number
  toolCalls: number
  subagentSpawns: number
  totalInput: number
  totalOutput: number
  totalTokens: number
  estimatedCost: number
}

export interface TaskData {
  taskId: string
  sessionId: string
  sessionKey?: string
  parentTaskId?: string
  parentSessionId?: string
  startTime: number
  endTime?: number
  duration?: number
  status: TaskStatus
  endReason?: string
  error?: string
  stats: TaskStats
  runIds: string[]
  childTaskIds?: string[]
  childSessionIds?: string[]
  metadata?: {
    agentId?: string
    channelId?: string
    trigger?: string
    messageProvider?: string
    depth?: number
  }
}

export interface TaskTreeNode {
  task: TaskData
  children: TaskTreeNode[]
  aggregatedStats: TaskStats & {
    depth: number
    descendantCount: number
  }
}

export async function fetchTasks(params?: {
  sessionId?: string
  status?: string
  limit?: number
  offset?: number
}): Promise<TaskData[]> {
  try {
    const query = new URLSearchParams()
    if (params?.sessionId) query.append('sessionId', params.sessionId)
    if (params?.status) query.append('status', params.status)
    if (params?.limit != null) query.append('limit', String(params.limit))
    if (params?.offset != null) query.append('offset', String(params.offset))
    const suffix = query.toString() ? `?${query.toString()}` : ''
    const res = await fetch(`${API_BASE}/tasks${suffix}`)
    if (!res.ok) return []
    const data = await res.json()
    const payload = data?.data ?? data
    return Array.isArray(payload?.tasks) ? payload.tasks : []
  } catch (error) {
    console.error('Failed to fetch tasks:', error)
    return []
  }
}

export async function fetchTaskTree(taskId: string): Promise<TaskTreeNode | null> {
  try {
    const res = await fetch(`${API_BASE}/tasks/${encodeURIComponent(taskId)}/tree`)
    if (!res.ok) return null
    const data = await res.json()
    const payload = data?.data ?? data
    return payload?.tree ?? null
  } catch (error) {
    console.error('Failed to fetch task tree:', error)
    return null
  }
}

export async function fetchRequests(filter?: DateFilter): Promise<RawStore | null> {
  try {
    const params = new URLSearchParams()
    if (filter?.date) params.append('date', filter.date)
    if (filter?.startDate) params.append('startDate', filter.startDate)
    if (filter?.endDate) params.append('endDate', filter.endDate)

    const queryString = params.toString() ? `?${params.toString()}` : ''
    
    const res = await fetch(`${API_BASE}/requests${queryString}`)
    if (!res.ok) {
      console.error('API request failed:', res.status)
      return null
    }
    const data = await res.json()
    const requests: RequestData[] = Array.isArray(data.requests) ? data.requests : []
    let subagentLinks: SubagentLinkData[] = []
    let toolCalls: ToolCallData[] = []
    
    try {
      const linksRes = await fetch(`${API_BASE}/links${queryString}`)
      if (linksRes.ok) {
        const linksData = await linksRes.json()
        subagentLinks = linksData.links || linksData.subagentLinks || []
      }
    } catch (e) {
      console.debug('Failed to fetch links:', e)
    }
    
    try {
      const toolsRes = await fetch(`${API_BASE}/tool-calls${queryString}`)
      if (toolsRes.ok) {
        const toolsData = await toolsRes.json()
        toolCalls = toolsData.toolCalls || []
      }
    } catch (e) {
      console.debug('Failed to fetch tool calls:', e)
    }
    
    const result: RawStore = {
      requests,
      subagentLinks,
      toolCalls,
      nextId: typeof data.nextId === 'number' ? data.nextId : undefined,
      nextLinkId: typeof data.nextLinkId === 'number' ? data.nextLinkId : undefined,
      nextToolCallId: typeof data.nextToolCallId === 'number' ? data.nextToolCallId : undefined,
      lastUpdated: Date.now(),
    }
    
    console.log('[API] Fetched:', requests.length, 'requests,', subagentLinks.length, 'links,', toolCalls.length, 'toolCalls')
    if (requests.length > 0) {
      console.log('[API] Sample request:', JSON.stringify(requests[0], null, 2))
    }
    return result
  } catch (error) {
    console.error('Failed to fetch from API:', error)
    return null
  }
}

export async function fetchStats() {
  try {
    const res = await fetch(`${API_BASE}/stats`)
    if (!res.ok) return null
    return await res.json()
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    return null
  }
}

export async function fetchAnalysis(runId: string) {
  try {
    const res = await fetch(`${API_BASE}/analysis?runId=${encodeURIComponent(runId)}`)
    if (!res.ok) return null
    return await res.json()
  } catch (error) {
    console.error('Failed to fetch analysis:', error)
    return null
  }
}

export async function fetchChain(runId: string): Promise<ChainResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/chain/${encodeURIComponent(runId)}`)
    if (!res.ok) return null
    return await res.json()
  } catch (error) {
    console.error('Failed to fetch chain:', error)
    return null
  }
}

export interface ContextResponse {
  runId: string
  context: {
    systemPrompt: string
    userPrompt: string
    history: any[]
    toolCalls: any[]
    subagentLinks: any[]
  }
  tokenDistribution: {
    total: number
    breakdown: {
      systemPrompt: number
      userPrompt: number;
      history: number;
      toolResponses: number;
    }
    percentages: {
      systemPrompt: number;
      userPrompt: number;
      history: number;
      toolResponses: number;
    }
  }
  modelInfo: {
    name: string
    provider: string
    contextWindow: number
    estimatedCost: number
  }
  stats: {
    totalMessages: number
    totalTokens: number
    systemPromptPercentage: number
    historyPercentage: number;
    userPromptPercentage: number;
    toolResponsesPercentage: number;
  }
}

export async function fetchContext(runId: string): Promise<ContextResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/context?runId=${encodeURIComponent(runId)}`)
    if (!res.ok) return null
    return await res.json()
  } catch (error) {
    console.error('Failed to fetch context:', error)
    return null
  }
}
