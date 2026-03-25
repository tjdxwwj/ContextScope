import type { RequestContext } from '../web/app-router.js';
import { parseTimeFilters } from './utils.js';

export async function linksController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const sp = ctx.url.searchParams;
    const timeFilters = parseTimeFilters(sp);
    const filters = {
      parentRunId: sp.get('parentRunId') || undefined,
      childRunId: sp.get('childRunId') || undefined,
      parentSessionId: sp.get('parentSessionId') || undefined,
      ...timeFilters,
      limit: sp.get('limit') ? parseInt(sp.get('limit')!) : 100,
      offset: sp.get('offset') ? parseInt(sp.get('offset')!) : 0
    };
    const links = await ctx.service.getSubagentLinks(filters);
    ctx.json({ links, total: links.length, filters });
  } catch (err) {
    ctx.logger.error(`Failed to get links: ${err}`);
    ctx.error(500, 'Failed to get links');
  }
}

export async function toolCallsController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const sp = ctx.url.searchParams;
    const timeFilters = parseTimeFilters(sp);
    const filters = {
      runId: sp.get('runId') || undefined,
      sessionId: sp.get('sessionId') || undefined,
      toolName: sp.get('toolName') || undefined,
      ...timeFilters,
      limit: sp.get('limit') ? parseInt(sp.get('limit')!) : 100,
      offset: sp.get('offset') ? parseInt(sp.get('offset')!) : 0
    };
    const toolCalls = await ctx.service.getToolCalls(filters);
    ctx.json({ toolCalls, total: toolCalls.length, filters });
  } catch (err) {
    ctx.logger.error(`Failed to get tool calls: ${err}`);
    ctx.error(500, 'Failed to get tool calls');
  }
}
