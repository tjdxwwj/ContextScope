/**
 * ContextScope Independent Server
 * 
 * 独立运行的 HTTP 服务，处理数据存储和 Dashboard
 * 与 OpenClaw 插件进程分离，避免 IO 阻塞主进程
 * 
 * 使用 Node.js 原生 HTTP 服务器 + OpenClaw 的 AppRouter
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { RequestAnalyzerStorage } from './storage.js';
import { RequestAnalyzerService } from './services/request.service.js';
import { createAnalyzerRouter } from './web/router.js';
import { TokenEstimationService } from './services/token-estimator.service.js';
import { TaskTracker } from './services/task-tracker.service.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ==================== 配置 ====================

const CONFIG = {
  port: parseInt(process.env.PORT || '18790'),
  workspaceDir: process.env.CONTEXTSCOPE_WORKSPACE || path.join(process.env.APPDATA || process.env.HOME || '~', '.openclaw/contextscope'),
  maxRequests: parseInt(process.env.MAX_REQUESTS || '10000'),
  retentionDays: parseInt(process.env.RETENTION_DAYS || '7'),
};

console.log('');
console.log('🔍 ContextScope Independent Server');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📂 Workspace: ${CONFIG.workspaceDir}`);
console.log(`📊 Port: ${CONFIG.port}`);
console.log(`💾 Max Requests: ${CONFIG.maxRequests}`);
console.log(`📅 Retention Days: ${CONFIG.retentionDays}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

// ==================== 简单的日志适配器 ====================

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`)
};

// ==================== 初始化 ====================

const storage = new RequestAnalyzerStorage({
  workspaceDir: CONFIG.workspaceDir,
  maxRequests: CONFIG.maxRequests,
  retentionDays: CONFIG.retentionDays,
  compression: true,
  logger
});

await storage.initialize();
logger.info('Storage initialized');

const service = new RequestAnalyzerService({
  storage,
  config: {
    capture: {
      includeSystemPrompts: true,
      includeMessageHistory: true,
      anonymizeContent: false,
      maxPromptLength: 10000
    },
    storage: {},
    visualization: {},
    alerts: {}
  },
  logger
});
logger.info('Service initialized');

const tokenEstimator = new TokenEstimationService({ model: 'gpt-3.5-turbo' });

const taskTracker = new TaskTracker(storage, logger, {
  taskTimeoutMs: 600000,
  maxActiveTasks: 100,
  enableLogging: true
});
logger.info('TaskTracker initialized');

// ==================== 创建 HTTP 服务器 ====================

// 获取 Dashboard 路由处理器
const dashboardHandler = createAnalyzerRouter({ 
  service, 
  config: {}, 
  logger 
});

// 简单的路由处理
const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://localhost:${CONFIG.port}`);
  const pathname = url.pathname;

  // 添加 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // ==================== Hook 接收接口 ====================

    if (pathname === '/hooks/llm_input' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { event, ctx } = JSON.parse(body);
      
      logger.debug(`[Hook] llm_input: runId=${event.runId}, sessionId=${event.sessionId}`);

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
      
      const inputTokens = tokenEstimator.countContext({
        systemPrompt: event.systemPrompt,
        historyMessages: event.historyMessages,
        prompt: event.prompt
      });
      
      await service.captureRequest({
        type: 'input',
        runId: event.runId,
        taskId,
        sessionId: event.sessionId,
        sessionKey: ctx.sessionKey,
        provider: event.provider,
        model: event.model,
        timestamp: Date.now(),
        prompt: event.prompt,
        systemPrompt: event.systemPrompt,
        historyMessages: event.historyMessages,
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
      
      logger.debug(`[Hook] llm_input captured: taskId=${taskId}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, taskId }));
      return;
    }

    if (pathname === '/hooks/llm_output' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { event, ctx } = JSON.parse(body);
      
      logger.debug(`[Hook] llm_output: runId=${event.runId}, sessionId=${event.sessionId}`);

      const taskId = await taskTracker.startTask(event.sessionId, ctx.sessionKey || undefined);
      
      const inputRequest = await storage.getInputForRun(event.runId);
      const inputTokens = inputRequest?.usage?.input ?? 0;
      
      let outputTokens = 0;
      if (event.usage) {
        outputTokens = event.usage.output ?? 0;
        if (outputTokens === 0 && event.usage.total != null) {
          outputTokens = event.usage.total - (event.usage.input ?? inputTokens);
        }
      }
      
      const task = await taskTracker.recordLLMCall(
        event.sessionId,
        event.runId,
        inputTokens,
        outputTokens
      );
      
      logger.debug(`[Hook] llm_output captured: taskId=${task?.taskId || 'NULL'}, input=${inputTokens}, output=${outputTokens}`);
      
      await service.captureResponse({
        type: 'output',
        runId: event.runId,
        taskId: task?.taskId,
        sessionId: event.sessionId,
        sessionKey: ctx.sessionKey,
        provider: event.provider,
        model: event.model,
        timestamp: Date.now(),
        assistantTexts: event.assistantTexts,
        usage: {
          input: inputTokens,
          output: outputTokens,
          cacheRead: event.usage?.cacheRead,
          cacheWrite: event.usage?.cacheWrite,
          total: event.usage?.total,
        },
        metadata: {
          agentId: ctx.agentId,
          channelId: ctx.channelId
        }
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, taskId: task?.taskId }));
      return;
    }

    if (pathname === '/hooks/after_tool_call' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { event, ctx } = JSON.parse(body);
      const now = Date.now();
      const runId = (event.runId || ctx.runId || '').trim();
      
      logger.debug(`[Hook] after_tool_call: runId=${runId}, tool=${event.toolName}`);
      
      const sessionId = ctx.sessionId || event.sessionId;
      if (sessionId) {
        await taskTracker.recordToolCall(sessionId);
      }
      
      if (runId) {
        const durationMs = typeof event.durationMs === 'number' ? Math.max(0, event.durationMs) : undefined;
        await service.captureToolCall({
          runId,
          sessionId: sessionId,
          sessionKey: ctx.sessionKey || undefined,
          toolName: event.toolName,
          toolCallId: event.toolCallId || ctx.toolCallId,
          timestamp: now,
          startedAt: durationMs !== undefined ? now - durationMs : undefined,
          durationMs,
          params: event.params || {},
          result: event.result,
          error: event.error,
          metadata: {
            agentId: ctx.agentId || undefined
          }
        });
      }

      // 处理子任务生成（简化版）
      if (event.toolName === 'sessions_spawn') {
        const spawnDetails = event.result && typeof event.result === 'object' 
          ? ((event.result as any).details ?? event.result) 
          : undefined;
        const childSessionKeyForSpawn = typeof spawnDetails?.childSessionKey === 'string' 
          ? spawnDetails.childSessionKey.trim() 
          : undefined;
        
        await taskTracker.recordSubagentSpawn(ctx.sessionId, childSessionKeyForSpawn);
        
        // 更多子任务逻辑...
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === '/hooks/agent_end' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { event, ctx } = JSON.parse(body);
      
      const sessionId = event.sessionId || ctx.sessionId;
      logger.debug(`[Hook] agent_end: sessionId=${sessionId}`);

      if (!sessionId) {
        logger.warn('[Hook] agent_end: sessionId is missing');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'sessionId is required' }));
        return;
      }

      let reason: 'completed' | 'error' | 'timeout' | 'aborted' = 'completed';
      if (event.error) reason = 'error';
      
      const taskData = await taskTracker.endTask(sessionId, reason, event.error);
      
      if (taskData) {
        const childCount = taskData.childTaskIds?.length || 0;
        const childNote = childCount > 0 ? ` (with ${childCount} subagents)` : '';
        
        logger.info(
          `✅ Task ${taskData.taskId}${childNote} completed: ` +
          `${taskData.llmCalls} LLM calls, ` +
          `${taskData.toolCalls} tools, ` +
          `${taskData.subagentSpawns} subagents`
        );
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // ==================== Dashboard 路由 ====================

    if (pathname.startsWith('/plugins/contextscope')) {
      // 调用 OpenClaw 的 Dashboard 处理器
      const result = await dashboardHandler(req, res);
      if (!result) {
        // 处理器未处理，返回 404
        res.writeHead(404);
        res.end('Not Found');
      }
      return;
    }

    // ==================== 健康检查 ====================

    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        timestamp: Date.now(),
        uptime: process.uptime()
      }));
      return;
    }

    if (pathname === '/stats') {
      const stats = await service.getStats();
      const storageStats = await service.getStorageStats();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ...stats,
        ...storageStats
      }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');

  } catch (error) {
    logger.error(`[HTTP] Error: ${error}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: String(error) }));
  }
});

// ==================== 启动服务器 ====================

server.listen(CONFIG.port, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  🔍 ContextScope Independent Server is ready!             ║');
  console.log('║                                                            ║');
  console.log(`║  📊 Dashboard: http://localhost:${CONFIG.port}/plugins/contextscope   ║`);
  console.log(`║  🩺 Health:    http://localhost:${CONFIG.port}/health                 ║`);
  console.log(`║  📈 Stats:     http://localhost:${CONFIG.port}/stats                  ║`);
  console.log('║                                                            ║');
  console.log('║  Press Ctrl+C to stop                                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  logger.info(`Server started on http://localhost:${CONFIG.port}`);
});

// ==================== 优雅关闭 ====================

process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  server.close(() => {
    logger.info('HTTP server closed');
  });
  await storage.close();
  logger.info('Storage closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  server.close(() => {
    logger.info('HTTP server closed');
  });
  await storage.close();
  logger.info('Storage closed');
  process.exit(0);
});
