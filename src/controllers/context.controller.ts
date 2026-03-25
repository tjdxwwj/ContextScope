import type { RequestContext } from '../web/app-router.js';

export async function contextController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const runId = ctx.url.searchParams.get('runId');
    if (!runId) { ctx.error(400, 'runId parameter is required'); return; }
    const context = await ctx.service.getContextDistribution(runId);
    if (!context) { ctx.error(404, 'Context distribution not found'); return; }
    ctx.json(context);
  } catch (err) {
    ctx.logger.error(`Failed to get context distribution: ${err}`);
    ctx.error(500, 'Failed to get context distribution');
  }
}
