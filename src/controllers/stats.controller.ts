import type { RequestContext } from '../web/app-router.js';
import { parseTimeFilters } from './utils.js';

export async function statsController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const timeFilters = parseTimeFilters(ctx.url.searchParams);
    const stats = await ctx.service.getStats(timeFilters);
    const storageStats = await ctx.service.getStorageStats();
    ctx.json({
      stats,
      storage: storageStats,
      filters: timeFilters,
      config: {
        theme: ctx.config.visualization?.theme || 'dark',
        autoRefresh: ctx.config.visualization?.autoRefresh !== false,
        refreshInterval: ctx.config.visualization?.refreshInterval || 5000
      }
    });
  } catch (err) {
    ctx.logger.error(`Failed to get stats: ${err}`);
    ctx.error(500, 'Failed to get statistics');
  }
}
