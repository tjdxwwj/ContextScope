/**
 * HTTP Router for ContextScope Dashboard
 *
 * Thin entry point: registers all routes on AppRouter and adapts it to the
 * OpenClaw plugin handler interface (req, res) => boolean.
 *
 * Route list is the single source of truth – add new routes here only.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestAnalyzerService } from '../services/request.service.js';
import type { PluginConfig } from '../config.js';
import type { PluginLogger } from '../models/shared-types.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppRouter } from './app-router.js';

// Controllers
import { statsController } from '../controllers/stats.controller.js';
import { requestsListController, requestsDetailController, exportController } from '../controllers/requests.controller.js';
import { analysisController, sessionAnalysisController } from '../controllers/analysis.controller.js';
import { linksController, toolCallsController } from '../controllers/links.controller.js';
import { cacheController } from '../controllers/cache.controller.js';
import { pricingController } from '../controllers/pricing.controller.js';
import { timelineDetailController, timelineCompareController } from '../controllers/timeline.controller.js';
import { contextController } from '../controllers/context.controller.js';
import { chainController } from '../controllers/chain.controller.js';
import {
  taskListController,
  taskDetailController,
  taskTreeController,
  taskChildrenController,
  sessionStatsController
} from '../controllers/task.controller.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findFrontendDistPath(): string {
  const candidates = [
    join(__dirname, '..', '..', 'frontend'),
    join(__dirname, '..', '..', 'frontend', 'dist'),
    join(__dirname, '..', '..', '..', 'frontend', 'dist'),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'index.html'))) return p;
  }
  return candidates[0];
}

const FRONTEND_DIST_PATH = findFrontendDistPath();
const FRONTEND_INDEX_PATH = join(FRONTEND_DIST_PATH, 'index.html');
const isProduction = existsSync(FRONTEND_INDEX_PATH);

const BASE = '/plugins/contextscope-dev';

interface RouterParams {
  service: RequestAnalyzerService;
  config: PluginConfig;
  logger: PluginLogger;
}

export function createAnalyzerRouter(params: RouterParams) {
  const { service, config, logger } = params;

  logger.info(`ContextScope: ${isProduction ? 'Production' : 'Development'} mode`);
  if (isProduction) logger.info(`Serving frontend from: ${FRONTEND_DIST_PATH}`);

  const router = new AppRouter({ service, config, logger, basePath: BASE });

  // ── Dashboard ──────────────────────────────────────────────────────────────
  router.get('', dashboardHandler);
  router.get('/', dashboardHandler);

  // ── Stats & info ──────────────────────────────────────────────────────────
  router.get('/api/stats', statsController);
  router.get('/api/pricing', pricingController);

  // ── Requests ──────────────────────────────────────────────────────────────
  router.get('/api/requests', requestsListController);
  router.get('/api/requests/detail', requestsDetailController);
  router.get('/api/export', exportController);

  // ── Analysis ──────────────────────────────────────────────────────────────
  router.get('/api/analysis', analysisController);
  router.get('/api/session', sessionAnalysisController);
  router.get('/api/context', contextController);

  // ── Timeline ──────────────────────────────────────────────────────────────
  router.get('/api/timeline/detail', timelineDetailController);
  router.get('/api/timeline/compare', timelineCompareController);

  // ── Chain ─────────────────────────────────────────────────────────────────
  // 使用 query 参数代替路径参数，兼容 OpenClaw 的 prefix 匹配模式
  router.get('/api/chain', chainController);

  // ── Subagent links & tool calls ───────────────────────────────────────────
  router.get('/api/links', linksController);
  router.get('/api/tool-calls', toolCallsController);

  // ── Cache ─────────────────────────────────────────────────────────────────
  router.route(['DELETE', 'POST'], '/api/cache', cacheController);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  router.get('/api/tasks', taskListController);
  router.get('/api/tasks/:taskId', taskDetailController);
  router.get('/api/tasks/:taskId/tree', taskTreeController);
  router.get('/api/tasks/:taskId/children', taskChildrenController);
  router.get('/api/sessions/:sessionId/stats', sessionStatsController);

  // ── Static assets (production) ────────────────────────────────────────────
  if (isProduction) {
    router.any('/:path*', staticFileHandler);
  }

  const dispatch = router.handler();

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const handled = await dispatch(req, res);
    if (!handled) {
      res.statusCode = 404;
      res.end('Not Found');
      return true;
    }
    return true;
  };
}

// ── Static / dashboard handlers ───────────────────────────────────────────────

import type { RequestContext } from './app-router.js';

async function dashboardHandler(ctx: RequestContext): Promise<void> {
  if (ctx.req.method !== 'GET') { ctx.methodNotAllowed(); return; }
  if (isProduction && existsSync(FRONTEND_INDEX_PATH)) {
    try {
      const html = readFileSync(FRONTEND_INDEX_PATH, 'utf-8');
      ctx.res.statusCode = 200;
      ctx.res.setHeader('Content-Type', 'text/html');
      ctx.res.end(html);
      return;
    } catch { /* fall through */ }
  }
  ctx.res.statusCode = 200;
  ctx.res.setHeader('Content-Type', 'text/html');
  ctx.res.end('<html><body><h1>ContextScope Dashboard</h1><p>Build the frontend first: <code>npm run build:frontend</code></p></body></html>');
}

async function staticFileHandler(ctx: RequestContext): Promise<void> {
  const relativePath = ctx.url.pathname.replace(BASE, '');
  const filePath = join(FRONTEND_DIST_PATH, relativePath);

  // Guard against directory traversal
  if (!filePath.startsWith(FRONTEND_DIST_PATH)) {
    ctx.error(403, 'Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    // SPA fallback
    if (!relativePath.includes('.')) {
      await dashboardHandler(ctx);
    } else {
      ctx.error(404, 'Not Found');
    }
    return;
  }

  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const mimeTypes: Record<string, string> = {
    html: 'text/html', js: 'text/javascript', mjs: 'text/javascript',
    css: 'text/css', json: 'application/json',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2'
  };

  const content = readFileSync(filePath);
  ctx.res.statusCode = 200;
  ctx.res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
  ctx.res.setHeader('Cache-Control', 'public, max-age=31536000');
  ctx.res.end(content);
}
