import type { RequestContext } from '../web/app-router.js';
import { parseTimeFilters } from './utils.js';

export async function analysisController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const runId = ctx.url.searchParams.get('runId');
    if (!runId) { ctx.error(400, 'runId parameter is required'); return; }
    const analysis = await ctx.service.getDetailedAnalysis(runId);
    if (!analysis) { ctx.error(404, 'Analysis not found for runId'); return; }
    ctx.json(analysis);
  } catch (err) {
    ctx.logger.error(`Failed to get analysis: ${err}`);
    ctx.error(500, 'Failed to get analysis');
  }
}

export async function sessionAnalysisController(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  try {
    const sessionId = ctx.url.searchParams.get('sessionId');
    if (!sessionId) { ctx.error(400, 'sessionId parameter is required'); return; }
    const timeFilters = parseTimeFilters(ctx.url.searchParams);
    const analysis = await ctx.service.getSessionAnalysis(sessionId, timeFilters);
    if (!analysis) { ctx.error(404, 'Session analysis not found'); return; }
    ctx.json(analysis);
  } catch (err) {
    ctx.logger.error(`Failed to get session analysis: ${err}`);
    ctx.error(500, 'Failed to get session analysis');
  }
}
