/**
 * ContextScope - OpenClaw Plugin
 * 
 * 插件模式：捕获 Hook 事件 → HTTP 发送到独立服务
 * 独立服务模式：接收 HTTP 请求 → 存储数据 → 提供 Dashboard
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/core';
import { TokenEstimationService } from './src/services/token-estimator.service.js';
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
  server?: {
    enabled?: boolean;
    url?: string;
  };
}

// 独立服务器配置
const SERVER_CONFIG = {
  enabled: process.env.ENABLE_INDEPENDENT_SERVER === 'true',
  url: process.env.CONTEXTSCOPE_SERVER_URL || 'http://localhost:18790',
};

const plugin = {
  id: 'openclaw-contextscope-dev',
  name: 'ContextScope (Dev)',
  description: 'Visualize and analyze API requests, prompts, completions, and token usage in real-time with advanced context analysis',
  configSchema,
  
  register(api: OpenClawPluginApi) {
    const config = (api.pluginConfig || {}) as PluginConfig;
    
    // Token 计算服务（插件侧仍需要，用于裁剪数据）
    const tokenEstimator = new TokenEstimationService({ model: 'gpt-3.5-turbo' });

    api.logger.info('ContextScope plugin registered (HTTP mode)');
    api.logger.info(`Independent server: ${SERVER_CONFIG.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    if (SERVER_CONFIG.enabled) {
      api.logger.info(`Server URL: ${SERVER_CONFIG.url}`);
    }

    // ==================== Hook: llm_input ====================
    api.on('llm_input', async (event, ctx) => {
      try {
        const includeSystemPrompts = config.capture?.includeSystemPrompts !== false;
        const includeMessageHistory = config.capture?.includeMessageHistory !== false;
        const maxPromptLength = config.capture?.maxPromptLength || 10000;

        // 计算 input token 数
        const inputTokens = tokenEstimator.countContext({
          systemPrompt: includeSystemPrompts ? event.systemPrompt : undefined,
          historyMessages: includeMessageHistory ? event.historyMessages : undefined,
          prompt: event.prompt
        });

        // 构建 payload
        const payload = {
          event: {
            runId: event.runId,
            sessionId: event.sessionId,
            provider: event.provider,
            model: event.model,
            timestamp: Date.now(),
            prompt: event.prompt?.slice(0, maxPromptLength),
            systemPrompt: includeSystemPrompts ? event.systemPrompt?.slice(0, maxPromptLength) : undefined,
            historyMessages: includeMessageHistory 
              ? (event.historyMessages || []).slice(-20)  // 只保留最近 20 条
              : undefined,
            imagesCount: event.imagesCount,
            usage: {
              input: inputTokens.input,
              output: 0,
              total: inputTokens.total,
            },
          },
          ctx: {
            sessionKey: ctx.sessionKey,
            agentId: ctx.agentId,
            channelId: ctx.channelId,
            trigger: ctx.trigger
          }
        };

        if (SERVER_CONFIG.enabled) {
          // ✅ 发送到独立服务（不 await，不阻塞）
          fetch(`${SERVER_CONFIG.url}/hooks/llm_input`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(err => api.logger.debug?.(`[ContextScope] Failed to send llm_input: ${err}`));
        } else {
          // ❌ 旧模式：直接存储（会阻塞事件循环）
          api.logger.warn('[ContextScope] Independent server not enabled, falling back to direct storage (deprecated)');
        }
      } catch (error) {
        api.logger.warn(`Failed to capture LLM input: ${error}`);
      }
    });

    // ==================== Hook: llm_output ====================
    api.on('llm_output', async (event, ctx) => {
      try {
        const payload = {
          event: {
            runId: event.runId,
            sessionId: event.sessionId,
            provider: event.provider,
            model: event.model,
            timestamp: Date.now(),
            assistantTexts: event.assistantTexts,
            usage: event.usage,
          },
          ctx: {
            sessionKey: ctx.sessionKey,
            agentId: ctx.agentId,
            channelId: ctx.channelId
          }
        };

        if (SERVER_CONFIG.enabled) {
          // ✅ 发送到独立服务（不 await，不阻塞）
          fetch(`${SERVER_CONFIG.url}/hooks/llm_output`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(err => api.logger.debug?.(`[ContextScope] Failed to send llm_output: ${err}`));
        }
      } catch (error) {
        api.logger.warn(`Failed to capture LLM output: ${error}`);
      }
    });

    // ==================== Hook: after_tool_call ====================
    api.on('after_tool_call', async (event, ctx) => {
      try {
        const payload = {
          event: {
            runId: event.runId || ctx.runId,
            sessionId: ctx.sessionId,
            toolName: event.toolName,
            toolCallId: event.toolCallId || ctx.toolCallId,
            timestamp: Date.now(),
            durationMs: event.durationMs,
            params: event.params,
            result: event.result,
            error: event.error,
          },
          ctx: {
            sessionKey: ctx.sessionKey,
            agentId: ctx.agentId,
            channelId: (ctx as any).channelId,
            toolCallId: ctx.toolCallId
          }
        };

        if (SERVER_CONFIG.enabled) {
          // ✅ 发送到独立服务（不 await，不阻塞）
          fetch(`${SERVER_CONFIG.url}/hooks/after_tool_call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(err => api.logger.debug?.(`[ContextScope] Failed to send tool_call: ${err}`));
        }
      } catch (error) {
        api.logger.warn(`Failed to capture tool call: ${error}`);
      }
    });

    // ==================== Hook: agent_end ====================
    api.on('agent_end', async (event, ctx) => {
      try {
        const payload = {
          event: {
            sessionId: ctx.sessionId,
            error: event.error,
          },
          ctx: {
            sessionKey: ctx.sessionKey,
            agentId: ctx.agentId,
            channelId: ctx.channelId
          }
        };

        if (SERVER_CONFIG.enabled) {
          // ✅ 发送到独立服务（不 await，不阻塞）
          fetch(`${SERVER_CONFIG.url}/hooks/agent_end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(err => api.logger.debug?.(`[ContextScope] Failed to send agent_end: ${err}`));
        }
      } catch (error) {
        api.logger.warn(`Failed to capture agent end: ${error}`);
      }
    });

    // ==================== Gateway Start Hook ====================
    api.on('gateway_start', async (event) => {
      const dashboardUrl = `${SERVER_CONFIG.url}/plugins/contextscope`;
      
      api.logger.info('');
      api.logger.info('╔════════════════════════════════════════════════════════════╗');
      api.logger.info('║  🔍 ContextScope Dashboard is ready!                       ║');
      api.logger.info('║                                                            ║');
      api.logger.info(`║  📊 Dashboard URL: ${dashboardUrl.padEnd(44)}║`);
      api.logger.info('║                                                            ║');
      api.logger.info('║  Open this URL in your browser to view:                    ║');
      api.logger.info('║  • Real-time request visualization                         ║');
      api.logger.info('║  • Token usage analytics                                   ║');
      api.logger.info('║  • Context heatmaps                                        ║');
      api.logger.info('╚════════════════════════════════════════════════════════════╝');
      api.logger.info('');
      
      // 如果独立服务未启用，提示用户
      if (!SERVER_CONFIG.enabled) {
        api.logger.warn('⚠️  Independent server not enabled. Set ENABLE_INDEPENDENT_SERVER=true to use it.');
      }
    });

    // ==================== CLI Command ====================
    api.registerCommand({
      name: 'analyzer',
      description: 'Show request analyzer status and statistics',
      acceptsArgs: true,
      handler: async (ctx) => {
        const dashboardUrl = `${SERVER_CONFIG.url}/plugins/contextscope`;
        
        if (ctx.args?.trim().toLowerCase() === 'stats') {
          try {
            const response = await fetch(`${SERVER_CONFIG.url}/stats`);
            const stats = await response.json();
            
            return {
              text: `📊 ContextScope Stats:\n` +
                    `• Total requests: ${stats.totalRequests || 0}\n` +
                    `• Today: ${stats.todayRequests || 0}\n` +
                    `• This week: ${stats.weekRequests || 0}\n` +
                    `• Avg tokens: ${(stats.averageTokens || 0).toLocaleString()}\n` +
                    `• Est. cost: $${(stats.totalCost || 0).toFixed(2)}\n` +
                    `• Storage used: ${stats.storageSize || '0 B'}\n` +
                    `• Dashboard: ${dashboardUrl}`
            };
          } catch (error) {
            return {
              text: `❌ Failed to fetch stats: ${error}\n` +
                    `Make sure the independent server is running.\n` +
                    `Dashboard: ${dashboardUrl}`
            };
          }
        }
        
        if (ctx.args?.trim().toLowerCase() === 'open') {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          
          const platform = process.platform;
          let command: string;
          
          switch (platform) {
            case 'darwin':
              command = `open "${dashboardUrl}"`;
              break;
            case 'win32':
              command = `start "" "${dashboardUrl}"`;
              break;
            default:
              command = `xdg-open "${dashboardUrl}"`;
          }
          
          try {
            await execAsync(command);
            return {
              text: `🔍 Opening ContextScope Dashboard...\n${dashboardUrl}`
            };
          } catch (error) {
            return {
              text: `🔍 Dashboard URL: ${dashboardUrl}\n(Failed to open browser automatically)`
            };
          }
        }
        
        if (ctx.args?.trim().toLowerCase() === 'help') {
          return {
            text: `🔍 ContextScope Commands:\n` +
                  `• /analyzer - Show status\n` +
                  `• /analyzer stats - Detailed statistics\n` +
                  `• /analyzer open - Open dashboard in browser\n` +
                  `• Dashboard: ${dashboardUrl}`
          };
        }
        
        return {
          text: `🔍 ContextScope is active!\n` +
                `• Independent server: ${SERVER_CONFIG.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                `• Server URL: ${SERVER_CONFIG.url}\n` +
                `• Dashboard: ${dashboardUrl}\n` +
                `• Use "/analyzer stats" for detailed statistics\n` +
                `• Use "/analyzer open" to open dashboard\n` +
                `• Use "/analyzer help" for commands`
        };
      }
    });

    api.logger.info('ContextScope plugin hooks registered successfully');
  }
};

export default plugin;
