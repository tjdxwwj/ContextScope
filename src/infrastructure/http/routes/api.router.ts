/**
 * API 路由 - Dashboard 数据接口
 */

import { Router, Request, Response } from 'express';
import { inject, injectable } from 'inversify';
import { RequestService } from '../../../domain/request/request.service.js';
import { TaskService } from '../../../domain/task/task.service.js';
import { TYPES } from '../../../app/container.js';

/**
 * API 路由
 */
@injectable()
export class ApiRouter {
  private readonly router: Router;

  constructor(
    @inject(TYPES.RequestService) private readonly requestService: RequestService,
    @inject(TYPES.TaskService) private readonly taskService: TaskService
  ) {
    this.router = Router();
    this.routes();
  }

  private routes(): void {
    // GET /api/stats - 统计数据
    this.router.get('/stats', this.getStats.bind(this));

    // GET /api/requests - 请求列表
    this.router.get('/requests', this.getRequests.bind(this));

    // GET /api/requests/:runId - 请求详情
    this.router.get('/requests/:runId', this.getRequestDetail.bind(this));

    // GET /api/tasks - 任务列表
    this.router.get('/tasks', this.getTasks.bind(this));

    // GET /api/tasks/:taskId - 任务详情
    this.router.get('/tasks/:taskId', this.getTaskDetail.bind(this));

    // GET /api/tasks/:taskId/tree - 任务树
    this.router.get('/tasks/:taskId/tree', this.getTaskTree.bind(this));

    // DELETE /api/cache - 清除缓存
    this.router.delete('/cache', this.clearCache.bind(this));
  }

  /**
   * 获取统计数据
   */
  private async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.requestService.getStats();
      
      res.json({
        ok: true,
        data: {
          totalRequests: stats.total || 0,
          todayRequests: 0, // TODO: 实现
          weekRequests: 0,  // TODO: 实现
          averageTokens: 0, // TODO: 实现
          totalCost: 0,     // TODO: 实现
          byProvider: {},   // TODO: 实现
          byModel: {},      // TODO: 实现
        },
      });
    } catch (error) {
      console.error('[ApiRouter] getStats error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 获取请求列表
   */
  private async getRequests(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, runId, taskId, provider, model, startTime, endTime, page, limit } = req.query;
      
      const result = await this.requestService.listRequests(
        {
          sessionId: sessionId as string | undefined,
          runId: runId as string | undefined,
          taskId: taskId as string | undefined,
          provider: provider as string | undefined,
          model: model as string | undefined,
          startTime: startTime ? Number(startTime) : undefined,
          endTime: endTime ? Number(endTime) : undefined,
        },
        limit ? Number(limit) : 100,
        page ? (Number(page) - 1) * Number(limit) : 0
      );

      res.json({
        ok: true,
        data: result.data,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      console.error('[ApiRouter] getRequests error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 获取请求详情
   */
  private async getRequestDetail(req: Request, res: Response): Promise<void> {
    try {
      const { runId } = req.params;
      
      // TODO: 实现获取详情
      res.json({
        ok: true,
        data: { runId },
      });
    } catch (error) {
      console.error('[ApiRouter] getRequestDetail error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 获取任务列表
   */
  private async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, limit } = req.query;
      
      const tasks = await this.taskService.getRecentTasks(
        limit ? Number(limit) : 50,
        sessionId as string | undefined
      );

      res.json({
        ok: true,
        data: tasks,
      });
    } catch (error) {
      console.error('[ApiRouter] getTasks error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 获取任务详情
   */
  private async getTaskDetail(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      
      const task = await this.taskService.getTask(taskId as string);

      res.json({
        ok: true,
        data: task,
      });
    } catch (error) {
      console.error('[ApiRouter] getTaskDetail error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 获取任务树
   */
  private async getTaskTree(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      
      // TODO: 实现任务树
      res.json({
        ok: true,
        data: { taskId },
      });
    } catch (error) {
      console.error('[ApiRouter] getTaskTree error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 清除缓存
   */
  private async clearCache(req: Request, res: Response): Promise<void> {
    try {
      // TODO: 实现清除缓存
      res.json({
        ok: true,
        message: 'Cache cleared',
      });
    } catch (error) {
      console.error('[ApiRouter] clearCache error:', error);
      res.status(500).json({ ok: false, error: String(error) });
    }
  }

  /**
   * 获取路由器
   */
  public getRouter(): Router {
    return this.router;
  }
}
