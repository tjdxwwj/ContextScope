import type { RequestContext } from '../web/app-router.js';

export async function cacheController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'DELETE' && ctx.req.method !== 'POST') { ctx.methodNotAllowed(); return; }
  try {
    const all = ctx.url.searchParams.get('all') === 'true';
    const date = ctx.url.searchParams.get('date') || undefined;
    if (all) {
      const result = await ctx.service.clearAllCache();
      ctx.json({ mode: 'all', ...result });
      return;
    }
    if (!date) { ctx.error(400, 'date parameter is required when all is not true'); return; }
    const result = await ctx.service.clearCacheByDate(date);
    ctx.json({ mode: 'date', ...result });
  } catch (err) {
    ctx.logger.error(`Failed to clear cache: ${err}`);
    const message = err instanceof Error ? err.message : 'Failed to clear cache';
    ctx.error(message.includes('Invalid date format') ? 400 : 500, message);
  }
}
