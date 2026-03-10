export interface Stats {
  totalRequests: number
  todayRequests: number
  weekRequests: number
  averageTokens: number
  totalCost: number
  byProvider: Record<string, number>
  byModel: Record<string, number>
  hourlyDistribution: number[]
  latency?: {
    p50: number
    p95: number
    p99: number
  }
}

export interface Request {
  id: number
  type: 'input' | 'output'
  runId: string
  sessionId: string
  provider: string
  model: string
  timestamp: number
  usage?: {
    input?: number
    output?: number
    total?: number
  }
  latency?: number
  prompt?: string
  systemPrompt?: string
  historyMessages?: any[]
}

export interface Analysis {
  runId: string
  sessionId: string
  provider: string
  model: string
  timestamp: number
  tokenBreakdown: {
    labels: string[]
    values: number[]
    colors: string[]
    total: number
  }
  heatmap: {
    messages: Array<{
      id: string
      role: string
      content: string
      tokens: number
      impact: number
      timestamp: number
    }>
    maxImpact: number
  }
  timeline: {
    points: Array<{
      timestamp: number
      tokens: number
      messages: number
      utilization: number
      summaryApplied: boolean
    }>
    contextWindow: number
  }
  dependencyGraph: {
    nodes: Array<{
      id: string
      label: string
      type: 'tool' | 'response' | 'llm'
      duration: number
      tokens: number
      status: 'success' | 'error' | 'pending'
    }>
    edges: Array<{
      source: string
      target: string
      weight: number
    }>
  }
  insights: Array<{
    type: 'warning' | 'info' | 'optimization'
    title: string
    description: string
    severity: 'low' | 'medium' | 'high'
  }>
  attentionDistribution?: {
    systemPrompt: number
    recentMessages: number
    olderMessages: number
    toolResponses: number
  }
  contextHealth?: {
    score: number
    issues: string[]
    recommendations: string[]
  }
  contextSimilarities?: Array<{
    message1: number
    message2: number
    similarity: number
    commonTopic: string
  }>
  compressionSuggestions?: Array<{
    type: 'remove' | 'summarize' | 'keep'
    messageId: string
    tokenSavings: number
    reason: string
  }>
  topicClusters?: Array<{
    topic: string
    percentage: number
    messageCount: number
    keywords: string[]
  }>
}

// 时间线详情类型
export interface TimelinePointDetail {
  timestamp: number
  tokens: number
  messages: number
  utilization: number
  summaryApplied: boolean
  contextSnapshot: ContextMessage[]
  comparison?: {
    prevTimestamp?: number
    messagesDelta: number
    tokensDelta: number
    utilizationDelta: number
    addedMessages: ContextMessage[]
    removedMessages: ContextMessage[]
  }
}

export interface ContextMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tokens: number
  timestamp: number
  type?: string
  status?: 'success' | 'error' | 'pending'
}

export interface TokenTrendPoint {
  timestamp: number
  input: number
  output: number
  total: number
}
