/**
 * 将原始 requests.json 转成「按 runId 父子关系」的树结构，并聚合 token、时间范围、工具调用。
 */

import type { RawStore, RequestData, SubagentLinkData, ToolCallData } from './rawTypes'

export interface ToolCallSummary {
  toolName: string
  toolCallId?: string
  timestamp: number
  startedAt?: number
  durationMs?: number
  error?: string
}

export interface RunTreeNode {
  runId: string
  sessionId?: string
  sessionKey?: string
  startTime: number
  endTime: number
  usage: { input: number; output: number; total: number }
  /** 当原始 usage 全为 0 时由内容长度估算，界面可显示「约 xxx (估算)」 */
  usageEstimated?: boolean
  requestCount: number
  model?: string
  provider?: string
  status: 'running' | 'success' | 'error' | 'unknown'
  children: RunTreeNode[]
  toolCalls: ToolCallSummary[]
}

function aggregateRunFromRequests(requests: RequestData[]): Omit<RunTreeNode, 'children' | 'toolCalls'> | null {
  if (requests.length === 0) return null
  const timestamps = requests.map(r => r.timestamp)
  const startTime = Math.min(...timestamps)
  const endTime = Math.max(...timestamps)
  let input = 0
  let output = 0
  let total = 0
  let hasOutput = false
  let hasError = false
  let model: string | undefined
  let provider: string | undefined
  for (const r of requests) {
    const u = r.usage
    if (u?.input != null) input += u.input
    if (u?.output != null) output += u.output
    if (u?.total != null) total += u.total
    else if (u?.totalTokens != null) total += u.totalTokens
    if (r.type === 'output') hasOutput = true
    if ((r as RequestData & { error?: string }).error) hasError = true
    if (r.model) model = r.model
    if (r.provider) provider = r.provider
  }
  if (total === 0 && (input > 0 || output > 0)) total = input + output
  let usageEstimated = false
  if (input === 0 && output === 0 && total === 0) {
    for (const r of requests) {
      const estimated = estimateTokensFromRequest(r)
      if (r.type === 'input') input += estimated.input
      else output += estimated.output
    }
    total = input + output
    if (total > 0) usageEstimated = true
  }
  let status: RunTreeNode['status'] = 'unknown'
  if (hasError) status = 'error'
  else if (hasOutput) status = 'success'
  else status = 'running'

  const runId = requests[0].runId
  const sessionId = requests[0].sessionId
  const sessionKey = requests[0].sessionKey
  return {
    runId,
    sessionId,
    sessionKey,
    startTime,
    endTime,
    usage: { input, output, total },
    usageEstimated: usageEstimated || undefined,
    requestCount: requests.length,
    model,
    provider,
    status,
  }
}

/** 当 usage 全为 0 时，用内容长度粗略估算 token（约 4 字符 1 token） */
function estimateTokensFromRequest(r: RequestData): { input: number; output: number } {
  const chunk = (s: string) => Math.max(0, Math.ceil((s || '').length / 4))
  let input = 0
  let output = 0
  if (r.prompt) input += chunk(r.prompt)
  if (r.systemPrompt) input += chunk(r.systemPrompt)
  if (Array.isArray(r.historyMessages)) {
    input += chunk(JSON.stringify(r.historyMessages))
  }
  if (r.type === 'output' && Array.isArray(r.assistantTexts)) {
    output = r.assistantTexts.reduce((sum, t) => sum + chunk(t), 0)
  }
  return { input, output }
}

/**
 * 从原始 store 构建 run 树（森林）。
 * - 只把 kind===spawn 的 link 当作父子边；同一 parent 的多个 child 按 link 的 timestamp 排序。
 * - 根 = 从未作为 childRunId 出现的 runId。
 * - 每个节点的 children 按对应 link 的 timestamp 升序。
 */
export function buildRunTree(raw: RawStore): RunTreeNode[] {
  const { requests, subagentLinks, toolCalls } = raw

  // 按 runId 分组 requests
  const byRunId = new Map<string, RequestData[]>()
  for (const r of requests) {
    const runId = r.runId.trim()
    if (!runId) continue
    if (!byRunId.has(runId)) byRunId.set(runId, [])
    byRunId.get(runId)!.push(r)
  }
  // 每组按 timestamp 排序
  for (const arr of byRunId.values()) {
    arr.sort((a, b) => a.timestamp - b.timestamp)
  }

  // 只保留 spawn 的 link，且必须有 parentRunId + childRunId
  const spawnLinks = subagentLinks.filter(
    (l) => (l.kind === 'spawn' || !l.kind) && l.parentRunId?.trim() && l.childRunId?.trim()
  )
  const parentToChildren = new Map<string, SubagentLinkData[]>()
  const allChildIds = new Set<string>()
  for (const link of spawnLinks) {
    const parent = link.parentRunId.trim()
    const child = link.childRunId!.trim()
    allChildIds.add(child)
    if (!parentToChildren.has(parent)) parentToChildren.set(parent, [])
    parentToChildren.get(parent)!.push(link)
  }
  // 同一 parent 下按 timestamp 升序
  for (const arr of parentToChildren.values()) {
    arr.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
  }

  // toolCalls 按 runId 分组
  const toolCallsByRunId = new Map<string, ToolCallData[]>()
  for (const t of toolCalls) {
    const runId = t.runId?.trim()
    if (!runId) continue
    if (!toolCallsByRunId.has(runId)) toolCallsByRunId.set(runId, [])
    toolCallsByRunId.get(runId)!.push(t)
  }
  for (const arr of toolCallsByRunId.values()) {
    arr.sort((a, b) => a.timestamp - b.timestamp)
  }

  function toSummary(t: ToolCallData): ToolCallSummary {
    return {
      toolName: t.toolName,
      toolCallId: t.toolCallId,
      timestamp: t.timestamp,
      startedAt: t.startedAt,
      durationMs: t.durationMs,
      error: t.error,
    }
  }

  function buildNode(runId: string): RunTreeNode | null {
    const reqs = byRunId.get(runId)
    const base = reqs ? aggregateRunFromRequests(reqs) : null
    const toolList = (toolCallsByRunId.get(runId) || []).map(toSummary)
    const childLinks = parentToChildren.get(runId) || []
    const children: RunTreeNode[] = []
    for (const link of childLinks) {
      const childId = link.childRunId!.trim()
      const childNode = buildNode(childId)
      if (childNode) children.push(childNode)
    }

    if (base) {
      return {
        ...base,
        children,
        toolCalls: toolList,
      }
    }
    // 仅有 link 没有 request 的 run（子 run 可能先于父 run 有 link）
    const firstLink = childLinks[0] || spawnLinks.find((l) => l.childRunId === runId)
    const ts = firstLink?.timestamp ?? 0
    return {
      runId,
      sessionId: firstLink?.parentSessionId,
      sessionKey: firstLink?.childSessionKey,
      startTime: ts,
      endTime: ts,
      usage: { input: 0, output: 0, total: 0 },
      requestCount: 0,
      status: 'unknown',
      children,
      toolCalls: toolList,
    }
  }

  const roots: RunTreeNode[] = []
  const seen = new Set<string>()
  for (const runId of byRunId.keys()) {
    if (allChildIds.has(runId)) continue
    if (seen.has(runId)) continue
    seen.add(runId)
    const node = buildNode(runId)
    if (node) roots.push(node)
  }
  // 还有作为 parent 出现但自身没有 request 的根（仅 link 的 parent）
  for (const parent of parentToChildren.keys()) {
    if (seen.has(parent)) continue
    seen.add(parent)
    const node = buildNode(parent)
    if (node) roots.push(node)
  }

  // 根按 startTime 倒序（最新在前）
  roots.sort((a, b) => b.startTime - a.startTime)
  return roots
}

/** 在树中按 runId 查找节点 */
export function findRunInTree(roots: RunTreeNode[], runId: string): RunTreeNode | null {
  function walk(n: RunTreeNode): RunTreeNode | null {
    if (n.runId === runId) return n
    for (const c of n.children) {
      const found = walk(c)
      if (found) return found
    }
    return null
  }
  for (const r of roots) {
    const found = walk(r)
    if (found) return found
  }
  return null
}
