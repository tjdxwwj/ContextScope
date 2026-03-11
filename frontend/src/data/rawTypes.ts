/**
 * 原始 requests.json 的顶层与数组元素类型（与插件 storage 一致）
 */

export interface RequestData {
  id?: number
  type: 'input' | 'output'
  runId: string
  sessionId: string
  sessionKey?: string
  provider: string
  model: string
  timestamp: number
  prompt?: string
  systemPrompt?: string
  historyMessages?: unknown[]
  assistantTexts?: string[]
  usage?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
    total?: number
    /** 部分数据源使用 totalTokens 而非 total */
    totalTokens?: number
  }
  imagesCount?: number
  metadata?: Record<string, unknown>
}

export interface SubagentLinkData {
  id?: number
  kind?: 'spawn' | 'send'
  parentRunId: string
  childRunId?: string
  parentSessionId?: string
  parentSessionKey?: string
  childSessionKey?: string
  runtime?: 'subagent' | 'acp'
  mode?: 'run' | 'session'
  label?: string
  toolCallId?: string
  timestamp: number
  endedAt?: number
  outcome?: 'success' | 'error' | 'timeout' | 'aborted' | 'unknown'
  error?: string
  metadata?: Record<string, unknown>
}

export interface ToolCallData {
  id?: number
  runId: string
  sessionId?: string
  sessionKey?: string
  toolName: string
  toolCallId?: string
  timestamp: number
  startedAt?: number
  durationMs?: number
  params?: Record<string, unknown>
  result?: unknown
  error?: string
  metadata?: Record<string, unknown>
}

/** 磁盘/JSON 里的完整结构 */
export interface RawStore {
  requests: RequestData[]
  subagentLinks: SubagentLinkData[]
  toolCalls: ToolCallData[]
  nextId?: number
  nextLinkId?: number
  nextToolCallId?: number
  lastUpdated?: number
}
