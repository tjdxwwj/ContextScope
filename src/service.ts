/**
 * ContextScope Service
 * 
 * Core service that handles request analysis, statistics, and alerts
 */

import type {
  RequestAnalyzerStorage,
  RequestData,
  RequestListItem,
  RequestQueryFilters,
  SubagentLinkData,
  ToolCallData,
} from './storage.js';
import type { PluginConfig } from './config.js';
import { ContextAnalyzer, type AnalysisResult } from './analyzer.js';
import { TokenEstimationService } from './token-estimator.js';
import type { ChainResponse } from './types-chain.js';
import type { PluginLogger, TaskData, TaskTreeNode } from './types.js';
import { estimateCost } from './types.js';
import type {
  AlertContext,
  AnalysisStats,
  ContextDistributionResponse,
  DetailedAnalysis,
  ModelCostInfo,
  OpenRouterModelsResponse,
} from './service-types.js';
import {
  compareTimelinePoints as compareTimelinePointsHelper,
  getChain as getChainHelper,
  getDetailedAnalysis as getDetailedAnalysisHelper,
  getSessionAnalysis as getSessionAnalysisHelper,
  getTimelineDetail as getTimelineDetailHelper,
  type TimelineDetailResponse,
  type TimelinePointsComparisonResponse
} from './service-analysis-helpers.js';
import { getContextDistribution as getContextDistributionHelper } from './service-context-helpers.js';
export type {
  AlertContext,
  AnalysisStats,
  ContextDistributionResponse,
  DependencyGraphData,
  DetailedAnalysis,
  HeatmapData,
  ModelCostInfo,
  OpenRouterModelPricing,
  OpenRouterModelsResponse,
  TimelineData,
  TokenDistribution,
  TokenVisualization
} from './service-types.js';

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

  async captureRequest(data: RequestData): Promise<void> {
    try {
      const payload = this.prepareRequestPayload(data);
      await this.storage.captureRequest(payload);
      this.logger.debug?.(`Captured ${payload.type} request for run ${payload.runId}`);
    } catch (error) {
      this.logger.error(`Failed to capture request: ${error}`);
      throw error;
    }
  }

  async captureResponse(data: RequestData): Promise<void> {
    try {
      const payload = this.prepareRequestPayload(data);

      const estimate = this.tokenEstimator.estimateUsage(payload);
      if (estimate) {
        this.logger.info?.(
          `Estimated tokens for run ${payload.runId}: ` +
          `input=${estimate.input}, output=${estimate.output}, total=${estimate.total}`
        );
      }

      await this.storage.captureRequest(payload);
      this.logger.debug?.(`Captured response for run ${payload.runId}`);
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

  async getTask(taskId: string): Promise<TaskData | undefined> {
    return await this.storage.getTask(taskId);
  }

  async getRecentTasks(limit = 50, sessionId?: string, status?: string): Promise<TaskData[]> {
    const tasks = await this.storage.getRecentTasks(limit, sessionId);
    
    if (status) {
      return tasks.filter(t => t.status === status);
    }
    
    return tasks;
  }

  async getTaskTree(taskId: string): Promise<TaskTreeNode | null> {
    return await this.storage.getTaskTree(taskId);
  }

  async getTasksBySessionId(sessionId: string, limit = 50): Promise<TaskData[]> {
    return await this.storage.getTasksBySessionId(sessionId, limit);
  }

  async captureToolCall(data: ToolCallData): Promise<void> {
    try {
      if (this.config.capture?.anonymizeContent !== false) {
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
    const estimatedCost = estimateCost(usage, provider, model);

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
        stats.totalCost += estimateCost(request.usage, request.provider, request.model);
      }

      // Hourly distribution
      const hour = new Date(request.timestamp).getHours();
      stats.hourlyDistribution[hour]++;
    }

    stats.averageTokens = costCalculations > 0 ? Math.round(totalTokens / costCalculations) : 0;

    return stats;
  }

  async getRequests(filters: RequestQueryFilters = {}): Promise<any[]> {
    return await this.storage.getRequests(filters);
  }

  async getRequestSummaries(filters: RequestQueryFilters = {}): Promise<RequestListItem[]> {
    return await this.storage.getRequestSummaries(filters);
  }

  async getSubagentLinks(filters: {
    parentRunId?: string;
    childRunId?: string;
    parentSessionId?: string;
    startTime?: number;
    endTime?: number;
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

  async clearCacheByDate(date: string): Promise<{
    date: string;
    removedRequests: number;
    removedSubagentLinks: number;
    removedToolCalls: number;
  }> {
    return await this.storage.clearByDate(date);
  }

  async clearAllCache(): Promise<{
    removedRequests: number;
    removedSubagentLinks: number;
    removedToolCalls: number;
  }> {
    return await this.storage.clearAll();
  }

  async getDetailedAnalysis(runId: string): Promise<DetailedAnalysis | null> {
    return await getDetailedAnalysisHelper({
      storage: this.storage,
      analyzer: this.analyzer,
      logger: this.logger,
      truncateText: this.truncateText.bind(this)
    }, runId);
  }

  async getSessionAnalysis(sessionId: string, filters: { startTime?: number; endTime?: number } = {}): Promise<{
    totalTokens: number;
    totalRequests: number;
    averageTokensPerRequest: number;
    topModels: Array<{ model: string; count: number }>;
    tokenTrend: Array<{ timestamp: number; tokens: number }>;
  } | null> {
    return await getSessionAnalysisHelper({
      storage: this.storage,
      analyzer: this.analyzer,
      logger: this.logger,
      truncateText: this.truncateText.bind(this)
    }, sessionId, filters);
  }

  private prepareRequestPayload(data: RequestData): RequestData {
    let payload = data;
    if (this.config.capture?.anonymizeContent !== false) {
      payload = this.anonymizeContent(payload);
    }
    const maxPromptLength = this.config.capture?.maxPromptLength;
    if (maxPromptLength && payload.prompt) {
      payload = {
        ...payload,
        prompt: this.truncateText(payload.prompt, maxPromptLength),
      };
    }
    return payload;
  }

  private anonymizeContent(data: RequestData): RequestData {
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
      anonymized.historyMessages = this.anonymizeAny(anonymized.historyMessages) as unknown[];
    }

    return anonymized as RequestData;
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
  async getTimelineDetail(runId: string, timestamp: number): Promise<TimelineDetailResponse | null> {
    return await getTimelineDetailHelper({
      storage: this.storage,
      analyzer: this.analyzer,
      logger: this.logger,
      truncateText: this.truncateText.bind(this)
    }, runId, timestamp);
  }

  async getChain(runId: string, limit = 100, offset = 0): Promise<ChainResponse | null> {
    return await getChainHelper({
      storage: this.storage,
      analyzer: this.analyzer,
      logger: this.logger,
      truncateText: this.truncateText.bind(this)
    }, runId, limit, offset);
  }

  async compareTimelinePoints(runId: string, timestamp1: number, timestamp2: number): Promise<TimelinePointsComparisonResponse | null> {
    return await compareTimelinePointsHelper({
      storage: this.storage,
      analyzer: this.analyzer,
      logger: this.logger,
      truncateText: this.truncateText.bind(this)
    }, runId, timestamp1, timestamp2);
  }

  async getContextDistribution(runId: string): Promise<ContextDistributionResponse | null> {
    return await getContextDistributionHelper({
      storage: this.storage,
      logger: this.logger,
      tokenEstimator: this.tokenEstimator
    }, runId);
  }

  private pricingCache: {
    data: ModelCostInfo[];
    timestamp: number;
    ttl: number; // 缓存有效期（毫秒）
  } | null = null;

  async getOpenRouterPricing(forceRefresh = false): Promise<ModelCostInfo[]> {
    const now = Date.now();
    
    // 检查缓存是否有效
    if (!forceRefresh && this.pricingCache && (now - this.pricingCache.timestamp) < this.pricingCache.ttl) {
      this.logger.debug?.(`Using cached pricing data (${this.pricingCache.data.length} models, ${Math.round((now - this.pricingCache.timestamp) / 1000)}s old)`);
      return this.pricingCache.data;
    }
    
    try {
      this.logger.info?.(`Fetching pricing from OpenRouter API (forceRefresh=${forceRefresh})...`);
      
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        // 10 秒超时（增加超时时间）
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        this.logger.warn(`OpenRouter API returned ${response.status}`);
        // 如果有缓存，返回缓存数据
        if (this.pricingCache) {
          this.logger.info?.('Returning cached pricing data due to API error');
          return this.pricingCache.data;
        }
        return [];
      }

      const data = await response.json() as OpenRouterModelsResponse;
      
      // 转换为简化的价格信息
      const pricingInfo: ModelCostInfo[] = data.data.map(model => {
        const pricing = model.pricing || {};
        const promptPrice = pricing.prompt ? parseFloat(pricing.prompt) : 0;
        const completionPrice = pricing.completion ? parseFloat(pricing.completion) : 0;
        
        // 转换为每 1M tokens 的价格（OpenRouter 返回的是每 token 价格）
        return {
          modelId: model.id,
          modelName: model.name || model.id.split('/').pop() || model.id,
          promptPricePer1M: Math.round(promptPrice * 1_000_000 * 1000) / 1000, // 保留 3 位小数
          completionPricePer1M: Math.round(completionPrice * 1_000_000 * 1000) / 1000,
          contextLength: model.context_length,
          provider: model.id.split('/')[0]
        };
      });

      // 按模型名称排序
      pricingInfo.sort((a, b) => a.modelName.localeCompare(b.modelName));

      // 更新缓存（有效期 30 分钟）
      this.pricingCache = {
        data: pricingInfo,
        timestamp: now,
        ttl: 30 * 60 * 1000 // 30 minutes
      };

      this.logger.info?.(`Fetched ${pricingInfo.length} models from OpenRouter pricing API, cached for 30min`);
      return pricingInfo;
    } catch (error) {
      this.logger.error(`Failed to fetch OpenRouter pricing: ${error}`);
      // 如果有缓存，返回缓存数据
      if (this.pricingCache) {
        this.logger.info?.('Returning cached pricing data due to error');
        return this.pricingCache.data;
      }
      return [];
    }
  }

  /**
   * 计算指定模型调用的实际成本
   */
  calculateModelCost(usage: { input?: number; output?: number; total?: number }, modelId: string): number {
    const totalTokens = usage.total || (usage.input || 0) + (usage.output || 0);
    if (totalTokens === 0) return 0;

    // 这里可以缓存价格数据，避免每次都调用 API
    // 简化版本：使用硬编码的常见模型价格
    const modelPricing: Record<string, { input: number; output: number }> = {
      // OpenAI
      'openai/gpt-4': { input: 0.03, output: 0.06 },
      'openai/gpt-4-turbo': { input: 0.01, output: 0.03 },
      'openai/gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
      'openai/gpt-4o': { input: 0.005, output: 0.015 },
      'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      
      // Anthropic
      'anthropic/claude-3-opus': { input: 0.015, output: 0.075 },
      'anthropic/claude-3-sonnet': { input: 0.003, output: 0.015 },
      'anthropic/claude-3-haiku': { input: 0.00025, output: 0.00125 },
      'anthropic/claude-3-5-sonnet': { input: 0.003, output: 0.015 },
      
      // Google
      'google/gemini-pro': { input: 0.00025, output: 0.0005 },
      'google/gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
      
      // Meta
      'meta-llama/llama-3-70b-instruct': { input: 0.0008, output: 0.0008 },
      'meta-llama/llama-3-8b-instruct': { input: 0.00005, output: 0.00005 },
      
      // Qwen (Alibaba)
      'qwen/qwen-2.5-72b-instruct': { input: 0.0004, output: 0.0008 },
      'qwen/qwen-plus': { input: 0.0004, output: 0.0012 },
      
      // DeepSeek
      'deepseek/deepseek-chat': { input: 0.00027, output: 0.0011 },
      'deepseek/deepseek-coder': { input: 0.00027, output: 0.0011 },
    };

    const pricing = modelPricing[modelId] || { input: 0.001, output: 0.002 }; // 默认价格
    
    const inputCost = (usage.input || 0) / 1_000_000 * pricing.input;
    const outputCost = (usage.output || 0) / 1_000_000 * pricing.output;
    
    return inputCost + outputCost;
  }
}
