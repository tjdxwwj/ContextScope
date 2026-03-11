/**
 * ContextScope Service
 * 
 * Core service that handles request analysis, statistics, and alerts
 */

import type { RequestAnalyzerStorage, SubagentLinkData, ToolCallData } from './storage.js';
import type { PluginConfig } from './config.js';
import { ContextAnalyzer, type AnalysisResult, type AnalysisInsight } from './analyzer.js';
import { TokenEstimationService } from './token-estimator.js';
import type { ChainResponse, ChainItem, ChainStats } from './types-chain.js';

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
  private tokenEstimator: TokenEstimationService;

  constructor(params: {
    storage: RequestAnalyzerStorage;
    config: PluginConfig;
    logger: PluginLogger;
  }) {
    this.storage = params.storage;
    this.config = params.config;
    this.logger = params.logger;
    this.analyzer = new ContextAnalyzer();
    this.tokenEstimator = new TokenEstimationService();
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

      // 当 API 没有返回 usage 时，使用服务端估算器估算 token 数量
      const estimate = this.tokenEstimator.estimateUsage(data);
      if (estimate) {
        this.logger.info?.(
          `Estimated tokens for run ${data.runId}: ` +
          `input=${estimate.input}, output=${estimate.output}, total=${estimate.total}`
        );
      }

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
   * 估算消息数组的 token 数量
   */
  private estimateMessagesTokens(messages: any[]): number {
    if (!messages || messages.length === 0) return 0;
    
    let total = 0;
    messages.forEach(msg => {
      if (typeof msg.content === 'string') {
        total += this.estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        // 处理多模态消息
        msg.content.forEach((item: any) => {
          if (item.type === 'text' && item.text) {
            total += this.estimateTokens(item.text);
          }
        });
      }
    });
    
    return total;
  }

  /**
   * 当 API 没有返回 usage 时，根据完整上下文估算 token 数量
   */
  private estimateUsage(data: any): void {
    if (!data.usage || data.usage.totalTokens === 0) {
      let estimatedInput = 0;
      let estimatedOutput = 0;
      
      // 估算 input tokens（system prompt + history + current prompt）
      if (data.systemPrompt) {
        estimatedInput += this.estimateTokens(data.systemPrompt);
        this.logger.debug?.(`System prompt: ${this.estimateTokens(data.systemPrompt)} tokens`);
      }
      
      if (data.historyMessages && data.historyMessages.length > 0) {
        const historyTokens = this.estimateMessagesTokens(data.historyMessages);
        estimatedInput += historyTokens;
        this.logger.debug?.(`History messages: ${historyTokens} tokens`);
      }
      
      if (data.prompt) {
        const promptTokens = this.estimateTokens(data.prompt);
        estimatedInput += promptTokens;
        this.logger.debug?.(`Current prompt: ${promptTokens} tokens`);
      }
      
      // 估算 output tokens
      if (data.assistantTexts && data.assistantTexts.length > 0) {
        const content = data.assistantTexts.join('\n');
        estimatedOutput = this.estimateTokens(content);
        this.logger.debug?.(`Assistant response: ${estimatedOutput} tokens`);
      }
      
      // 更新 usage
      data.usage = {
        input: estimatedInput,
        output: estimatedOutput,
        cacheRead: 0,
        cacheWrite: 0,
        total: estimatedInput + estimatedOutput
      };
      
      this.logger.info?.(`Estimated tokens for run ${data.runId}: input=${estimatedInput}, output=${estimatedOutput}, total=${estimatedInput + estimatedOutput}`);
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
   * Get raw call chain for a runId
   * Returns tools, subagents, inputs, outputs without any analysis
   */
  async getChain(runId: string, limit = 100, offset = 0): Promise<ChainResponse | null> {
    try {
      const requests = await this.storage.getRequests({ runId, limit: 10000 });
      if (requests.length === 0) return null;

      const mainRequest = requests.find(r => r.type === 'input') || requests[0];
      const subagentLinks = await this.storage.getSubagentLinks({ parentRunId: runId, limit: 1000 });
      const toolCalls = await this.storage.getToolCalls({ runId, limit: 1000 });

      const chainItems: ChainItem[] = [];

      // Add requests
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

      // Add tool calls
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

      // Add subagent links
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
            metadata: { agentId: link.childSessionKey, status: link.outcome as any || 'success', error: link.error }
          });
        }
      });

      // Sort descending (most recent first)
      chainItems.sort((a, b) => b.timestamp - a.timestamp);

      // Stats
      const stats: ChainStats = {
        totalItems: chainItems.length,
        inputCount: chainItems.filter(i => i.type === 'input').length,
        outputCount: chainItems.filter(i => i.type === 'output').length,
        toolCallCount: chainItems.filter(i => i.type === 'tool_call' || i.type === 'tool_result').length,
        subagentCount: chainItems.filter(i => i.type === 'subagent_spawn' || i.type === 'subagent_result').length,
        totalTokens: chainItems.reduce((sum, i) => sum + (i.usage?.total || 0), 0)
      };

      const paginatedChain = chainItems.slice(offset, offset + limit);
      const endTime = requests.find(r => r.type === 'output')?.timestamp;

      return {
        runId,
        sessionId: mainRequest.sessionId,
        provider: mainRequest.provider,
        model: mainRequest.model,
        startTime: Math.min(...requests.map(r => r.timestamp)),
        endTime: endTime || Math.max(...requests.map(r => r.timestamp)),
        duration: endTime ? endTime - Math.min(...requests.map(r => r.timestamp)) : undefined,
        pagination: { limit, offset, total: chainItems.length, hasMore: offset + limit < chainItems.length },
        chain: paginatedChain,
        stats
      };
    } catch (error) {
      this.logger.error(`Failed to get chain: ${error}`);
      return null;
    }
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

  /**
   * 获取完整的上下文分布信息
   * 包含 system prompt, user prompt, history, token distribution 等
   */
  async getContextDistribution(runId: string): Promise<ContextDistributionResponse | null> {
    try {
      const requests = await this.storage.getRequests({ runId, limit: 1000 });
      if (requests.length === 0) return null;

      const mainRequest = requests.find(r => r.type === 'input') || requests[0];
      
      // 构建完整的上下文
      const systemPrompt = mainRequest.systemPrompt || '';
      const userPrompt = mainRequest.prompt || '';
      const historyMessages = mainRequest.historyMessages || [];
      
      // 计算各部分的 token 分布
      const tokenDistribution = await this.calculateTokenDistribution(
        systemPrompt,
        userPrompt,
        historyMessages
      );

      // 构建响应
      return {
        runId: mainRequest.runId,
        sessionId: mainRequest.sessionId,
        provider: mainRequest.provider,
        model: mainRequest.model,
        timestamp: mainRequest.timestamp,
        
        // 完整上下文内容
        context: {
          systemPrompt,
          userPrompt,
          history: historyMessages,
          toolCalls: await this.storage.getToolCalls({ runId, limit: 1000 }),
          subagentLinks: await this.storage.getSubagentLinks({ parentRunId: runId, limit: 1000 })
        },
        
        // Token 分布
        tokenDistribution,
        
        // 模型信息
        modelInfo: {
          name: mainRequest.model,
          provider: mainRequest.provider,
          contextWindow: this.getModelContextWindow(mainRequest.model),
          estimatedCost: this.estimateCost(
            { total: tokenDistribution.total },
            mainRequest.provider,
            mainRequest.model
          )
        },
        
        // 统计信息
        stats: {
          totalMessages: historyMessages.length + 1, // +1 for current prompt
          totalTokens: tokenDistribution.total,
          systemPromptPercentage: tokenDistribution.percentages.systemPrompt,
          historyPercentage: tokenDistribution.percentages.history,
          userPromptPercentage: tokenDistribution.percentages.userPrompt,
          toolResponsesPercentage: tokenDistribution.percentages.toolResponses
        }
      };
    } catch (error) {
      this.logger.error(`Failed to get context distribution: ${error}`);
      return null;
    }
  }

  /**
   * 计算 Token 分布
   */
  private async calculateTokenDistribution(
    systemPrompt: string,
    userPrompt: string,
    historyMessages: any[]
  ): Promise<TokenDistribution> {
    const systemTokens = this.estimateTokens(systemPrompt);
    const userPromptTokens = this.estimateTokens(userPrompt);
    const historyTokens = this.estimateMessagesTokens(historyMessages);
    
    // 计算工具响应的 tokens
    let toolResponseTokens = 0;
    historyMessages.forEach(msg => {
      if (msg.role === 'tool' || msg.role === 'toolResult') {
        if (typeof msg.content === 'string') {
          toolResponseTokens += this.estimateTokens(msg.content);
        }
      }
    });

    const total = systemTokens + userPromptTokens + historyTokens;

    return {
      total,
      breakdown: {
        systemPrompt: systemTokens,
        userPrompt: userPromptTokens,
        history: historyTokens,
        toolResponses: toolResponseTokens
      },
      percentages: {
        systemPrompt: total > 0 ? Math.round((systemTokens / total) * 100) : 0,
        userPrompt: total > 0 ? Math.round((userPromptTokens / total) * 100) : 0,
        history: total > 0 ? Math.round((historyTokens / total) * 100) : 0,
        toolResponses: total > 0 ? Math.round((toolResponseTokens / total) * 100) : 0
      }
    };
  }
}

export interface ContextDistributionResponse {
  runId: string;
  sessionId: string;
  provider: string;
  model: string;
  timestamp: number;
  
  // 完整上下文内容
  context: {
    systemPrompt: string;
    userPrompt: string;
    history: any[];
    toolCalls: ToolCallData[];
    subagentLinks: SubagentLinkData[];
  };
  
  // Token 分布
  tokenDistribution: TokenDistribution;
  
  // 模型信息
  modelInfo: {
    name: string;
    provider: string;
    contextWindow: number;
    estimatedCost: number;
  };
  
  // 统计信息
  stats: {
    totalMessages: number;
    totalTokens: number;
    systemPromptPercentage: number;
    historyPercentage: number;
    userPromptPercentage: number;
    toolResponsesPercentage: number;
  };
}

export interface TokenDistribution {
  total: number;
  breakdown: {
    systemPrompt: number;
    userPrompt: number;
    history: number;
    toolResponses: number;
  };
  percentages: {
    systemPrompt: number;
    userPrompt: number;
    history: number;
    toolResponses: number;
  };
}
