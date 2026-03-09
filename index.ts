/**
 * ContextScope
 * 
 * A tool that captures and visualizes API requests,
 * prompts, completions, and token usage data in real-time.
 */

import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/core';
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
  description: 'Visualize and analyze API requests, prompts, completions, and token usage in real-time',
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
        await service.captureRequest({
          type: 'input',
          runId: event.runId,
          sessionId: event.sessionId,
          provider: event.provider,
          model: event.model,
          timestamp: Date.now(),
          prompt: event.prompt,
          systemPrompt: event.systemPrompt,
          historyMessages: event.historyMessages,
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
        await service.captureResponse({
          type: 'output',
          runId: event.runId,
          sessionId: event.sessionId,
          provider: event.provider,
          model: event.model,
          timestamp: Date.now(),
          assistantTexts: event.assistantTexts,
          usage: event.usage,
          metadata: {
            agentId: ctx.agentId,
            channelId: ctx.channelId
          }
        });

        // Check alerts
        if (config.alerts?.enabled && event.usage) {
          await service.checkAlerts({
            runId: event.runId,
            sessionId: event.sessionId,
            usage: event.usage,
            provider: event.provider,
            model: event.model
          });
        }
      } catch (error) {
        api.logger.warn(`Failed to capture LLM output: ${error}`);
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
        const args = ctx.args?.trim().toLowerCase();
        
        if (args === 'stats') {
          return {
          text: `📊 ContextScope Stats:\n` +
                `• Total requests: ${stats.totalRequests}\n` +
                `• Today: ${stats.todayRequests}\n` +
                `• This week: ${stats.weekRequests}\n` +
                `• Storage used: ${stats.storageSize}\n` +
                `• Dashboard: ${api.config.gateway?.bindUrl || 'http://localhost:8080'}/plugins/contextscope`
        };
        }
        
        return {
          text: `🔍 ContextScope is active!\n` +
                `• Capturing requests in real-time\n` +
                `• Dashboard available at: ${api.config.gateway?.bindUrl || 'http://localhost:8080'}/plugins/contextscope\n` +
                `• Use "/analyzer stats" for detailed statistics`
        };
      }
    });

    api.logger.info('ContextScope plugin registered successfully');
  }
};

export default plugin;