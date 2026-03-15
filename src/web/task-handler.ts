/**
 * Task HTTP Handler for ContextScope
 * 
 * Provides RESTful API endpoints for task queries and task tree visualization.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestAnalyzerService } from '../service.js';
import type { PluginLogger } from '../types.js';

export function createTaskHttpHandler(params: { service: RequestAnalyzerService; logger: PluginLogger }) {
  const { service, logger } = params;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    // GET /api/tasks - 获取任务列表
    if (path === '/plugins/contextscope/api/tasks') {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return true;
      }

      try {
        const sessionId = url.searchParams.get('sessionId') || undefined;
        const status = url.searchParams.get('status') || undefined;
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const offset = parseInt(url.searchParams.get('offset') || '0');

        const tasks = await service.getRecentTasks(limit, sessionId, status);

        // 为每个 task 计算真实的 token 统计（直接从数据库查询）
        const tasksWithRealTokens = [];
        for (const task of tasks) {
          // 使用 service 的内部 storage 直接查询
          const storage = (service as any).storage;
          if (storage && storage.getRequests) {
            const allRequests = await storage.getRequests({ limit: 100000 });
            const taskRequests = allRequests.filter((r: any) => r.taskId === task.taskId);
            const inputReqs = taskRequests.filter((r: any) => r.type === 'input');
            const outputReqs = taskRequests.filter((r: any) => r.type === 'output');
            
            const realInput = inputReqs.reduce((sum: number, r: any) => sum + (r.usage?.input || 0), 0);
            const realOutput = outputReqs.reduce((sum: number, r: any) => sum + (r.usage?.output || 0), 0);
            
            tasksWithRealTokens.push({
              ...task,
              stats: {
                ...task.stats,
                totalInput: realInput,
                totalOutput: realOutput,
                totalTokens: realInput + realOutput
              }
            });
          } else {
            tasksWithRealTokens.push(task);
          }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          data: {
            tasks: tasksWithRealTokens,
            pagination: {
              limit,
              offset,
              total: tasks.length,
              hasMore: tasks.length === limit
            }
          },
          timestamp: Date.now()
        }));
        return true;
      } catch (error) {
        logger.error(`Failed to get tasks: ${error}`);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get tasks'
          },
          timestamp: Date.now()
        }));
        return true;
      }
    }

    // GET /api/tasks/:taskId - 获取任务详情
    const taskMatch = path.match(/^\/plugins\/contextscope\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return true;
      }

      try {
        const taskId = taskMatch[1];
        const task = await service.getTask(taskId);

        if (!task) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: false,
            error: {
              code: 'TASK_NOT_FOUND',
              message: 'Task not found'
            },
            timestamp: Date.now()
          }));
          return true;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          data: { task },
          timestamp: Date.now()
        }));
        return true;
      } catch (error) {
        logger.error(`Failed to get task: ${error}`);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get task'
          },
          timestamp: Date.now()
        }));
        return true;
      }
    }

    // GET /api/tasks/:taskId/tree - 获取任务树
    const treeMatch = path.match(/^\/plugins\/contextscope\/api\/tasks\/([^/]+)\/tree$/);
    if (treeMatch) {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return true;
      }

      try {
        const taskId = treeMatch[1];
        const tree = await service.getTaskTree(taskId);

        if (!tree) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: false,
            error: {
              code: 'TASK_NOT_FOUND',
              message: 'Task tree not found'
            },
            timestamp: Date.now()
          }));
          return true;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          data: { tree },
          timestamp: Date.now()
        }));
        return true;
      } catch (error) {
        logger.error(`Failed to get task tree: ${error}`);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get task tree'
          },
          timestamp: Date.now()
        }));
        return true;
      }
    }

    // GET /api/tasks/:taskId/children - 获取子任务列表
    const childrenMatch = path.match(/^\/plugins\/contextscope\/api\/tasks\/([^/]+)\/children$/);
    if (childrenMatch) {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return true;
      }

      try {
        const taskId = childrenMatch[1];
        const task = await service.getTask(taskId);

        if (!task) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            success: false,
            error: {
              code: 'TASK_NOT_FOUND',
              message: 'Task not found'
            },
            timestamp: Date.now()
          }));
          return true;
        }

        const children = [];
        if (task.childTaskIds) {
          for (const childTaskId of task.childTaskIds) {
            const childTask = await service.getTask(childTaskId);
            if (childTask) {
              children.push(childTask);
            }
          }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          data: {
            children,
            pagination: {
              total: children.length
            }
          },
          timestamp: Date.now()
        }));
        return true;
      } catch (error) {
        logger.error(`Failed to get children: ${error}`);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get children'
          },
          timestamp: Date.now()
        }));
        return true;
      }
    }

    // GET /api/sessions/:sessionId/stats - 获取会话统计
    const sessionStatsMatch = path.match(/^\/plugins\/contextscope\/api\/sessions\/([^/]+)\/stats$/);
    if (sessionStatsMatch) {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return true;
      }

      try {
        const sessionId = sessionStatsMatch[1];
        const tasks = await service.getRecentTasks(100, sessionId);

        const totalTokens = tasks.reduce((sum, t) => sum + t.stats.totalTokens, 0);
        const totalCost = tasks.reduce((sum, t) => sum + t.stats.estimatedCost, 0);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          data: {
            sessionId,
            totalTasks: tasks.length,
            totalTokens,
            totalCost,
            avgTokensPerTask: tasks.length > 0 ? Math.round(totalTokens / tasks.length) : 0,
            tasks: tasks.map(t => ({
              taskId: t.taskId,
              status: t.status,
              tokens: t.stats.totalTokens,
              llmCalls: t.stats.llmCalls
            }))
          },
          timestamp: Date.now()
        }));
        return true;
      } catch (error) {
        logger.error(`Failed to get session stats: ${error}`);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to get session stats'
          },
          timestamp: Date.now()
        }));
        return true;
      }
    }

    return false;
  };
}
