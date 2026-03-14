/**
 * HTTP Handler for ContextScope Dashboard
 * 
 * Serves the web interface and API endpoints with advanced visualizations
 * 
 * Production Mode: Serves pre-built React frontend from dist/frontend
 * Development Mode: Proxies requests to Vite dev server (localhost:5173)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestAnalyzerService } from '../service.js';
import type { PluginConfig } from '../config.js';
import type { PluginLogger } from '../types.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChainHttpHandler } from './chain-handler.js';
import { createTaskHttpHandler } from './task-handler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 鐢熶骇妯″紡锛氭鏌?frontend 鏋勫缓浜х墿鏄惁瀛樺湪
const FRONTEND_DIST_PATH = join(__dirname, '..', '..', 'frontend', 'dist');
const FRONTEND_INDEX_PATH = join(FRONTEND_DIST_PATH, 'index.html');
const isProduction = existsSync(FRONTEND_INDEX_PATH);

interface HandlerParams {
  service: RequestAnalyzerService;
  config: PluginConfig;
  logger: PluginLogger;
}

export function createAnalyzerHttpHandler(params: HandlerParams) {
  const { service, config, logger } = params;

  // 璁板綍妯″紡
  logger.info(`ContextScope Dashboard: ${isProduction ? 'Production' : 'Development'} mode`);
  if (isProduction) {
    logger.info(`Serving frontend from: ${FRONTEND_DIST_PATH}`);
  } else {
    logger.info(`Frontend dev server: http://localhost:5173`);
  }

  // 提前构建 handlers，避免每次请求重复创建
  const chainHandler = createChainHttpHandler({ service, logger });
  const taskHandler = createTaskHttpHandler({ service, logger });

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      // Task API handler (新增)
      const taskHandled = await taskHandler(req, res);
      if (taskHandled) return true;

      // Chain API handler
      const chainHandled = await chainHandler(req, res);
      if (chainHandled) return true;

      // API 端点
      if (path === '/plugins/contextscope/api/stats') {
        return await handleStats(req, res, url);
      }
      
      if (path === '/plugins/contextscope/api/requests') {
        return await handleRequests(req, res, url);
      }

      if (path === '/plugins/contextscope/api/analysis') {
        return await handleAnalysis(req, res, url);
      }

      if (path === '/plugins/contextscope/api/session') {
        return await handleSessionAnalysis(req, res, url);
      }

      if (path === '/plugins/contextscope/api/export') {
        return await handleExport(req, res, url);
      }

      if (path === '/plugins/contextscope/api/links') {
        return await handleLinks(req, res, url);
      }

      if (path === '/plugins/contextscope/api/tool-calls') {
        return await handleToolCalls(req, res, url);
      }

      if (path === '/plugins/contextscope/api/timeline/detail') {
        return await handleTimelineDetail(req, res, url);
      }

      if (path === '/plugins/contextscope/api/timeline/compare') {
        return await handleTimelineCompare(req, res, url);
      }

      if (path === '/plugins/contextscope/api/context') {
        return await handleContext(req, res, url);
      }

      if (path === '/plugins/contextscope/api/cache') {
        return await handleCache(req, res, url);
      }

      if (path === '/plugins/contextscope/api/pricing') {
        return await handlePricing(req, res, url);
      }

      // Dashboard 涓婚〉闈?
      if (path === '/plugins/contextscope' || path === '/plugins/contextscope/') {
        return await handleDashboard(req, res);
      }

      // 鐢熶骇妯″紡锛氭彁渚涢潤鎬佽祫婧?
      if (isProduction && path.startsWith('/plugins/contextscope/')) {
        return await handleStaticFile(req, res, path);
      }

      res.statusCode = 404;
      res.end('Not Found');
      return true;

    } catch (error) {
      logger.error(`HTTP handler error: ${error}`);
      res.statusCode = 500;
      res.end('Internal Server Error');
      return true;
    }
  };

  /**
   * 鐢熶骇妯″紡锛氭彁渚涢潤鎬佹枃浠?
   */
  async function handleStaticFile(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    // 绉婚櫎 /plugins/contextscope 鍓嶇紑
    const relativePath = path.replace('/plugins/contextscope', '');
    const filePath = join(FRONTEND_DIST_PATH, relativePath);

    // 瀹夊叏妫€鏌ワ細闃叉鐩綍閬嶅巻鏀诲嚮
    if (!filePath.startsWith(FRONTEND_DIST_PATH)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return true;
    }

    if (!existsSync(filePath)) {
      // 濡傛灉鏄?SPA 璺敱锛岃繑鍥?index.html
      if (!filePath.includes('.')) {
        return await handleDashboard(req, res);
      }
      res.statusCode = 404;
      res.end('Not Found');
      return true;
    }

    // 璇诲彇骞惰繑鍥炴枃浠?
    try {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        'html': 'text/html',
        'js': 'text/javascript',
        'mjs': 'text/javascript',
        'css': 'text/css',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'woff': 'font/woff',
        'woff2': 'font/woff2'
      };

      const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
      const content = readFileSync(filePath);

      res.statusCode = 200;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.end(content);
      return true;
    } catch (error) {
      logger.error(`Failed to serve static file ${filePath}: ${error}`);
      res.statusCode = 500;
      res.end('Internal Server Error');
      return true;
    }
  }

  async function handleStats(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const timeFilters = parseTimeFilters(url.searchParams);
      const stats = await service.getStats(timeFilters);
      const storageStats = await service.getStorageStats();

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        stats,
        storage: storageStats,
        filters: timeFilters,
        config: {
          theme: config.visualization?.theme || 'dark',
          autoRefresh: config.visualization?.autoRefresh !== false,
          refreshInterval: config.visualization?.refreshInterval || 5000
        }
      }));
      return true;
    } catch (error) {
      logger.error(`Failed to get stats: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get statistics' }));
      return true;
    }
  }

  async function handleRequests(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const searchParams = url.searchParams;
      const timeFilters = parseTimeFilters(searchParams);
      const filters = {
        sessionId: searchParams.get('sessionId') || undefined,
        runId: searchParams.get('runId') || undefined,
        provider: searchParams.get('provider') || undefined,
        model: searchParams.get('model') || undefined,
        ...timeFilters,
        limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
        offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
      };

      const requests = await service.getRequests(filters);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ requests, total: requests.length, filters }));
      return true;
    } catch (error) {
      logger.error(`Failed to get requests: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get requests' }));
      return true;
    }
  }

  async function handleAnalysis(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const runId = url.searchParams.get('runId');
      if (!runId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'runId parameter is required' }));
        return true;
      }

      const analysis = await service.getDetailedAnalysis(runId);
      
      if (!analysis) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Analysis not found for runId' }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(analysis));
      return true;
    } catch (error) {
      logger.error(`Failed to get analysis: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get analysis' }));
      return true;
    }
  }

  async function handleSessionAnalysis(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'sessionId parameter is required' }));
        return true;
      }

      const timeFilters = parseTimeFilters(url.searchParams);
      const analysis = await service.getSessionAnalysis(sessionId, timeFilters);
      
      if (!analysis) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Session analysis not found' }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(analysis));
      return true;
    } catch (error) {
      logger.error(`Failed to get session analysis: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get session analysis' }));
      return true;
    }
  }

  async function handleLinks(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const searchParams = url.searchParams;
      const timeFilters = parseTimeFilters(searchParams);
      const filters = {
        parentRunId: searchParams.get('parentRunId') || undefined,
        childRunId: searchParams.get('childRunId') || undefined,
        parentSessionId: searchParams.get('parentSessionId') || undefined,
        ...timeFilters,
        limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
        offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
      };

      const links = await service.getSubagentLinks(filters);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ links, total: links.length, filters }));
      return true;
    } catch (error) {
      logger.error(`Failed to get links: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get links' }));
      return true;
    }
  }

  async function handleToolCalls(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const searchParams = url.searchParams;
      const timeFilters = parseTimeFilters(searchParams);
      const filters = {
        runId: searchParams.get('runId') || undefined,
        sessionId: searchParams.get('sessionId') || undefined,
        toolName: searchParams.get('toolName') || undefined,
        ...timeFilters,
        limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
        offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
      };

      const toolCalls = await service.getToolCalls(filters);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ toolCalls, total: toolCalls.length, filters }));
      return true;
    } catch (error) {
      logger.error(`Failed to get tool calls: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get tool calls' }));
      return true;
    }
  }

  async function handleExport(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const searchParams = url.searchParams;
      const format = searchParams.get('format') || 'json';
      const timeFilters = parseTimeFilters(searchParams);
      const filters = {
        ...timeFilters,
        provider: searchParams.get('provider') || undefined,
        model: searchParams.get('model') || undefined
      };

      const requests = await service.getRequests(filters);

      if (format === 'csv') {
        const csv = convertToCSV(requests);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="requests.csv"');
        res.end(csv);
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="requests.json"');
        res.end(JSON.stringify(requests, null, 2));
      }
      return true;
    } catch (error) {
      logger.error(`Failed to export requests: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to export requests' }));
      return true;
    }
  }

  async function handleCache(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'DELETE' && req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const all = url.searchParams.get('all') === 'true';
      const date = url.searchParams.get('date') || undefined;

      if (all) {
        const result = await service.clearAllCache();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ mode: 'all', ...result }));
        return true;
      }

      if (!date) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'date parameter is required when all is not true' }));
        return true;
      }

      const result = await service.clearCacheByDate(date);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ mode: 'date', ...result }));
      return true;
    } catch (error) {
      logger.error(`Failed to clear cache: ${error}`);
      const message = error instanceof Error ? error.message : 'Failed to clear cache';
      const isBadRequest = message.includes('Invalid date format');
      res.statusCode = isBadRequest ? 400 : 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: message }));
      return true;
    }
  }

  async function handleDashboard(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    // 鐢熶骇妯″紡锛氳繑鍥炴瀯寤虹殑 index.html
    if (isProduction && existsSync(FRONTEND_INDEX_PATH)) {
      try {
        const html = readFileSync(FRONTEND_INDEX_PATH, 'utf-8');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
        return true;
      } catch (error) {
        logger.error(`Failed to read index.html: ${error}`);
      }
    }

    // 寮€鍙戞ā寮忥細杩斿洖绠€鍗曟彁绀?
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end('<html><body><h1>ContextScope Dashboard</h1><p>Development mode: Please build the frontend first with <code>npm run build:frontend</code></p></body></html>');
    return true;
  }

  async function handleTimelineDetail(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const runId = url.searchParams.get('runId');
      const timestamp = url.searchParams.get('timestamp');
      
      if (!runId || !timestamp) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'runId and timestamp parameters are required' }));
        return true;
      }

      const detail = await service.getTimelineDetail(runId, parseInt(timestamp));
      
      if (!detail) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Timeline detail not found' }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(detail));
      return true;
    } catch (error) {
      logger.error(`Failed to get timeline detail: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get timeline detail' }));
      return true;
    }
  }

  async function handleTimelineCompare(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const runId = url.searchParams.get('runId');
      const timestamp1 = url.searchParams.get('timestamp1');
      const timestamp2 = url.searchParams.get('timestamp2');
      
      if (!runId || !timestamp1 || !timestamp2) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'runId, timestamp1, and timestamp2 parameters are required' }));
        return true;
      }

      const comparison = await service.compareTimelinePoints(runId, parseInt(timestamp1), parseInt(timestamp2));
      
      if (!comparison) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Comparison data not found' }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(comparison));
      return true;
    } catch (error) {
      logger.error(`Failed to compare timeline points: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to compare timeline points' }));
      return true;
    }
  }

  /**
   * Handle context distribution API request
   * GET /plugins/contextscope/api/context?runId=xxx
   */
  async function handleContext(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const runId = url.searchParams.get('runId');
      
      if (!runId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'runId parameter is required' }));
        return true;
      }

      const context = await service.getContextDistribution(runId);
      
      if (!context) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Context distribution not found' }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(context));
      return true;
    } catch (error) {
      logger.error(`Failed to get context distribution: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get context distribution' }));
      return true;
    }
  }

  /**
   * Handle OpenRouter pricing API request
   * GET /plugins/contextscope/api/pricing
   */
  async function handlePricing(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    logger.info(`[PricingAPI] Request received: ${req.method} ${url.pathname}`);
    
    if (req.method !== 'GET') {
      logger.warn(`[PricingAPI] Method not allowed: ${req.method}`);
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const refresh = url.searchParams.get('refresh') === 'true';
      logger.info(`[PricingAPI] Fetching pricing, refresh=${refresh}`);
      
      const pricing = await service.getOpenRouterPricing();
      logger.info(`[PricingAPI] Retrieved ${pricing.length} models from OpenRouter`);
      
      if (pricing.length === 0) {
        logger.warn('[PricingAPI] No pricing data returned from OpenRouter');
      } else {
        logger.info(`[PricingAPI] First model: ${pricing[0].modelId} - $${pricing[0].promptPricePer1M}/$${pricing[0].completionPricePer1M}`);
      }

      const responseData = { 
        pricing,
        total: pricing.length,
        updatedAt: new Date().toISOString()
      };
      
      logger.info(`[PricingAPI] Sending response with ${responseData.total} models`);
      
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(responseData));
      return true;
    } catch (error) {
      logger.error(`[PricingAPI] Failed to get pricing: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get pricing data', message: String(error) }));
      return true;
    }
  }

  function convertToCSV(requests: any[]): string {
    const headers = ['ID', 'Type', 'Run ID', 'Session ID', 'Provider', 'Model', 'Timestamp', 'Input Tokens', 'Output Tokens', 'Total Tokens'];
    const rows = requests.map(req => [
      req.id || '', req.type || '', req.runId || '', req.sessionId || '', req.provider || '', req.model || '',
      new Date(req.timestamp).toISOString(), req.usage?.input || '', req.usage?.output || '', req.usage?.total || ''
    ]);
    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  function parseTimeFilters(searchParams: URLSearchParams): { startTime?: number; endTime?: number } {
    const rawStartTime = searchParams.get('startTime');
    const rawEndTime = searchParams.get('endTime');
    const rawDate = searchParams.get('date');
    const rawStartDate = searchParams.get('startDate');
    const rawEndDate = searchParams.get('endDate');

    let startTime = rawStartTime ? parseInteger(rawStartTime, 'startTime') : undefined;
    let endTime = rawEndTime ? parseInteger(rawEndTime, 'endTime') : undefined;

    if (startTime === undefined && endTime === undefined && rawDate) {
      startTime = toDayStart(rawDate);
      endTime = toDayEnd(rawDate);
    }

    if (rawStartDate) {
      startTime = toDayStart(rawStartDate);
    }
    if (rawEndDate) {
      endTime = toDayEnd(rawEndDate);
    }

    if (startTime !== undefined && endTime !== undefined && startTime > endTime) {
      throw new Error('Invalid time range: startTime must be less than or equal to endTime');
    }

    return { startTime, endTime };
  }

  function parseInteger(value: string, field: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid ${field}, expected integer timestamp`);
    }
    return parsed;
  }

  function toDayStart(date: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format, expected YYYY-MM-DD');
    }
    return new Date(`${date}T00:00:00.000`).getTime();
  }

  function toDayEnd(date: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date format, expected YYYY-MM-DD');
    }
    return new Date(`${date}T23:59:59.999`).getTime();
  }
}
