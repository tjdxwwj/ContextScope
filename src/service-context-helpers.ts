import { estimateCost, getModelContextWindow } from './types.js';
import type { TokenEstimationService } from './token-estimator.js';
import type { PluginLogger } from './types.js';
import type { RequestAnalyzerStorage } from './storage.js';
import type { ContextDistributionResponse, TokenDistribution } from './service-types.js';

interface ServiceContextHelperContext {
  storage: RequestAnalyzerStorage;
  logger: PluginLogger;
  tokenEstimator: TokenEstimationService;
}

export async function getContextDistribution(
  ctx: ServiceContextHelperContext,
  runId: string
): Promise<ContextDistributionResponse | null> {
  try {
    const requests = await ctx.storage.getRequests({ runId, limit: 1000 });
    if (requests.length === 0) return null;
    const mainRequest = requests.find(r => r.type === 'input') || requests[0];
    const systemPrompt = mainRequest.systemPrompt || '';
    const userPrompt = mainRequest.prompt || '';
    const historyMessages = mainRequest.historyMessages || [];
    const tokenDistribution = calculateTokenDistribution(ctx.tokenEstimator, systemPrompt, userPrompt, historyMessages);
    return {
      runId: mainRequest.runId,
      sessionId: mainRequest.sessionId,
      provider: mainRequest.provider,
      model: mainRequest.model,
      timestamp: mainRequest.timestamp,
      context: {
        systemPrompt,
        userPrompt,
        history: historyMessages,
        toolCalls: await ctx.storage.getToolCalls({ runId, limit: 1000 }),
        subagentLinks: await ctx.storage.getSubagentLinks({ parentRunId: runId, limit: 1000 })
      },
      tokenDistribution,
      modelInfo: {
        name: mainRequest.model,
        provider: mainRequest.provider,
        contextWindow: getModelContextWindow(mainRequest.model),
        estimatedCost: estimateCost({ total: tokenDistribution.total }, mainRequest.provider, mainRequest.model)
      },
      stats: {
        totalMessages: historyMessages.length + 1,
        totalTokens: tokenDistribution.total,
        systemPromptPercentage: tokenDistribution.percentages.systemPrompt || 0,
        historyPercentage:
          (tokenDistribution.percentages.historyUser || 0) +
          (tokenDistribution.percentages.historyAssistant || 0) +
          (tokenDistribution.percentages.historyTool || 0) +
          (tokenDistribution.percentages.historySystem || 0) +
          (tokenDistribution.percentages.historyOther || 0),
        userPromptPercentage: tokenDistribution.percentages.currentUserPrompt || 0,
        toolResponsesPercentage: tokenDistribution.percentages.historyTool || 0
      }
    };
  } catch (error) {
    ctx.logger.error(`Failed to get context distribution: ${error}`);
    return null;
  }
}

function calculateTokenDistribution(
  tokenEstimator: TokenEstimationService,
  systemPrompt: string,
  userPrompt: string,
  historyMessages: unknown[]
): TokenDistribution {
  const baseBreakdown: Record<string, number> = {
    systemPrompt: tokenEstimator.countTokens(systemPrompt),
    currentUserPrompt: tokenEstimator.countTokens(userPrompt),
    historyUser: 0,
    historyAssistant: 0,
    historyTool: 0,
    historySystem: 0,
    historyOther: 0,
  };
  for (const message of Array.isArray(historyMessages) ? historyMessages : []) {
    const role = typeof (message as { role?: unknown })?.role === 'string' ? (message as { role: string }).role : 'other';
    const contentTokens = estimateMessageTokens(tokenEstimator, message);
    if (role === 'user') baseBreakdown.historyUser += contentTokens;
    else if (role === 'assistant') baseBreakdown.historyAssistant += contentTokens;
    else if (role === 'tool' || role === 'toolResult') baseBreakdown.historyTool += contentTokens;
    else if (role === 'system') baseBreakdown.historySystem += contentTokens;
    else baseBreakdown.historyOther += contentTokens;
  }
  const total = Object.values(baseBreakdown).reduce((sum, value) => sum + value, 0);
  const percentages = Object.entries(baseBreakdown).reduce<Record<string, number>>((acc, [key, value]) => {
    acc[key] = total > 0 ? Math.round((value / total) * 100) : 0;
    return acc;
  }, {});
  return { total, breakdown: baseBreakdown, percentages };
}

function estimateMessageTokens(tokenEstimator: TokenEstimationService, message: unknown): number {
  if (!message || typeof message !== 'object') return 0;
  let total = 0;
  const record = message as Record<string, unknown>;
  const content = record.content;
  if (typeof content === 'string') {
    total += tokenEstimator.countTokens(content);
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if ((item as { type?: unknown })?.type === 'text' && typeof (item as { text?: unknown })?.text === 'string') {
        total += tokenEstimator.countTokens((item as { text: string }).text);
      } else if (item != null) {
        total += tokenEstimator.countTokens(JSON.stringify(item));
      }
    }
  } else if (content != null) {
    total += tokenEstimator.countTokens(JSON.stringify(content));
  }
  const ancillaryFields = ['name', 'tool_call_id', 'tool_calls', 'function_call', 'arguments', 'input', 'output', 'result'];
  for (const field of ancillaryFields) {
    const value = record[field];
    if (value == null) continue;
    if (typeof value === 'string') total += tokenEstimator.countTokens(value);
    else total += tokenEstimator.countTokens(JSON.stringify(value));
  }
  return total;
}
