/**
 * Task HTTP Handler for ContextScope
 * 
 * Provides RESTful API endpoints for task queries and task tree visualization.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestAnalyzerService } from '../service.js';
import type { PluginLogger, TaskData } from '../types.js';

type ApiErrorCode = 'INTERNAL_ERROR' | 'TASK_NOT_FOUND';

function parseQueryInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): boolean {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
  return true;
}

function sendSuccess(res: ServerResponse, data: unknown, statusCode = 200): boolean {
  return sendJson(res, statusCode, {
    success: true,
    data,
    timestamp: Date.now()
  });
}

function sendError(res: ServerResponse, statusCode: number, code: ApiErrorCode, message: string): boolean {
  return sendJson(res, statusCode, {
    success: false,
    error: { code, message },
    timestamp: Date.now()
  });
}

function ensureGetMethod(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'GET') return true;
  res.statusCode = 405;
  res.end('Method Not Allowed');
  return false;
}

function getTaskTokenStats(task: TaskData) {
  const tokenStats = task.tokenStats ?? task.stats;
  return {
    totalInput: tokenStats?.totalInput ?? 0,
    totalOutput: tokenStats?.totalOutput ?? 0,
    totalTokens: tokenStats?.totalTokens ?? 0,
    estimatedCost: tokenStats?.estimatedCost ?? 0,
  };
}

export function createTaskHttpHandler(params: { service: RequestAnalyzerService; logger: PluginLogger }) {
  const { service, logger } = params;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // GET /api/tasks - 获取任务列表
    if (path === '/plugins/contextscope/api/tasks') {
      if (!ensureGetMethod(req, res)) return true;

      try {
        const sessionId = url.searchParams.get('sessionId') || undefined;
        const status = url.searchParams.get('status') || undefined;
        const limit = parseQueryInt(url.searchParams.get('limit'), 50);
        const offset = parseQueryInt(url.searchParams.get('offset'), 0);

        const tasks = await service.getRecentTasks(limit, sessionId, status);
        const tasksWithStats = tasks.map((task) => {
          const tokenStats = getTaskTokenStats(task);
          return {
            ...task,
            stats: {
              llmCalls: task.llmCalls,
              toolCalls: task.toolCalls,
              subagentSpawns: task.subagentSpawns,
              totalInput: tokenStats.totalInput,
              totalOutput: tokenStats.totalOutput,
              totalTokens: tokenStats.totalTokens,
              estimatedCost: tokenStats.estimatedCost,
            },
          };
        });

        return sendSuccess(res, {
          tasks: tasksWithStats,
          pagination: {
            limit,
            offset,
            total: tasks.length,
            hasMore: tasks.length === limit
          }
        });
      } catch (error) {
        logger.error(`Failed to get tasks: ${error}`);
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get tasks');
      }
    }

    // GET /api/tasks/:taskId - 获取任务详情
    const taskMatch = path.match(/^\/plugins\/contextscope\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      if (!ensureGetMethod(req, res)) return true;

      try {
        const taskId = taskMatch[1];
        const task = await service.getTask(taskId);

        if (!task) {
          return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found');
        }

        return sendSuccess(res, { task });
      } catch (error) {
        logger.error(`Failed to get task: ${error}`);
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get task');
      }
    }

    // GET /api/tasks/:taskId/tree - 获取任务树
    const treeMatch = path.match(/^\/plugins\/contextscope\/api\/tasks\/([^/]+)\/tree$/);
    if (treeMatch) {
      if (!ensureGetMethod(req, res)) return true;

      try {
        const taskId = treeMatch[1];
        const tree = await service.getTaskTree(taskId);

        if (!tree) {
          return sendError(res, 404, 'TASK_NOT_FOUND', 'Task tree not found');
        }

        return sendSuccess(res, { tree });
      } catch (error) {
        logger.error(`Failed to get task tree: ${error}`);
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get task tree');
      }
    }

    // GET /api/tasks/:taskId/children - 获取子任务列表
    const childrenMatch = path.match(/^\/plugins\/contextscope\/api\/tasks\/([^/]+)\/children$/);
    if (childrenMatch) {
      if (!ensureGetMethod(req, res)) return true;

      try {
        const taskId = childrenMatch[1];
        const task = await service.getTask(taskId);

        if (!task) {
          return sendError(res, 404, 'TASK_NOT_FOUND', 'Task not found');
        }

        const children: TaskData[] = [];
        if (task.childTaskIds) {
          for (const childTaskId of task.childTaskIds) {
            const childTask = await service.getTask(childTaskId);
            if (childTask) {
              children.push(childTask);
            }
          }
        }

        return sendSuccess(res, {
          children,
          pagination: {
            total: children.length
          }
        });
      } catch (error) {
        logger.error(`Failed to get children: ${error}`);
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get children');
      }
    }

    // GET /api/sessions/:sessionId/stats - 获取会话统计
    const sessionStatsMatch = path.match(/^\/plugins\/contextscope\/api\/sessions\/([^/]+)\/stats$/);
    if (sessionStatsMatch) {
      if (!ensureGetMethod(req, res)) return true;

      try {
        const sessionId = sessionStatsMatch[1];
        const tasks = await service.getRecentTasks(100, sessionId);

        const totalTokens = tasks.reduce((sum, t) => sum + getTaskTokenStats(t).totalTokens, 0);
        const totalCost = tasks.reduce((sum, t) => sum + getTaskTokenStats(t).estimatedCost, 0);

        return sendSuccess(res, {
          sessionId,
          totalTasks: tasks.length,
          totalTokens,
          totalCost,
          avgTokensPerTask: tasks.length > 0 ? Math.round(totalTokens / tasks.length) : 0,
          tasks: tasks.map(t => ({
            taskId: t.taskId,
            status: t.status,
            tokens: getTaskTokenStats(t).totalTokens,
            llmCalls: t.llmCalls
          }))
        });
      } catch (error) {
        logger.error(`Failed to get session stats: ${error}`);
        return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to get session stats');
      }
    }

    return false;
  };
}
