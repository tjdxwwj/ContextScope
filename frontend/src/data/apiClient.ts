/**
 * API Client - 连接真实后端服务
 * 从 OpenClaw Gateway 获取实时数据
 */

import type { RawStore, RequestData, SubagentLinkData, ToolCallData } from './rawTypes'

const API_BASE = '/plugins/contextscope/api'
const CONTEXT_CACHE_TTL_MS = 8000
const CONTEXT_FETCH_MAX_ATTEMPTS = 2
const CONTEXT_FETCH_RETRY_DELAY_MS = 300
const CHAIN_CACHE_TTL_MS = 8000
const CHAIN_FETCH_MAX_ATTEMPTS = 2
const CHAIN_FETCH_RETRY_DELAY_MS = 300

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

export async function fetchChain(
  runId: string,
  options?: { signal?: AbortSignal; timeoutMs?: number; cacheTtlMs?: number }
): Promise<ChainResponse | null> {
  if (!runId) return null

  const now = Date.now()
  const cacheEntry = chainCache.get(runId)
  if (cacheEntry && cacheEntry.expiresAt > now) {
    return cacheEntry.data
  }
  const staleCacheData = cacheEntry?.data ?? null

  let inflightRequest = chainRequestInflight.get(runId)
  if (!inflightRequest) {
    const requestStartedAt = Date.now()
    const fallbackData = cacheEntry?.data ?? null
    inflightRequest = (async () => {
      let attempt = 1
      while (attempt <= CHAIN_FETCH_MAX_ATTEMPTS) {
        const attemptController = new AbortController()
        let timeoutTriggered = false
        const baseTimeoutMs = options?.timeoutMs ?? 10000
        const attemptTimeoutMs = baseTimeoutMs + (attempt - 1) * 8000
        const timeoutId = window.setTimeout(() => {
          timeoutTriggered = true
          attemptController.abort()
        }, attemptTimeoutMs)
        try {
          const res = await fetch(`${API_BASE}/chain/${encodeURIComponent(runId)}`, {
            signal: attemptController.signal,
          })
          if (!res.ok) {
            if (attempt < CHAIN_FETCH_MAX_ATTEMPTS) {
              attempt += 1
              await new Promise((resolve) => window.setTimeout(resolve, CHAIN_FETCH_RETRY_DELAY_MS))
              continue
            }
            return fallbackData
          }
          const payload = await res.json()
          const chainData = (payload?.data ?? payload) as unknown
          if (!isChainResponseLike(chainData)) {
            if (attempt < CHAIN_FETCH_MAX_ATTEMPTS) {
              attempt += 1
              await new Promise((resolve) => window.setTimeout(resolve, CHAIN_FETCH_RETRY_DELAY_MS))
              continue
            }
            return fallbackData
          }
          const ttlMs = options?.cacheTtlMs ?? CHAIN_CACHE_TTL_MS
          chainCache.set(runId, { data: chainData, expiresAt: requestStartedAt + ttlMs })
          if (chainCache.size > 100) {
            const pruneTime = Date.now()
            for (const [key, entry] of chainCache) {
              if (entry.expiresAt <= pruneTime) chainCache.delete(key)
            }
          }
          return chainData
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            if (timeoutTriggered) {
              if (attempt < CHAIN_FETCH_MAX_ATTEMPTS) {
                attempt += 1
                await new Promise((resolve) => window.setTimeout(resolve, CHAIN_FETCH_RETRY_DELAY_MS))
                continue
              }
              return fallbackData
            }
            throw error
          }
          if (attempt < CHAIN_FETCH_MAX_ATTEMPTS) {
            attempt += 1
            await new Promise((resolve) => window.setTimeout(resolve, CHAIN_FETCH_RETRY_DELAY_MS))
            continue
          }
          console.error('Failed to fetch chain:', error)
          return fallbackData
        } finally {
          window.clearTimeout(timeoutId)
        }
      }
      return fallbackData
    })()
    chainRequestInflight.set(runId, inflightRequest)
    inflightRequest.finally(() => {
      chainRequestInflight.delete(runId)
    })
  }

  const externalSignal = options?.signal
  if (!externalSignal) {
    return inflightRequest
  }
  if (externalSignal.aborted) {
    throw createAbortError()
  }
  return await new Promise<ChainResponse | null>((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError())
    }
    externalSignal.addEventListener('abort', onAbort, { once: true })
    inflightRequest
      .then((result) => {
        externalSignal.removeEventListener('abort', onAbort)
        resolve(result ?? staleCacheData)
      })
      .catch((error) => {
        externalSignal.removeEventListener('abort', onAbort)
        reject(error)
      })
  })
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
const contextCache = new Map<string, { data: ContextResponse; expiresAt: number }>()
const contextRequestInflight = new Map<string, Promise<ContextResponse | null>>()
const contextLastResultReason = new Map<string, string>()
const chainCache = new Map<string, { data: ChainResponse; expiresAt: number }>()
const chainRequestInflight = new Map<string, Promise<ChainResponse | null>>()
let contextRequestSerial = 0

function createAbortError() {
  return new DOMException('Aborted', 'AbortError')
}

function isContextResponseLike(value: unknown): value is ContextResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ContextResponse>
  return Boolean(candidate.context && candidate.tokenDistribution)
}

function isChainResponseLike(value: unknown): value is ChainResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ChainResponse>
  return typeof candidate.runId === 'string' && Array.isArray(candidate.chain)
}

export async function fetchContext(
  runId: string,
  options?: { signal?: AbortSignal; timeoutMs?: number; cacheTtlMs?: number }
): Promise<ContextResponse | null> {
  if (!runId) return null

  const callerRequestId = ++contextRequestSerial
  const now = Date.now()
  const cacheEntry = contextCache.get(runId)
  const hasFreshCache = Boolean(cacheEntry && cacheEntry.expiresAt > now)
  console.log('[ContextAPI]', 'fetchContext called', {
    callerRequestId,
    runId,
    timeoutMs: options?.timeoutMs ?? 10000,
    cacheTtlMs: options?.cacheTtlMs ?? CONTEXT_CACHE_TTL_MS,
    hasSignal: Boolean(options?.signal),
    hasFreshCache,
    hasStaleCache: Boolean(cacheEntry),
    inflightExists: contextRequestInflight.has(runId),
  })
  if (cacheEntry && cacheEntry.expiresAt > now) {
    contextLastResultReason.set(runId, 'fresh_cache')
    console.log('[ContextAPI]', 'serve fresh cache', { callerRequestId, runId })
    return cacheEntry.data
  }
  const staleCacheData = cacheEntry?.data ?? null

  let inflightRequest = contextRequestInflight.get(runId)
  if (!inflightRequest) {
    const inflightRequestId = ++contextRequestSerial
    const requestStartedAt = Date.now()
    const fallbackData = cacheEntry?.data ?? null
    console.log('[ContextAPI]', 'create inflight request', {
      callerRequestId,
      inflightRequestId,
      runId,
      hasFallbackData: Boolean(fallbackData),
      timeoutMs: options?.timeoutMs ?? 10000,
    })
    inflightRequest = (async () => {
      let attempt = 1
      let finalReason = 'unknown'
      try {
        while (attempt <= CONTEXT_FETCH_MAX_ATTEMPTS) {
          const attemptController = new AbortController()
          let timeoutTriggered = false
          const baseTimeoutMs = options?.timeoutMs ?? 10000
          const attemptTimeoutMs = baseTimeoutMs + (attempt - 1) * 8000
          const attemptTimeoutId = window.setTimeout(() => {
            timeoutTriggered = true
            console.warn('[ContextAPI]', 'inflight timeout abort', {
              inflightRequestId,
              runId,
              attempt,
              attemptTimeoutMs,
            })
            attemptController.abort()
          }, attemptTimeoutMs)
          console.log('[ContextAPI]', 'inflight attempt start', {
            inflightRequestId,
            runId,
            attempt,
            maxAttempts: CONTEXT_FETCH_MAX_ATTEMPTS,
            attemptTimeoutMs,
          })
          try {
            const res = await fetch(`${API_BASE}/context?runId=${encodeURIComponent(runId)}`, {
              signal: attemptController.signal,
            })
            console.log('[ContextAPI]', 'inflight response', {
              inflightRequestId,
              runId,
              attempt,
              status: res.status,
              ok: res.ok,
            })
            if (!res.ok) {
              if (attempt < CONTEXT_FETCH_MAX_ATTEMPTS) {
                console.warn('[ContextAPI]', 'inflight non-2xx retrying', {
                  inflightRequestId,
                  runId,
                  attempt,
                  status: res.status,
                })
                attempt += 1
                await new Promise((resolve) => window.setTimeout(resolve, CONTEXT_FETCH_RETRY_DELAY_MS))
                continue
              }
              console.warn('[ContextAPI]', 'inflight non-2xx fallback', {
                inflightRequestId,
                runId,
                attempt,
                status: res.status,
                useFallback: Boolean(fallbackData),
              })
              finalReason = `non_2xx_fallback_${res.status}`
              return fallbackData
            }
            const payload = await res.json()
            const contextData = (payload?.data ?? payload) as unknown
            if (!isContextResponseLike(contextData)) {
              if (attempt < CONTEXT_FETCH_MAX_ATTEMPTS) {
                console.warn('[ContextAPI]', 'inflight invalid payload retrying', {
                  inflightRequestId,
                  runId,
                  attempt,
                  payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload as object) : [],
                })
                attempt += 1
                await new Promise((resolve) => window.setTimeout(resolve, CONTEXT_FETCH_RETRY_DELAY_MS))
                continue
              }
              console.warn('[ContextAPI]', 'inflight invalid payload fallback', {
                inflightRequestId,
                runId,
                attempt,
                useFallback: Boolean(fallbackData),
              })
              finalReason = 'invalid_payload_fallback'
              return fallbackData
            }
            const ttlMs = options?.cacheTtlMs ?? CONTEXT_CACHE_TTL_MS
            contextCache.set(runId, { data: contextData, expiresAt: requestStartedAt + ttlMs })
            console.log('[ContextAPI]', 'inflight success and cache updated', {
              inflightRequestId,
              runId,
              attempt,
              tokenTotal: contextData.tokenDistribution?.total ?? null,
              ttlMs,
            })
            finalReason = `success_attempt_${attempt}`
            if (contextCache.size > 100) {
              const pruneTime = Date.now()
              for (const [key, entry] of contextCache) {
                if (entry.expiresAt <= pruneTime) contextCache.delete(key)
              }
            }
            return contextData
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              if (timeoutTriggered) {
                console.warn('[ContextAPI]', 'inflight aborted by timeout fallback', {
                  inflightRequestId,
                  runId,
                  attempt,
                  useFallback: Boolean(fallbackData),
                })
                finalReason = 'timeout_abort_fallback'
                return fallbackData
              }
              console.log('[ContextAPI]', 'inflight aborted externally', {
                inflightRequestId,
                runId,
                attempt,
              })
              finalReason = 'external_abort'
              throw error
            }
            if (attempt < CONTEXT_FETCH_MAX_ATTEMPTS) {
              console.warn('[ContextAPI]', 'inflight attempt failed and retrying', {
                inflightRequestId,
                runId,
                attempt,
                error,
              })
              attempt += 1
              await new Promise((resolve) => window.setTimeout(resolve, CONTEXT_FETCH_RETRY_DELAY_MS))
              continue
            }
            console.error('[ContextAPI] inflight request failed', { inflightRequestId, runId, attempt, error })
            finalReason = 'request_failed_fallback'
            return fallbackData
          } finally {
            window.clearTimeout(attemptTimeoutId)
          }
        }
        finalReason = 'attempt_exhausted_fallback'
        return fallbackData
      } finally {
        contextRequestInflight.delete(runId)
        contextLastResultReason.set(runId, finalReason)
        console.log('[ContextAPI]', 'inflight cleanup', {
          inflightRequestId,
          runId,
          finalReason,
          inflightSize: contextRequestInflight.size,
        })
      }
    })()
    contextRequestInflight.set(runId, inflightRequest)
  } else {
    console.log('[ContextAPI]', 'join existing inflight', {
      callerRequestId,
      runId,
    })
  }

  const externalSignal = options?.signal
  if (!externalSignal) {
    const result = await inflightRequest
    console.log('[ContextAPI]', 'return inflight result without external signal', {
      callerRequestId,
      runId,
      hasResult: Boolean(result),
      resultReason: contextLastResultReason.get(runId) ?? 'unknown',
    })
    return result
  }
  if (externalSignal.aborted) {
    console.warn('[ContextAPI]', 'external signal already aborted', {
      callerRequestId,
      runId,
    })
    throw createAbortError()
  }
  return await new Promise<ContextResponse | null>((resolve, reject) => {
    const onAbort = () => {
      console.warn('[ContextAPI]', 'external signal aborted while waiting', {
        callerRequestId,
        runId,
      })
      reject(createAbortError())
    }
    externalSignal.addEventListener('abort', onAbort, { once: true })
    inflightRequest
      .then((result) => {
        externalSignal.removeEventListener('abort', onAbort)
        const resolved = result ?? staleCacheData
        console.log('[ContextAPI]', 'return result with external signal', {
          callerRequestId,
          runId,
          hasResult: Boolean(resolved),
          inflightHasResult: Boolean(result),
          useStaleCacheFallback: Boolean(!result && staleCacheData),
          resultReason: contextLastResultReason.get(runId) ?? 'unknown',
        })
        resolve(resolved)
      })
      .catch((error) => {
        externalSignal.removeEventListener('abort', onAbort)
        console.error('[ContextAPI] return result failed with external signal', {
          callerRequestId,
          runId,
          error,
        })
        reject(error)
      })
  })
}
