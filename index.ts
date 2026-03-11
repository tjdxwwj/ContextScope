/**
 * ContextScope
 * 
 * A tool that captures and visualizes API requests,
 * prompts, completions, and token usage data in real-time.
 * 
 * Features:
 * - Real-time request context visualization (like Chrome DevTools Network panel for AI Agents)
 * - Interactive context explorer with expandable/collapsible request chains
 * - Token consumption distribution analysis
 * - Context heatmap showing which historical messages have most impact
 * - Token-level visualization (system prompt, history, tool responses)
 * - Attention heatmap for AI focus analysis
 * - Context evolution timeline showing window compression/summary
 * - Tool call dependency graph
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/core';

interface PluginLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}
import { RequestAnalyzerStorage } from './src/storage.js';
import { RequestAnalyzerService } from './src/service.js';
import { createAnalyzerHttpHandler } from './src/web/handler.js';
import { configSchema } from './src/config.js';

interface PluginConfig {
  storage?: {
    maxRequests?: number;
    retentionDays?: number;
    compression?: boolean;
  };
  visualization?: {
    theme?: 'light' | 'dark' | 'auto';
    autoRefresh?: boolean;
    refreshInterval?: number;
    charts?: string[];
  };
  capture?: {
    includeSystemPrompts?: boolean;
    includeMessageHistory?: boolean;
    anonymizeContent?: boolean;
    maxPromptLength?: number;
  };
  alerts?: {
    enabled?: boolean;
    tokenThreshold?: number;
    costThreshold?: number;
  };
}

const plugin = {
  id: 'contextscope',
  name: 'ContextScope',
  description: 'Visualize and analyze API requests, prompts, completions, and token usage in real-time with advanced context analysis',
  configSchema,
  
  register(api: OpenClawPluginApi) {
    const config = (api.pluginConfig || {}) as PluginConfig;
    const storage = new RequestAnalyzerStorage({
      workspaceDir: api.resolvePath('~/.openclaw/contextscope'),
      maxRequests: config.storage?.maxRequests || 10000,
      retentionDays: config.storage?.retentionDays || 7,
      compression: config.storage?.compression !== false,
      logger: api.logger
    });

    const service = new RequestAnalyzerService({
      storage,
      config,
      logger: api.logger
    });

    // Register HTTP route for dashboard
    api.registerHttpRoute({
      path: '/plugins/contextscope',
      auth: 'plugin',
      match: 'prefix',
      handler: createAnalyzerHttpHandler({ service, config, logger: api.logger })
    });

    // Register hooks for capturing requests
    api.on('llm_input', async (event, ctx) => {
      try {
        const includeSystemPrompts = config.capture?.includeSystemPrompts !== false;
        const includeMessageHistory = config.capture?.includeMessageHistory !== false;
        await service.captureRequest({
          type: 'input',
          runId: event.runId,
          sessionId: event.sessionId,
          sessionKey: ctx.sessionKey,
          provider: event.provider,
          model: event.model,
          timestamp: Date.now(),
          prompt: event.prompt,
          systemPrompt: includeSystemPrompts ? event.systemPrompt : undefined,
          historyMessages: includeMessageHistory ? event.historyMessages : undefined,
          imagesCount: event.imagesCount,
          metadata: {
            agentId: ctx.agentId,
            channelId: ctx.channelId,
            trigger: ctx.trigger
          }
        });
      } catch (error) {
        api.logger.warn(`Failed to capture LLM input: ${error}`);
      }
    });

    api.on('llm_output', async (event, ctx) => {
      try {
        const rawUsage = event.usage;
        const usage = rawUsage
          ? {
              input: rawUsage.input,
              output: rawUsage.output,
              cacheRead: rawUsage.cacheRead,
              cacheWrite: rawUsage.cacheWrite,
              total: rawUsage.total ?? (rawUsage as { totalTokens?: number }).totalTokens,
            }
          : undefined;
        await service.captureResponse({
          type: 'output',
          runId: event.runId,
          sessionId: event.sessionId,
          sessionKey: ctx.sessionKey,
          provider: event.provider,
          model: event.model,
          timestamp: Date.now(),
          assistantTexts: event.assistantTexts,
          usage,
          metadata: {
            agentId: ctx.agentId,
            channelId: ctx.channelId
          }
        });

        // Check alerts
        if (config.alerts?.enabled && usage) {
          await service.checkAlerts({
            runId: event.runId,
            sessionId: event.sessionId,
            usage,
            provider: event.provider,
            model: event.model
          });
        }
      } catch (error)
      {
        api.logger.warn(`Failed to capture LLM output: ${error}`);
      }
    });

    api.on('after_tool_call', async (event, ctx) => {
      try {
        const now = Date.now();
        const runId = (event.runId || ctx.runId || '').trim();
        if (runId) {
          const durationMs = typeof event.durationMs === 'number' ? Math.max(0, event.durationMs) : undefined;
          await service.captureToolCall({
            runId,
            sessionId: ctx.sessionId,
            sessionKey: ctx.sessionKey,
            toolName: event.toolName,
            toolCallId: event.toolCallId || ctx.toolCallId,
            timestamp: now,
            startedAt: durationMs !== undefined ? now - durationMs : undefined,
            durationMs,
            params: event.params,
            result: event.result,
            error: event.error,
            metadata: {
              agentId: ctx.agentId
            }
          });
        }

        if (event.toolName === 'sessions_spawn') {
          const parentRunId = runId;
          if (!parentRunId) {
            return;
          }

          const details =
            event.result && typeof event.result === 'object'
              ? ((event.result as any).details ?? event.result)
              : undefined;

          const childRunId = typeof details?.runId === 'string' ? details.runId.trim() : '';
          if (!childRunId) {
            return;
          }

          const childSessionKey =
            typeof details?.childSessionKey === 'string' ? details.childSessionKey.trim() : undefined;
          const runtimeParam =
            typeof event.params?.runtime === 'string' ? event.params.runtime.trim() : '';
          const runtime = runtimeParam === 'acp' || runtimeParam === 'subagent' ? runtimeParam : undefined;
          const mode = details?.mode === 'run' || details?.mode === 'session' ? details.mode : undefined;
          const label = typeof details?.label === 'string' ? details.label.trim() : undefined;

          await service.captureSubagentLink({
            kind: 'spawn',
            parentRunId,
            childRunId,
            parentSessionId: ctx.sessionId,
            parentSessionKey: ctx.sessionKey,
            childSessionKey,
            runtime,
            mode,
            label,
            toolCallId: ctx.toolCallId,
            timestamp: now,
            metadata: {
              agentId: ctx.agentId
            }
          });
        }

        if (event.toolName === 'sessions_send') {
          const parentRunId = runId;
          if (!parentRunId) {
            return;
          }
          const details =
            event.result && typeof event.result === 'object'
              ? ((event.result as any).details ?? event.result)
              : undefined;
          const targetSessionKey =
            typeof details?.sessionKey === 'string'
              ? details.sessionKey.trim()
              : typeof event.params?.sessionKey === 'string'
                ? event.params.sessionKey.trim()
                : undefined;
          const sendRunId = typeof details?.runId === 'string' ? details.runId.trim() : undefined;

          if (targetSessionKey) {
            await service.captureSubagentLink({
              kind: 'send',
              parentRunId,
              childRunId: sendRunId,
              parentSessionId: ctx.sessionId,
              parentSessionKey: ctx.sessionKey,
              childSessionKey: targetSessionKey,
              toolCallId: ctx.toolCallId,
              timestamp: now,
              metadata: {
                agentId: ctx.agentId
              }
            });
          }
        }
      } catch (error) {
        api.logger.warn(`Failed to capture subagent link: ${error}`);
      }
    });

    api.on('subagent_ended', async (event, ctx) => {
      try {
        const childRunId = typeof event.runId === 'string' ? event.runId.trim() : '';
        if (!childRunId) {
          return;
        }

        const outcomeMap: Record<string, 'success' | 'error' | 'timeout' | 'aborted' | 'unknown'> = {
          ok: 'success',
          error: 'error',
          timeout: 'timeout',
          killed: 'aborted',
          reset: 'aborted',
          deleted: 'unknown'
        };
        const mapped = event.outcome ? outcomeMap[event.outcome] : undefined;

        await service.updateSubagentLinkByChildRunId({
          childRunId,
          patch: {
            endedAt: typeof event.endedAt === 'number' ? event.endedAt : Date.now(),
            outcome: mapped ?? 'unknown',
            error: typeof event.error === 'string' ? event.error : undefined,
            metadata: {
              targetSessionKey: event.targetSessionKey,
              reason: event.reason,
              targetKind: event.targetKind
            }
          }
        });
      } catch (error) {
        api.logger.warn(`Failed to capture subagent ended: ${error}`);
      }
    });

    // Register service for cleanup
    api.registerService({
      id: 'contextscope',
      start: async () => {
        await storage.initialize();
        api.logger.info('ContextScope plugin started');
      },
      stop: async () => {
        await storage.close();
        api.logger.info('ContextScope plugin stopped');
      }
    });

    // Register CLI command
    api.registerCommand({
      name: 'analyzer',
      description: 'Show request analyzer status and statistics',
      acceptsArgs: true,
      handler: async (ctx) => {
        const stats = await service.getStats();
        const storageStats = await service.getStorageStats();
        const args = ctx.args?.trim().toLowerCase();
        const dashboardUrl = 'http://localhost:18789/plugins/contextscope';
        
        if (args === 'stats') {
          return {
            text: `📊 ContextScope Stats:\n` +
                  `• Total requests: ${stats.totalRequests}\n` +
                  `• Today: ${stats.todayRequests}\n` +
                  `• This week: ${stats.weekRequests}\n` +
                  `• Avg tokens: ${stats.averageTokens.toLocaleString()}\n` +
                  `• Est. cost: $${stats.totalCost.toFixed(2)}\n` +
                  `• Storage used: ${storageStats.storageSize}\n` +
                  `• Dashboard: ${dashboardUrl}`
          };
        }
        
        if (args === 'help') {
          return {
            text: `🔍 ContextScope Commands:\n` +
                  `• /analyzer - Show status\n` +
                  `• /analyzer stats - Detailed statistics\n` +
                  `• Dashboard: ${dashboardUrl}`
          };
        }
        
        return {
          text: `🔍 ContextScope is active!\n` +
                `• Capturing requests in real-time\n` +
                `• Advanced context analysis enabled\n` +
                `• Dashboard: ${dashboardUrl}\n` +
                `• Use "/analyzer stats" for detailed statistics\n` +
                `• Use "/analyzer help" for commands`
        };
      }
    });

    api.logger.info('ContextScope plugin registered successfully');
  }
};

export default plugin;
