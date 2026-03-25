import type { RequestContext } from '../web/app-router.js';
import { parseTimeFilters, convertToCSV } from './utils.js';

export async function requestsListController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const sp = ctx.url.searchParams;
    const timeFilters = parseTimeFilters(sp);
    const filters = {
      sessionId: sp.get('sessionId') || undefined,
      runId: sp.get('runId') || undefined,
      taskId: sp.get('taskId') || undefined,
      provider: sp.get('provider') || undefined,
      model: sp.get('model') || undefined,
      ...timeFilters,
      limit: sp.get('limit') ? parseInt(sp.get('limit')!) : 100,
      offset: sp.get('offset') ? parseInt(sp.get('offset')!) : 0
    };
    const full = sp.get('full') === 'true';
    const requests = full
      ? await ctx.service.getRequests(filters)
      : await ctx.service.getRequestSummaries(filters);
    ctx.json({ requests, total: requests.length, filters, full });
  } catch (err) {
    ctx.logger.error(`Failed to get requests: ${err}`);
    ctx.error(500, 'Failed to get requests');
  }
}

export async function requestsDetailController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const runId = ctx.url.searchParams.get('runId');
    if (!runId) { ctx.error(400, 'runId parameter is required'); return; }
    const limitParam = ctx.url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : 200;
    const requests = await ctx.service.getRequests({ runId, limit: Number.isFinite(limit) ? limit : 200 });
    const toolCalls = await ctx.service.getToolCalls({ runId, limit: 200 });
    const subagentLinks = await ctx.service.getSubagentLinks({ parentRunId: runId, limit: 200 });
    ctx.json({ runId, requests, toolCalls, subagentLinks });
  } catch (err) {
    ctx.logger.error(`Failed to get request details: ${err}`);
    ctx.error(500, 'Failed to get request details');
  }
}

export async function exportController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const sp = ctx.url.searchParams;
    const format = sp.get('format') || 'json';
    const timeFilters = parseTimeFilters(sp);
    const filters = {
      ...timeFilters,
      provider: sp.get('provider') || undefined,
      model: sp.get('model') || undefined
    };
    const requests = await ctx.service.getRequests(filters);
    if (format === 'csv') {
      const csv = convertToCSV(requests);
      ctx.res.statusCode = 200;
      ctx.res.setHeader('Content-Type', 'text/csv');
      ctx.res.setHeader('Content-Disposition', 'attachment; filename="requests.csv"');
      ctx.res.end(csv);
    } else {
      ctx.res.statusCode = 200;
      ctx.res.setHeader('Content-Type', 'application/json');
      ctx.res.setHeader('Content-Disposition', 'attachment; filename="requests.json"');
      ctx.res.end(JSON.stringify(requests, null, 2));
    }
  } catch (err) {
    ctx.logger.error(`Failed to export requests: ${err}`);
    ctx.error(500, 'Failed to export requests');
  }
}
