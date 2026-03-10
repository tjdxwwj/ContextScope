/**
 * ContextScope Service
 * 
 * Core service that handles request analysis, statistics, and alerts
 */

import type { RequestAnalyzerStorage, SubagentLinkData, ToolCallData } from './storage.js';
import type { PluginConfig } from './config.js';
import { ContextAnalyzer, type AnalysisResult, type AnalysisInsight } from './analyzer.js';

interface PluginLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface AnalysisStats {
  totalRequests: number;
  todayRequests: number;
  weekRequests: number;
  averageTokens: number;
  totalCost: number;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  hourlyDistribution: number[];
}

export interface AlertContext {
  runId: string;
  sessionId: string;
  usage: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  provider: string;
  model: string;
}

export interface TokenVisualization {
  labels: string[];
  values: number[];
  colors: string[];
  total: number;
}

export interface HeatmapData {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    tokens: number;
    impact: number;
    timestamp: number;
  }>;
  maxImpact: number;
}

export interface TimelineData {
  points: Array<{
    timestamp: number;
    tokens: number;
    messages: number;
    utilization: number;
    summaryApplied: boolean;
  }>;
  contextWindow: number;
}

export interface DependencyGraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: 'tool' | 'response' | 'llm';
    duration: number;
    tokens: number;
    status: 'success' | 'error' | 'pending';
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

export interface DetailedAnalysis {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  timestamp: number;
  subagentLinks: SubagentLinkData[];
  tokenBreakdown: TokenVisualization;
  heatmap: HeatmapData;
  timeline: TimelineData;
  dependencyGraph: DependencyGraphData;
  insights: AnalysisInsight[];
  // Context Analysis
  topicClusters: Array<{
    topic: string;
    messageCount: number;
    percentage: number;
    keywords: string[];
  }>;
  contextSimilarities: Array<{
    message1: string;
    message2: string;
    similarity: number;
    commonTopic: string;
  }>;
  compressionSuggestions: Array<{
    type: 'remove' | 'summarize' | 'keep';
    messageId: string;
    reason: string;
    tokenSavings: number;
    impact: string;
  }>;
  attentionDistribution: {
    systemPrompt: number;
    recentMessages: number;
    olderMessages: number;
    toolResponses: number;
  };
  keyMessages: Array<{
    id: string;
    role: string;
    content: string;
    impactScore: number;
  }>;
  contextHealth: {
    score: number;
    issues: string[];
    recommendations: string[];
  };
}

export class RequestAnalyzerService {
  private storage: RequestAnalyzerStorage;
  private config: PluginConfig;
  private logger: PluginLogger;
  private analyzer: ContextAnalyzer;

  constructor(params: {
    storage: RequestAnalyzerStorage;
    config: PluginConfig;
    logger: PluginLogger;
  }) {
    this.storage = params.storage;
    this.config = params.config;
    this.logger = params.logger;
    this.analyzer = new ContextAnalyzer();
  }

  async captureRequest(data: any): Promise<void> {
    try {
      // Apply content filtering if needed
      if (this.config.capture?.anonymizeContent) {
        data = this.anonymizeContent(data);
      }

      // Truncate long prompts if configured
      if (this.config.capture?.maxPromptLength && data.prompt) {
        data.prompt = this.truncateText(data.prompt, this.config.capture.maxPromptLength);
      }

      await this.storage.captureRequest(data);
      this.logger.debug?.(`Captured ${data.type} request for run ${data.runId}`);
    } catch (error) {
      this.logger.error(`Failed to capture request: ${error}`);
      throw error;
    }
  }

  async captureResponse(data: any): Promise<void> {
    try {
      if (this.config.capture?.anonymizeContent) {
        data = this.anonymizeContent(data);
      }

      // 当 API 没有返回 usage 时，估算 token 数量
      this.estimateUsage(data);

      await this.storage.captureRequest(data);
      this.logger.debug?.(`Captured response for run ${data.runId}`);
    } catch (error) {
      this.logger.error(`Failed to capture response: ${error}`);
      throw error;
    }
  }

  async captureSubagentLink(data: SubagentLinkData): Promise<void> {
    try {
      await this.storage.captureSubagentLink(data);
      this.logger.debug?.(`Captured subagent link ${data.parentRunId} -> ${data.childRunId}`);
    } catch (error) {
      this.logger.error(`Failed to capture subagent link: ${error}`);
      throw error;
    }
  }

  async updateSubagentLinkByChildRunId(params: {
    childRunId: string;
    patch: Partial<Pick<SubagentLinkData, 'endedAt' | 'outcome' | 'error' | 'metadata'>>;
  }): Promise<void> {
    try {
      await this.storage.updateSubagentLinkByChildRunId(params);
    } catch (error) {
      this.logger.error(`Failed to update subagent link: ${error}`);
      throw error;
    }
  }

  async captureToolCall(data: ToolCallData): Promise<void> {
    try {
      if (this.config.capture?.anonymizeContent) {
        data = this.anonymizeAny(data) as ToolCallData;
      }
      await this.storage.captureToolCall(data);
      this.logger.debug?.(`Captured tool call ${data.toolName} for run ${data.runId}`);
    } catch (error) {
      this.logger.error(`Failed to capture tool call: ${error}`);
      throw error;
    }
  }

  async checkAlerts(context: AlertContext): Promise<void> {
    if (!this.config.alerts?.enabled) return;

    const { usage, provider, model, runId } = context;
    const totalTokens = usage.total || 0;
    const estimatedCost = this.estimateCost(usage, provider, model);

    if (totalTokens > (this.config.alerts.tokenThreshold || 50000)) {
      this.logger.warn(`🚨 High token usage alert: ${totalTokens.toLocaleString()} tokens for run ${runId}`);
    }

    if (estimatedCost > (this.config.alerts.costThreshold || 10)) {
      this.logger.warn(`💰 High cost alert: ~$${estimatedCost.toFixed(2)} for run ${runId}`);
    }
  }

  async getStats(filters: any = {}): Promise<AnalysisStats> {
    const requests = await this.storage.getRequests({ ...filters, limit: 10000 });
    
    const stats = {
      totalRequests: requests.length,
      todayRequests: 0,
      weekRequests: 0,
      averageTokens: 0,
      totalCost: 0,
      byProvider: {} as Record<string, number>,
      byModel: {} as Record<string, number>,
      hourlyDistribution: new Array(24).fill(0)
    };

    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    let totalTokens = 0;
    let costCalculations = 0;

    for (const request of requests) {
      // Count by time period
      if (request.timestamp >= today.getTime()) {
        stats.todayRequests++;
      }
      if (request.timestamp >= weekAgo.getTime()) {
        stats.weekRequests++;
      }

      // Count by provider and model
      if (request.provider) {
        stats.byProvider[request.provider] = (stats.byProvider[request.provider] || 0) + 1;
      }
      if (request.model) {
        stats.byModel[request.model] = (stats.byModel[request.model] || 0) + 1;
      }

      // Calculate tokens and cost
      if (request.usage?.total) {
        totalTokens += request.usage.total;
        costCalculations++;
        stats.totalCost += this.estimateCost(request.usage, request.provider, request.model);
      }

      // Hourly distribution
      const hour = new Date(request.timestamp).getHours();
      stats.hourlyDistribution[hour]++;
    }

    stats.averageTokens = costCalculations > 0 ? Math.round(totalTokens / costCalculations) : 0;

    return stats;
  }

  async getRequests(filters: any = {}): Promise<any[]> {
    return await this.storage.getRequests(filters);
  }

  async getSubagentLinks(filters: {
    parentRunId?: string;
    childRunId?: string;
    parentSessionId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<SubagentLinkData[]> {
    return await this.storage.getSubagentLinks(filters);
  }

  async getToolCalls(filters: {
    runId?: string;
    sessionId?: string;
    toolName?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolCallData[]> {
    return await this.storage.getToolCalls(filters);
  }

  async getStorageStats(): Promise<any> {
    return await this.storage.getStats();
  }

  async getDetailedAnalysis(runId: string): Promise<DetailedAnalysis | null> {
    try {
      // Get the main request
      const requests = await this.storage.getRequests({ runId, limit: 1000 });
      if (requests.length === 0) return null;

      const mainRequest = requests.find(r => r.type === 'input') || requests[0];
      const subagentLinks = await this.storage.getSubagentLinks({ parentRunId: runId, limit: 1000 });
      
      // Run analysis
      const analysis = this.analyzer.analyzeRequest(mainRequest, requests);

      // Convert to visualization format
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
        colors: [
          '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF'
        ],
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
        contextWindow: this.getModelContextWindow(mainRequest.model)
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
        // Context Analysis
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
      this.logger.error(`Failed to get detailed analysis: ${error}`);
      return null;
    }
  }

  async getSessionAnalysis(sessionId: string): Promise<{
    totalTokens: number;
    totalRequests: number;
    averageTokensPerRequest: number;
    topModels: Array<{ model: string; count: number }>;
    tokenTrend: Array<{ timestamp: number; tokens: number }>;
  } | null> {
    try {
      const requests = await this.storage.getRequests({ sessionId, limit: 1000 });
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

      // Group by hour for trend
      const hourlyTokens: Record<number, number> = {};
      requests.forEach(r => {
        const hour = Math.floor(r.timestamp / (60 * 60 * 1000));
        hourlyTokens[hour] = (hourlyTokens[hour] || 0) + (r.usage?.total || 0);
      });

      const tokenTrend = Object.entries(hourlyTokens)
        .map(([hour, tokens]) => ({
          timestamp: parseInt(hour) * 60 * 60 * 1000,
          tokens
        }))
        .sort((a, b) => a.timestamp - b.timestamp);

      return {
        totalTokens,
        totalRequests: requests.length,
        averageTokensPerRequest: Math.round(totalTokens / requests.length),
        topModels,
        tokenTrend
      };
    } catch (error) {
      this.logger.error(`Failed to get session analysis: ${error}`);
      return null;
    }
  }

  private anonymizeContent(data: any): any {
    const anonymized = { ...data };
    
    if (anonymized.prompt) {
      anonymized.prompt = this.anonymizeText(anonymized.prompt);
    }
    
    if (anonymized.systemPrompt) {
      anonymized.systemPrompt = this.anonymizeText(anonymized.systemPrompt);
    }
    
    if (anonymized.assistantTexts) {
      anonymized.assistantTexts = anonymized.assistantTexts.map((text: string) => 
        this.anonymizeText(text)
      );
    }

    if (anonymized.historyMessages) {
      anonymized.historyMessages = this.anonymizeAny(anonymized.historyMessages);
    }

    return anonymized;
  }

  private anonymizeAny(value: unknown, depth: number = 0): unknown {
    if (depth > 8) return undefined;
    if (typeof value === 'string') return this.anonymizeText(value);
    if (value === null || value === undefined) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      return value.slice(0, 200).map(v => this.anonymizeAny(v, depth + 1));
    }
    if (typeof value === 'object') {
      const input = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const entries = Object.entries(input).slice(0, 200);
      for (const [k, v] of entries) {
        out[k] = this.anonymizeAny(v, depth + 1);
      }
      return out;
    }
    return undefined;
  }

  private anonymizeText(text: string): string {
    return text
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
      .replace(/\b(sk-[a-zA-Z0-9]{20,})\b/g, '[API_KEY]')
      .replace(/\b([A-Za-z0-9]{20,})\b/g, '[TOKEN]');
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...[TRUNCATED]';
  }

  private estimateCost(usage: any, provider: string, model: string): number {
    const totalTokens = usage.total || (usage.input || 0) + (usage.output || 0);
    
    const costPer1K: Record<string, number> = {
      'gpt-4': 0.06,
      'gpt-4-turbo': 0.03,
      'gpt-3.5-turbo': 0.002,
      'claude-3-opus': 0.075,
      'claude-3-sonnet': 0.015,
      'claude-3-haiku': 0.003,
      'qwen': 0.008,
      'qwen2': 0.004,
      'default': 0.01
    };

    const modelKey = Object.keys(costPer1K).find(key => model.toLowerCase().includes(key)) || 'default';
    const cost = (totalTokens / 1000) * costPer1K[modelKey];
    
    return cost;
  }

  private getModelContextWindow(model: string): number {
    const modelLower = model.toLowerCase();
    const windows: Record<string, number> = {
      'gpt-4': 8192,
      'gpt-4-turbo': 128000,
      'gpt-3.5-turbo': 16385,
      'claude-3': 200000,
      'qwen': 32768,
      'qwen2': 128000,
      'default': 8192
    };

    for (const [key, value] of Object.entries(windows)) {
      if (modelLower.includes(key)) {
        return value;
      }
    }
    return windows['default'];
  }

  /**
   * 估算文本的 token 数量
   * 中文：约 1.5 个字符 = 1 个 token
   * 英文：约 4 个字符 = 1 个 token
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    
    return Math.round(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 当 API 没有返回 usage 时，估算 token 数量
   */
  private estimateUsage(data: any): void {
    if (!data.usage || data.usage.totalTokens === 0) {
      // 估算 output tokens
      const content = data.assistantTexts?.join('\n') || '';
      const estimatedOutput = this.estimateTokens(content);
      
      data.usage = {
        input: data.usage?.input || 0,
        output: estimatedOutput,
        cacheRead: 0,
        cacheWrite: 0,
        total: (data.usage?.input || 0) + estimatedOutput
      };
      
      this.logger.debug?.(`Estimated ${estimatedOutput} tokens for run ${data.runId}`);
    }
  }

  /**
   * 获取时间线详情（包含上下文快照）
   */
  async getTimelineDetail(runId: string, timestamp: number): Promise<any> {
    const requests = await this.storage.getRequests({ runId, limit: 1000 });
    
    // 找到指定时间点的请求
    const pointRequest = requests.find(r => Math.abs(r.timestamp - timestamp) < 60000);
    if (!pointRequest) return null;

    // 获取该时间点之前的所有请求作为上下文
    const contextRequests = requests.filter(r => r.timestamp <= timestamp).slice(-20);
    
    // 构建上下文快照
    const contextSnapshot = contextRequests.map((req, idx) => {
      const prevReq = idx > 0 ? contextRequests[idx - 1] : null;
      return {
        id: req.runId,
        role: req.type === 'input' ? 'user' : 'assistant',
        content: req.prompt ? this.truncateText(req.prompt, 500) : 'No content',
        tokens: req.usage?.total || 0,
        timestamp: req.timestamp,
        type: req.type,
        status: 'success' as const
      };
    });

    // 计算与上一个时间点的对比
    const prevTimestamp = contextRequests.length > 1 ? contextRequests[contextRequests.length - 2].timestamp : undefined;
    const comparison = prevTimestamp ? {
      prevTimestamp,
      messagesDelta: 1,
      tokensDelta: pointRequest.usage?.total || 0,
      utilizationDelta: 5,
      addedMessages: [contextSnapshot[contextSnapshot.length - 1]],
      removedMessages: [] as any[]
    } : undefined;

    return {
      timestamp,
      tokens: contextRequests.reduce((sum, r) => sum + (r.usage?.total || 0), 0),
      messages: contextRequests.length,
      utilization: Math.min(0.95, contextRequests.reduce((sum, r) => sum + (r.usage?.total || 0), 0) / this.getModelContextWindow(pointRequest.model)),
      summaryApplied: false,
      contextSnapshot,
      comparison
    };
  }

  /**
   * 对比两个时间点
   */
  async compareTimelinePoints(runId: string, timestamp1: number, timestamp2: number): Promise<any> {
    const requests = await this.storage.getRequests({ runId, limit: 1000 });
    
    // 找到两个时间点的请求
    const point1 = requests.find(r => Math.abs(r.timestamp - timestamp1) < 60000);
    const point2 = requests.find(r => Math.abs(r.timestamp - timestamp2) < 60000);
    
    if (!point1 || !point2) return null;

    const earlier = timestamp1 < timestamp2 ? point1 : point2;
    const later = timestamp1 < timestamp2 ? point2 : point1;

    // 获取两个时间点之间的请求
    const betweenRequests = requests.filter(r => 
      r.timestamp > earlier.timestamp && r.timestamp <= later.timestamp
    );

    return {
      timestamp1: earlier.timestamp,
      timestamp2: later.timestamp,
      messagesDelta: betweenRequests.length,
      tokensDelta: betweenRequests.reduce((sum, r) => sum + (r.usage?.total || 0), 0),
      utilizationDelta: 10,
      addedMessages: betweenRequests.map(req => ({
        id: req.runId,
        role: req.type === 'input' ? 'user' : 'assistant',
        content: req.prompt ? this.truncateText(req.prompt, 200) : 'No content',
        tokens: req.usage?.total || 0,
        timestamp: req.timestamp
      })),
      removedMessages: [] as any[]
    };
  }
}
