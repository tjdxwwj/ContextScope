import { getModelContextWindow } from '../models/shared-types.js';
import type { ChainItem, ChainResponse, ChainStats } from '../models/chain-types.js';
import type { ContextAnalyzer } from './analyzer.service.js';
import type { PluginLogger } from '../models/shared-types.js';
import type { RequestAnalyzerStorage } from '../storage.js';
import type {
  DependencyGraphData,
  DetailedAnalysis,
  HeatmapData,
  TimelineData,
  TokenVisualization
} from '../models/service-types.js';

export interface TimelineMessageSnapshot {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens: number;
  timestamp: number;
  type?: 'input' | 'output';
  status?: 'success';
}

interface TimelineComparison {
  prevTimestamp?: number;
  messagesDelta: number;
  tokensDelta: number;
  utilizationDelta: number;
  addedMessages: TimelineMessageSnapshot[];
  removedMessages: unknown[];
}

export interface TimelineDetailResponse {
  timestamp: number;
  tokens: number;
  messages: number;
  utilization: number;
  summaryApplied: boolean;
  contextSnapshot: TimelineMessageSnapshot[];
  comparison?: TimelineComparison;
}

export interface TimelinePointsComparisonResponse {
  timestamp1: number;
  timestamp2: number;
  messagesDelta: number;
  tokensDelta: number;
  utilizationDelta: number;
  addedMessages: TimelineMessageSnapshot[];
  removedMessages: unknown[];
}

interface ServiceAnalysisContext {
  storage: RequestAnalyzerStorage;
  analyzer: ContextAnalyzer;
  logger: PluginLogger;
  truncateText: (text: string, maxLength: number) => string;
}

const toChainStatus = (outcome?: string): 'success' | 'error' | 'pending' => {
  if (outcome === 'error') return 'error';
  if (outcome === 'pending') return 'pending';
  return 'success';
};

export async function getDetailedAnalysis(
  ctx: ServiceAnalysisContext,
  runId: string
): Promise<DetailedAnalysis | null> {
  try {
    const requests = await ctx.storage.getRequests({ runId, limit: 1000 });
    if (requests.length === 0) return null;

    const mainRequest = requests.find(r => r.type === 'input') || requests[0];
    const subagentLinks = await ctx.storage.getSubagentLinks({ parentRunId: runId, limit: 1000 });
    const analysis = ctx.analyzer.analyzeRequest(mainRequest, requests);

    const tokenBreakdown: TokenVisualization = {
      labels: ['系统提示', '历史消息', '当前提示', '工具响应', '输出', '缓存读取', '缓存写入'],
      values: [
        analysis.tokenBreakdown.systemPrompt,
        analysis.tokenBreakdown.historyMessages,
        analysis.tokenBreakdown.currentPrompt,
        analysis.tokenBreakdown.toolResponses,
        analysis.tokenBreakdown.output,
        analysis.tokenBreakdown.cacheRead,
        analysis.tokenBreakdown.cacheWrite
      ],
      colors: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'],
      total: analysis.tokenBreakdown.totalInput + analysis.tokenBreakdown.output
    };

    const heatmap: HeatmapData = {
      messages: analysis.messageImpacts.map(m => ({
        id: m.messageId,
        role: m.role,
        content: m.content,
        tokens: m.tokenCount,
        impact: m.impactScore,
        timestamp: m.timestamp
      })),
      maxImpact: Math.max(...analysis.messageImpacts.map(m => m.impactScore), 1)
    };

    const timeline: TimelineData = {
      points: analysis.contextEvolution.map(e => ({
        timestamp: e.timestamp,
        tokens: e.totalTokens,
        messages: e.messageCount,
        utilization: e.windowUtilization,
        summaryApplied: e.summaryApplied
      })),
      contextWindow: getModelContextWindow(mainRequest.model)
    };

    const dependencyGraph: DependencyGraphData = {
      nodes: analysis.dependencyGraph.nodes.map(n => ({
        id: n.id,
        label: n.name,
        type: n.name.includes('response') ? 'response' : 'tool',
        duration: n.duration,
        tokens: n.tokensUsed,
        status: n.status
      })),
      edges: analysis.dependencyGraph.edges.map(e => ({
        source: e.from,
        target: e.to,
        weight: e.weight
      }))
    };

    return {
      runId: analysis.runId,
      sessionId: analysis.sessionId,
      provider: mainRequest.provider,
      model: mainRequest.model,
      timestamp: mainRequest.timestamp,
      subagentLinks,
      tokenBreakdown,
      heatmap,
      timeline,
      dependencyGraph,
      insights: analysis.insights,
      topicClusters: analysis.topicClusters.map(tc => ({
        topic: tc.topic,
        messageCount: tc.messageIds.length,
        percentage: tc.percentage,
        keywords: tc.keywords
      })),
      contextSimilarities: analysis.contextSimilarities.map(cs => ({
        message1: cs.messageId,
        message2: cs.similarTo,
        similarity: cs.similarityScore,
        commonTopic: cs.topic
      })),
      compressionSuggestions: analysis.compressionSuggestions.map(cs => ({
        type: cs.type,
        messageId: cs.messageId,
        reason: cs.reason,
        tokenSavings: cs.tokenSavings,
        impact: cs.impact
      })),
      attentionDistribution: analysis.attentionDistribution,
      keyMessages: analysis.keyMessages.map(km => ({
        id: km.messageId,
        role: km.role,
        content: km.content,
        impactScore: km.impactScore
      })),
      contextHealth: analysis.contextHealth
    };
  } catch (error) {
    ctx.logger.error(`Failed to get detailed analysis: ${error}`);
    return null;
  }
}

export async function getSessionAnalysis(
  ctx: ServiceAnalysisContext,
  sessionId: string,
  filters: { startTime?: number; endTime?: number } = {}
): Promise<{
  totalTokens: number;
  totalRequests: number;
  averageTokensPerRequest: number;
  topModels: Array<{ model: string; count: number }>;
  tokenTrend: Array<{ timestamp: number; tokens: number }>;
} | null> {
  try {
    const requests = await ctx.storage.getRequests({ sessionId, ...filters, limit: 1000 });
    if (requests.length === 0) return null;
    const totalTokens = requests.reduce((sum, r) => sum + (r.usage?.total || 0), 0);
    const modelCounts: Record<string, number> = {};
    requests.forEach(r => {
      modelCounts[r.model] = (modelCounts[r.model] || 0) + 1;
    });
    const topModels = Object.entries(modelCounts)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const hourlyTokens: Record<number, number> = {};
    requests.forEach(r => {
      const hour = Math.floor(r.timestamp / (60 * 60 * 1000));
      hourlyTokens[hour] = (hourlyTokens[hour] || 0) + (r.usage?.total || 0);
    });
    const tokenTrend = Object.entries(hourlyTokens)
      .map(([hour, tokens]) => ({ timestamp: parseInt(hour, 10) * 60 * 60 * 1000, tokens }))
      .sort((a, b) => a.timestamp - b.timestamp);
    return {
      totalTokens,
      totalRequests: requests.length,
      averageTokensPerRequest: Math.round(totalTokens / requests.length),
      topModels,
      tokenTrend
    };
  } catch (error) {
    ctx.logger.error(`Failed to get session analysis: ${error}`);
    return null;
  }
}

export async function getTimelineDetail(
  ctx: ServiceAnalysisContext,
  runId: string,
  timestamp: number
): Promise<TimelineDetailResponse | null> {
  const requests = await ctx.storage.getRequests({ runId, limit: 1000 });
  const pointRequest = requests.find(r => Math.abs(r.timestamp - timestamp) < 60000);
  if (!pointRequest) return null;
  const contextRequests = requests.filter(r => r.timestamp <= timestamp).slice(-20);
  const contextSnapshot: TimelineMessageSnapshot[] = contextRequests.map((req) => ({
    id: req.runId,
    role: req.type === 'input' ? 'user' : 'assistant',
    content: req.prompt ? ctx.truncateText(req.prompt, 500) : 'No content',
    tokens: req.usage?.total || 0,
    timestamp: req.timestamp,
    type: req.type,
    status: 'success'
  }));
  const prevTimestamp = contextRequests.length > 1 ? contextRequests[contextRequests.length - 2].timestamp : undefined;
  const comparison = prevTimestamp ? {
    prevTimestamp,
    messagesDelta: 1,
    tokensDelta: pointRequest.usage?.total || 0,
    utilizationDelta: 5,
    addedMessages: [contextSnapshot[contextSnapshot.length - 1]],
    removedMessages: []
  } : undefined;
  const totalTokens = contextRequests.reduce((sum, r) => sum + (r.usage?.total || 0), 0);
  return {
    timestamp,
    tokens: totalTokens,
    messages: contextRequests.length,
    utilization: Math.min(0.95, totalTokens / getModelContextWindow(pointRequest.model)),
    summaryApplied: false,
    contextSnapshot,
    comparison
  };
}

export async function getChain(
  ctx: ServiceAnalysisContext,
  runId: string,
  limit = 100,
  offset = 0
): Promise<ChainResponse | null> {
  try {
    const requests = await ctx.storage.getRequests({ runId, limit: 10000 });
    if (requests.length === 0) return null;
    const mainRequest = requests.find(r => r.type === 'input') || requests[0];
    const subagentLinks = await ctx.storage.getSubagentLinks({ parentRunId: runId, limit: 1000 });
    const toolCalls = await ctx.storage.getToolCalls({ runId, limit: 1000 });
    const chainItems: ChainItem[] = [];
    requests.forEach(req => {
      chainItems.push({
        id: req.runId,
        runId: req.runId,
        type: req.type as 'input' | 'output',
        timestamp: req.timestamp,
        input: req.type === 'input' ? { prompt: req.prompt, systemPrompt: req.systemPrompt, historyMessages: req.historyMessages } : undefined,
        output: req.type === 'output' ? { assistantTexts: req.assistantTexts } : undefined,
        usage: req.usage ? { input: req.usage.input || 0, output: req.usage.output || 0, total: req.usage.total || 0 } : undefined,
        metadata: { provider: req.provider, model: req.model, status: 'success' }
      });
    });
    toolCalls.forEach(tc => {
      if (tc.params) {
        chainItems.push({
          id: tc.toolCallId || `tool_${tc.id}`,
          runId: tc.runId,
          type: 'tool_call',
          timestamp: tc.timestamp,
          duration: tc.durationMs,
          input: { params: tc.params },
          metadata: { toolName: tc.toolName, status: tc.error ? 'error' : 'success', error: tc.error }
        });
      }
      if (tc.result !== undefined) {
        chainItems.push({
          id: tc.toolCallId || `tool_${tc.id}`,
          runId: tc.runId,
          type: 'tool_result',
          timestamp: tc.timestamp + (tc.durationMs || 0),
          output: { result: tc.result },
          metadata: { toolName: tc.toolName, status: tc.error ? 'error' : 'success', error: tc.error }
        });
      }
    });
    subagentLinks.forEach(link => {
      if (link.label || link.mode) {
        chainItems.push({
          id: link.childRunId || `subagent_${link.id}`,
          runId: link.childRunId || '',
          parentRunId: link.parentRunId,
          type: 'subagent_spawn',
          timestamp: link.timestamp,
          input: { task: link.label },
          metadata: { agentId: link.childSessionKey, status: 'success' }
        });
      }
      if (link.endedAt || link.outcome) {
        chainItems.push({
          id: link.childRunId || `subagent_${link.id}`,
          runId: link.childRunId || '',
          parentRunId: link.parentRunId,
          type: 'subagent_result',
          timestamp: link.endedAt || link.timestamp,
          duration: link.endedAt ? (link.endedAt - link.timestamp) : undefined,
          output: { outcome: link.outcome },
          metadata: { agentId: link.childSessionKey, status: toChainStatus(link.outcome), error: link.error }
        });
      }
    });
    chainItems.sort((a, b) => b.timestamp - a.timestamp);
    const stats: ChainStats = {
      totalItems: chainItems.length,
      inputCount: chainItems.filter(i => i.type === 'input').length,
      outputCount: chainItems.filter(i => i.type === 'output').length,
      toolCallCount: chainItems.filter(i => i.type === 'tool_call' || i.type === 'tool_result').length,
      subagentCount: chainItems.filter(i => i.type === 'subagent_spawn' || i.type === 'subagent_result').length,
      totalTokens: chainItems.reduce((sum, i) => sum + (i.usage?.total || 0), 0)
    };
    const startTime = Math.min(...requests.map(r => r.timestamp));
    const endTime = requests.find(r => r.type === 'output')?.timestamp || Math.max(...requests.map(r => r.timestamp));
    return {
      runId,
      sessionId: mainRequest.sessionId,
      provider: mainRequest.provider,
      model: mainRequest.model,
      startTime,
      endTime,
      duration: endTime - startTime,
      pagination: { limit, offset, total: chainItems.length, hasMore: offset + limit < chainItems.length },
      chain: chainItems.slice(offset, offset + limit),
      stats
    };
  } catch (error) {
    ctx.logger.error(`Failed to get chain: ${error}`);
    return null;
  }
}

export async function compareTimelinePoints(
  ctx: ServiceAnalysisContext,
  runId: string,
  timestamp1: number,
  timestamp2: number
): Promise<TimelinePointsComparisonResponse | null> {
  const requests = await ctx.storage.getRequests({ runId, limit: 1000 });
  const point1 = requests.find(r => Math.abs(r.timestamp - timestamp1) < 60000);
  const point2 = requests.find(r => Math.abs(r.timestamp - timestamp2) < 60000);
  if (!point1 || !point2) return null;
  const earlier = timestamp1 < timestamp2 ? point1 : point2;
  const later = timestamp1 < timestamp2 ? point2 : point1;
  const betweenRequests = requests.filter(r => r.timestamp > earlier.timestamp && r.timestamp <= later.timestamp);
  return {
    timestamp1: earlier.timestamp,
    timestamp2: later.timestamp,
    messagesDelta: betweenRequests.length,
    tokensDelta: betweenRequests.reduce((sum, r) => sum + (r.usage?.total || 0), 0),
    utilizationDelta: 10,
    addedMessages: betweenRequests.map(req => ({
      id: req.runId,
      role: req.type === 'input' ? 'user' : 'assistant',
      content: req.prompt ? ctx.truncateText(req.prompt, 200) : 'No content',
      tokens: req.usage?.total || 0,
      timestamp: req.timestamp
    })),
    removedMessages: []
  };
}
