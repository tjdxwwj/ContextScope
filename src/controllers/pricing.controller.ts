import type { RequestContext } from '../web/app-router.js';

export async function pricingController(ctx: RequestContext): Promise<void> {
  ctx.logger.info(`[PricingAPI] Request received: ${ctx.req.method} ${ctx.url.pathname}`);
  if (ctx.req.method !== 'GET') { ctx.logger.warn('[PricingAPI] Method not allowed'); ctx.methodNotAllowed(); return; }
  try {
    const refresh = ctx.url.searchParams.get('refresh') === 'true';
    ctx.logger.info(`[PricingAPI] Fetching pricing, refresh=${refresh}`);
    const pricing = await ctx.service.getOpenRouterPricing(refresh);
    ctx.logger.info(`[PricingAPI] Retrieved ${pricing.length} models`);
    ctx.json({ pricing, total: pricing.length, updatedAt: new Date().toISOString() });
  } catch (err) {
    ctx.logger.error(`[PricingAPI] Failed to get pricing: ${err}`);
    ctx.error(500, 'Failed to get pricing data');
  }
}
