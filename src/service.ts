/**
 * ContextScope Service
 * 
 * Core service that handles request analysis, statistics, and alerts
 */

import type { PluginLogger } from 'openclaw/plugin-sdk/core';
import type { RequestAnalyzerStorage } from './storage.js';
import type { PluginConfig } from './config.js';

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

export class RequestAnalyzerService {
  private storage: RequestAnalyzerStorage;
  private config: PluginConfig;
  private logger: PluginLogger;

  constructor(params: {
    storage: RequestAnalyzerStorage;
    config: PluginConfig;
    logger: PluginLogger;
  }) {
    this.storage = params.storage;
    this.config = params.config;
    this.logger = params.logger;
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

      await this.storage.captureRequest(data);
      this.logger.debug?.(`Captured response for run ${data.runId}`);
    } catch (error) {
      this.logger.error(`Failed to capture response: ${error}`);
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

  async getStorageStats(): Promise<any> {
    return await this.storage.getStats();
  }

  private anonymizeContent(data: any): any {
    // Simple anonymization - in production, use more sophisticated methods
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

    return anonymized;
  }

  private anonymizeText(text: string): string {
    // Replace emails, phone numbers, API keys, etc.
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
    // Simplified cost estimation - in production, use actual pricing
    const totalTokens = usage.total || (usage.input || 0) + (usage.output || 0);
    
    // Rough cost estimates per 1K tokens (USD)
    const costPer1K: Record<string, number> = {
      'gpt-4': 0.06,
      'gpt-4-turbo': 0.03,
      'gpt-3.5-turbo': 0.002,
      'claude-3-opus': 0.075,
      'claude-3-sonnet': 0.015,
      'claude-3-haiku': 0.003,
      'default': 0.01
    };

    const modelKey = Object.keys(costPer1K).find(key => model.toLowerCase().includes(key)) || 'default';
    const cost = (totalTokens / 1000) * costPer1K[modelKey];
    
    return cost;
  }
}