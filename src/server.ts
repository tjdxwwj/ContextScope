/**
 * ContextScope Independent Server
 * 
 * 独立运行的 HTTP 服务，处理数据存储和 Dashboard
 * 与 OpenClaw 插件进程分离，避免 IO 阻塞主进程
 * 
 * 使用 Express 框架
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
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

// ==================== 日志适配器 ====================

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  debug: (msg: string) => console.debug(`[DEBUG] ${msg}`)
};

// ==================== 初始化 ====================

console.log('');
console.log('🔍 ContextScope Independent Server');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📂 Workspace: ${CONFIG.workspaceDir}`);
console.log(`📊 Port: ${CONFIG.port}`);
console.log(`💾 Max Requests: ${CONFIG.maxRequests}`);
console.log(`📅 Retention Days: ${CONFIG.retentionDays}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

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

// ==================== 创建 Express 应用 ====================

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 支持最大 10MB 的请求体
app.use(express.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ==================== Hook 路由 ====================

/**
 * POST /hooks/llm_input
 * 捕获 LLM 输入请求
 */
app.post('/hooks/llm_input', async (req: Request, res: Response) => {
  try {
    const { event, ctx } = req.body;
    
    logger.debug(`[Hook] llm_input: runId=${event.runId}, sessionId=${event.sessionId}`);

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
    
    // 计算 input token 数
    const inputTokens = tokenEstimator.countContext({
      systemPrompt: event.systemPrompt,
      historyMessages: event.historyMessages,
      prompt: event.prompt
    });
    
    // 捕获请求
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
    res.json({ ok: true, taskId });
  } catch (error) {
    logger.error(`[Hook] Failed to capture llm_input: ${error}`);
    res.status(500).json({ ok: false, error: String(error) });
  }
});

/**
 * POST /hooks/llm_output
 * 捕获 LLM 输出响应
 */
app.post('/hooks/llm_output', async (req: Request, res: Response) => {
  try {
    const { event, ctx } = req.body;
    
    logger.debug(`[Hook] llm_output: runId=${event.runId}, sessionId=${event.sessionId}`);

    // 确保任务存在
    const taskId = await taskTracker.startTask(event.sessionId, ctx.sessionKey || undefined);
    
    const inputRequest = await storage.getInputForRun(event.runId);
    const inputTokens = inputRequest?.usage?.input ?? 0;
    
    // 计算 output tokens
    let outputTokens = 0;
    if (event.usage) {
      outputTokens = event.usage.output ?? 0;
      if (outputTokens === 0 && event.usage.total != null) {
        outputTokens = event.usage.total - (event.usage.input ?? inputTokens);
      }
    }
    
    // 记录到任务追踪器
    const task = await taskTracker.recordLLMCall(
      event.sessionId,
      event.runId,
      inputTokens,
      outputTokens
    );
    
    logger.debug(`[Hook] llm_output captured: taskId=${task?.taskId || 'NULL'}, input=${inputTokens}, output=${outputTokens}`);
    
    // 捕获响应
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

    // 检查警报
    const alertsConfig = {}; // 可从配置文件读取
    if (alertsConfig && 'enabled' in alertsConfig && alertsConfig.enabled) {
      await service.checkAlerts({
        runId: event.runId,
        sessionId: event.sessionId,
        usage: {
          input: inputTokens,
          output: outputTokens,
          cacheRead: event.usage?.cacheRead,
          cacheWrite: event.usage?.cacheWrite,
          total: event.usage?.total,
        },
        provider: event.provider,
        model: event.model
      });
    }
    
    res.json({ ok: true, taskId: task?.taskId });
  } catch (error) {
    logger.error(`[Hook] Failed to capture llm_output: ${error}`);
    res.status(500).json({ ok: false, error: String(error) });
  }
});

/**
 * POST /hooks/after_tool_call
 * 捕获工具调用
 */
app.post('/hooks/after_tool_call', async (req: Request, res: Response) => {
  try {
    const { event, ctx } = req.body;
    const now = Date.now();
    const runId = (event.runId || ctx.runId || '').trim();
    
    logger.debug(`[Hook] after_tool_call: runId=${runId}, tool=${event.toolName}`);
    
    // 记录工具调用到任务
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

    // 处理子任务生成
    if (event.toolName === 'sessions_spawn') {
      const spawnDetails = event.result && typeof event.result === 'object' 
        ? ((event.result as any).details ?? event.result) 
        : undefined;
      const childSessionKeyForSpawn = typeof spawnDetails?.childSessionKey === 'string' 
        ? spawnDetails.childSessionKey.trim() 
        : undefined;
      
      await taskTracker.recordSubagentSpawn(ctx.sessionId || event.sessionId, childSessionKeyForSpawn);
      
      const parentRunId = runId;
      if (!parentRunId) {
        return res.json({ ok: true });
      }

      const childRunId = typeof spawnDetails?.runId === 'string' ? spawnDetails.runId.trim() : '';
      if (!childRunId) {
        return res.json({ ok: true });
      }

      const childSessionKey = typeof spawnDetails?.childSessionKey === 'string' 
        ? spawnDetails.childSessionKey.trim() 
        : undefined;
      const runtimeParam = typeof event.params?.runtime === 'string' 
        ? event.params.runtime.trim() 
        : '';
      const runtime = runtimeParam === 'acp' || runtimeParam === 'subagent' ? runtimeParam : undefined;
      const mode = spawnDetails?.mode === 'run' || spawnDetails?.mode === 'session' ? spawnDetails.mode : undefined;
      const label = typeof spawnDetails?.label === 'string' ? spawnDetails.label.trim() : undefined;

      await service.captureSubagentLink({
        kind: 'spawn',
        parentRunId,
        childRunId,
        parentSessionId: ctx.sessionId || event.sessionId,
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

    // 处理 sessions_send
    if (event.toolName === 'sessions_send') {
      const parentRunId = runId;
      if (!parentRunId) {
        return res.json({ ok: true });
      }
      
      const details = event.result && typeof event.result === 'object'
        ? ((event.result as any).details ?? event.result)
        : undefined;
      const targetSessionKey = typeof details?.sessionKey === 'string'
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
          parentSessionId: ctx.sessionId || event.sessionId,
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
    
    res.json({ ok: true });
  } catch (error) {
    logger.error(`[Hook] Failed to capture tool_call: ${error}`);
    res.status(500).json({ ok: false, error: String(error) });
  }
});

/**
 * POST /hooks/agent_end
 * 捕获 Agent 结束
 */
app.post('/hooks/agent_end', async (req: Request, res: Response) => {
  try {
    const { event, ctx } = req.body;
    
    const sessionId = event.sessionId || ctx.sessionId;
    logger.debug(`[Hook] agent_end: sessionId=${sessionId}`);

    if (!sessionId) {
      logger.warn('[Hook] agent_end: sessionId is missing');
      return res.status(400).json({ ok: false, error: 'sessionId is required' });
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
    
    res.json({ ok: true });
  } catch (error) {
    logger.error(`[Hook] Failed to capture agent_end: ${error}`);
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// ==================== Dashboard 路由 ====================

// 使用 OpenClaw 的 Dashboard 处理器
const dashboardHandler = createAnalyzerRouter({ 
  service, 
  config: {}, 
  logger 
});

// 适配 OpenClaw 处理器到 Express
// 使用正则表达式匹配所有 /plugins/contextscope 开头的路径
app.all(/^\/plugins\/contextscope(\/.*)?$/, (req: Request, res: Response, next: NextFunction) => {
  // 将 Express 请求转换为 Node.js 原生请求
  const nativeReq = req as any;
  dashboardHandler(nativeReq, res).then((handled) => {
    if (!handled) {
      next(); // 如果处理器未处理，继续下一个路由
    }
  }).catch(next);
});

// ==================== 健康检查 ====================

app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

app.get('/stats', async (req: Request, res: Response) => {
  const stats = await service.getStats();
  const storageStats = await service.getStorageStats();
  
  res.json({
    ...stats,
    ...storageStats
  });
});

// ==================== 404 处理 ====================

app.use((req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path 
  });
});

// ==================== 全局错误处理 ====================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(`[Error] ${err.message}`);
  logger.error(err.stack);
  
  res.status(500).json({ 
    ok: false, 
    error: err.message 
  });
});

// ==================== 启动服务器 ====================

const server = app.listen(CONFIG.port, () => {
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

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  server.close(async () => {
    logger.info('HTTP server closed');
    await storage.close();
    logger.info('Storage closed');
    process.exit(0);
  });
  
  // 强制退出（如果 10 秒后还未关闭）
  setTimeout(() => {
    logger.error('Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
