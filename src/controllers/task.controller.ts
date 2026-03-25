import type { RequestContext } from '../web/app-router.js';
import type { TaskData } from '../models/shared-types.js';

function getTaskTokenStats(task: TaskData) {
  const tokenStats = task.tokenStats ?? task.stats;
  return {
    totalInput: tokenStats?.totalInput ?? 0,
    totalOutput: tokenStats?.totalOutput ?? 0,
    totalTokens: tokenStats?.totalTokens ?? 0,
    estimatedCost: tokenStats?.estimatedCost ?? 0,
  };
}

export async function taskListController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const sp = ctx.url.searchParams;
    const sessionId = sp.get('sessionId') || undefined;
    const status = sp.get('status') || undefined;
    const limit = parseInt(sp.get('limit') ?? '50') || 50;
    const offset = parseInt(sp.get('offset') ?? '0') || 0;
    const tasks = await ctx.service.getRecentTasks(limit, sessionId, status);
    const tasksWithStats = tasks.map((task) => {
      const tokenStats = getTaskTokenStats(task);
      return {
        ...task,
        stats: {
          llmCalls: task.llmCalls,
          toolCalls: task.toolCalls,
          subagentSpawns: task.subagentSpawns,
          ...tokenStats,
        },
      };
    });
    ctx.json({
      success: true,
      data: { tasks: tasksWithStats, pagination: { limit, offset, total: tasks.length, hasMore: tasks.length === limit } },
      timestamp: Date.now()
    });
  } catch (err) {
    ctx.logger.error(`Failed to get tasks: ${err}`);
    ctx.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get tasks' }, timestamp: Date.now() }, 500);
  }
}

export async function taskDetailController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const taskId = ctx.params.taskId;
    const task = await ctx.service.getTask(taskId);
    if (!task) {
      ctx.json({ success: false, error: { code: 'TASK_NOT_FOUND', message: 'Task not found' }, timestamp: Date.now() }, 404);
      return;
    }
    ctx.json({ success: true, data: { task }, timestamp: Date.now() });
  } catch (err) {
    ctx.logger.error(`Failed to get task: ${err}`);
    ctx.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get task' }, timestamp: Date.now() }, 500);
  }
}

export async function taskTreeController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const taskId = ctx.params.taskId;
    const tree = await ctx.service.getTaskTree(taskId);
    if (!tree) {
      ctx.json({ success: false, error: { code: 'TASK_NOT_FOUND', message: 'Task tree not found' }, timestamp: Date.now() }, 404);
      return;
    }
    ctx.json({ success: true, data: { tree }, timestamp: Date.now() });
  } catch (err) {
    ctx.logger.error(`Failed to get task tree: ${err}`);
    ctx.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get task tree' }, timestamp: Date.now() }, 500);
  }
}

export async function taskChildrenController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const taskId = ctx.params.taskId;
    const task = await ctx.service.getTask(taskId);
    if (!task) {
      ctx.json({ success: false, error: { code: 'TASK_NOT_FOUND', message: 'Task not found' }, timestamp: Date.now() }, 404);
      return;
    }
    const children: TaskData[] = [];
    if (task.childTaskIds) {
      for (const id of task.childTaskIds) {
        const child = await ctx.service.getTask(id);
        if (child) children.push(child);
      }
    }
    ctx.json({ success: true, data: { children, pagination: { total: children.length } }, timestamp: Date.now() });
  } catch (err) {
    ctx.logger.error(`Failed to get children: ${err}`);
    ctx.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get children' }, timestamp: Date.now() }, 500);
  }
}

export async function sessionStatsController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const sessionId = ctx.params.sessionId;
    const tasks = await ctx.service.getRecentTasks(100, sessionId);
    const totalTokens = tasks.reduce((sum, t) => sum + getTaskTokenStats(t).totalTokens, 0);
    const totalCost = tasks.reduce((sum, t) => sum + getTaskTokenStats(t).estimatedCost, 0);
    ctx.json({
      success: true,
      data: {
        sessionId,
        totalTasks: tasks.length,
        totalTokens,
        totalCost,
        avgTokensPerTask: tasks.length > 0 ? Math.round(totalTokens / tasks.length) : 0,
        tasks: tasks.map(t => ({ taskId: t.taskId, status: t.status, tokens: getTaskTokenStats(t).totalTokens, llmCalls: t.llmCalls }))
      },
      timestamp: Date.now()
    });
  } catch (err) {
    ctx.logger.error(`Failed to get session stats: ${err}`);
    ctx.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get session stats' }, timestamp: Date.now() }, 500);
  }
}
