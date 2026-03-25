import type { RequestContext } from '../web/app-router.js';

export async function chainController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    // 支持路径参数和查询参数两种方式
    const runId = ctx.params.runId || ctx.url.searchParams.get('runId');
    if (!runId) { ctx.error(400, 'runId is required'); return; }
    const limit = parseInt(ctx.url.searchParams.get('limit') ?? '100') || 100;
    const offset = parseInt(ctx.url.searchParams.get('offset') ?? '0') || 0;
    const chain = await ctx.service.getChain(runId, limit, offset);
    if (!chain) { ctx.error(404, 'Chain not found'); return; }
    ctx.json(chain);
  } catch (err) {
    ctx.logger.error(`Failed to get chain: ${err}`);
    ctx.error(500, 'Failed to get chain');
  }
}
