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
import { RequestAnalyzerStorage } from './src/storage.js';
import { RequestAnalyzerService } from './src/service.js';
import { createAnalyzerHttpHandler } from './src/web/handler.js';
import { configSchema } from './src/config.js';
import { TokenEstimationService } from './src/token-estimator.js';
import { TaskTracker } from './src/task-tracker.js';

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

    // Token 计算服务
    const tokenEstimator = new TokenEstimationService({ model: 'gpt-3.5-turbo' });

    // 任务追踪器 (新增)
    const taskTracker = new TaskTracker(storage, api.logger, {
      taskTimeoutMs: 600000,  // 10 分钟
      maxActiveTasks: 100,
      enableLogging: true
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
        // 确保任务已创建
        const taskId = await taskTracker.startTask(
          event.sessionId,
          ctx.sessionKey,
          undefined,
          undefined,
          {
            agentId: ctx.agentId,
            channelId: ctx.channelId,
            trigger: ctx.trigger
          }
        );
        
        api.logger.debug?.(`[TaskTracker] llm_input: sessionId=${event.sessionId}, taskId=${taskId}`);
        
        const includeSystemPrompts = config.capture?.includeSystemPrompts !== false;
        const includeMessageHistory = config.capture?.includeMessageHistory !== false;
        
        // 计算 input token 数
        const inputTokens = tokenEstimator.countContext({
          systemPrompt: includeSystemPrompts ? event.systemPrompt : undefined,
          historyMessages: includeMessageHistory ? event.historyMessages : undefined,
          prompt: event.prompt
        });
        
        await service.captureRequest({
          type: 'input',
          runId: event.runId,
          taskId,  // ← 新增：关联 taskId
          sessionId: event.sessionId,
          sessionKey: ctx.sessionKey,
          provider: event.provider,
          model: event.model,
          timestamp: Date.now(),
          prompt: event.prompt,
          systemPrompt: includeSystemPrompts ? event.systemPrompt : undefined,
          historyMessages: includeMessageHistory ? event.historyMessages : undefined,
          imagesCount: event.imagesCount,
          usage: {
            input: inputTokens.input,
            output: 0,
            total: inputTokens.total,
          },
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
        // 确保任务存在
        const taskId = await taskTracker.startTask(event.sessionId, ctx.sessionKey || undefined);
        api.logger.debug?.(`[TaskTracker] llm_output: sessionId=${event.sessionId}, taskId=${taskId}`);
        
        const rawUsage = event.usage;
        
        // 从 storage 获取对应的 input request 来计算准确的 input tokens
        const inputRequest = await storage.getInputForRun(event.runId);
        const inputTokens = inputRequest?.usage?.input ?? 0;
        
        // 优先使用 rawUsage 中的 output，如果没有则尝试从 total 推算
        let outputTokens = 0;
        if (rawUsage) {
          outputTokens = rawUsage.output ?? 0;
          // 如果 output 为 0 但有 total，尝试推算
          if (outputTokens === 0 && rawUsage.total != null) {
            outputTokens = rawUsage.total - (rawUsage.input ?? inputTokens);
          }
        }
        
        const usage = rawUsage
          ? {
              input: inputTokens > 0 ? inputTokens : (rawUsage.input ?? 0),
              output: outputTokens,
              cacheRead: rawUsage.cacheRead,
              cacheWrite: rawUsage.cacheWrite,
              total: rawUsage.total ?? (rawUsage as { totalTokens?: number }).totalTokens,
            }
          : {
              input: inputTokens,
              output: 0,
              total: inputTokens,
            };
        
        // 记录到任务追踪器
        // 先记录到 TaskTracker 获取最新的 task
        const task = await taskTracker.recordLLMCall(
          event.sessionId,
          event.runId,
          inputTokens,
          outputTokens
        );
        
        api.logger.info?.(`[TaskTracker] recordLLMCall: sessionId=${event.sessionId}, taskId=${task?.taskId || 'NULL'}, runId=${event.runId}, input=${inputTokens}, output=${outputTokens}`);
        
        // 如果 outputTokens 为 0 但 rawUsage 有值，记录警告
        if (outputTokens === 0 && rawUsage) {
          api.logger.warn?.(`[TaskTracker] Output tokens is 0 but rawUsage exists: ${JSON.stringify(rawUsage)}`);
        }
        
        await service.captureResponse({
          type: 'output',
          runId: event.runId,
          taskId: task?.taskId,  // ← 新增：传递 taskId
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
        
        // 记录工具调用到任务
        await taskTracker.recordToolCall(ctx.sessionId as string);
        
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
          // 解析子任务信息
          const spawnDetails = event.result && typeof event.result === 'object' ? ((event.result as any).details ?? event.result) : undefined;
          const childSessionKeyForSpawn = typeof spawnDetails?.childSessionKey === 'string' ? spawnDetails.childSessionKey.trim() : undefined;
          
          // 记录子任务生成到任务
          await taskTracker.recordSubagentSpawn(ctx.sessionId as string, childSessionKeyForSpawn);
          
          const parentRunId = runId;
          if (!parentRunId) {
            return;
          }

          const childRunId = typeof spawnDetails?.runId === 'string' ? spawnDetails.runId.trim() : '';
          if (!childRunId) {
            return;
          }

          const childSessionKey = typeof spawnDetails?.childSessionKey === 'string' ? spawnDetails.childSessionKey.trim() : undefined;
          const runtimeParam =
            typeof event.params?.runtime === 'string' ? event.params.runtime.trim() : '';
          const runtime = runtimeParam === 'acp' || runtimeParam === 'subagent' ? runtimeParam : undefined;
          const mode = spawnDetails?.mode === 'run' || spawnDetails?.mode === 'session' ? spawnDetails.mode : undefined;
          const label = typeof spawnDetails?.label === 'string' ? spawnDetails.label.trim() : undefined;

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

    // === Agent End Hook (关键：结束任务) ===
    api.on('agent_end', async (event, ctx) => {
      try {
        let reason: 'completed' | 'error' | 'timeout' | 'aborted' = 'completed';
        
        if (event.error) {
          reason = 'error';
        }
        
        api.logger.debug?.(`[TaskTracker] agent_end: sessionId=${ctx.sessionId}, reason=${reason}`);
        const taskData = await taskTracker.endTask(ctx.sessionId as string, reason, event.error as string | undefined);
        
        if (taskData) {
          const childCount = taskData.childTaskIds?.length || 0;
          const childNote = childCount > 0 ? ` (with ${childCount} subagents)` : '';
          
          api.logger.info(
            `✅ Task ${taskData.taskId}${childNote} completed: ` +
            `${taskData.llmCalls} LLM calls, ` +
            `${taskData.toolCalls} tools, ` +
            `${taskData.subagentSpawns} subagents, ` +
            `0 tokens, ` +
            `$0.0000`
          );
        }
      } catch (error) {
        api.logger.warn(`Failed to end task: ${error}`);
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
