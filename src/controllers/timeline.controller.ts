import type { RequestContext } from '../web/app-router.js';

export async function timelineDetailController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const runId = ctx.url.searchParams.get('runId');
    const timestamp = ctx.url.searchParams.get('timestamp');
    if (!runId || !timestamp) { ctx.error(400, 'runId and timestamp parameters are required'); return; }
    const detail = await ctx.service.getTimelineDetail(runId, parseInt(timestamp));
    if (!detail) { ctx.error(404, 'Timeline detail not found'); return; }
    ctx.json(detail);
  } catch (err) {
    ctx.logger.error(`Failed to get timeline detail: ${err}`);
    ctx.error(500, 'Failed to get timeline detail');
  }
}

export async function timelineCompareController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const runId = ctx.url.searchParams.get('runId');
    const t1 = ctx.url.searchParams.get('timestamp1');
    const t2 = ctx.url.searchParams.get('timestamp2');
    if (!runId || !t1 || !t2) { ctx.error(400, 'runId, timestamp1, and timestamp2 parameters are required'); return; }
    const comparison = await ctx.service.compareTimelinePoints(runId, parseInt(t1), parseInt(t2));
    if (!comparison) { ctx.error(404, 'Comparison data not found'); return; }
    ctx.json(comparison);
  } catch (err) {
    ctx.logger.error(`Failed to compare timeline points: ${err}`);
    ctx.error(500, 'Failed to compare timeline points');
  }
}
