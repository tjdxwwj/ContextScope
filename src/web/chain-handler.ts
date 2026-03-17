import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestAnalyzerService } from '../service.js';
import type { PluginLogger } from '../types.js';

export function createChainHttpHandler(params: { service: RequestAnalyzerService; logger: PluginLogger }) {
  const { service, logger } = params;
  const sendJson = (res: ServerResponse, statusCode: number, payload: unknown): boolean => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
    return true;
  };
  const toInt = (value: string | null, fallback: number): number => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    if (!path.startsWith('/plugins/contextscope/api/chain/')) {
      return false;
    }

    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const pathParts = path.split('/');
      const runId = pathParts[pathParts.length - 1];
      
      if (!runId || runId === 'chain') {
        return sendJson(res, 400, { error: 'runId is required' });
      }

      const limit = toInt(url.searchParams.get('limit'), 100);
      const offset = toInt(url.searchParams.get('offset'), 0);

      const chain = await service.getChain(runId, limit, offset);
      
      if (!chain) {
        return sendJson(res, 404, { error: 'Chain not found' });
      }

      return sendJson(res, 200, chain);
    } catch (error) {
      logger.error(`Failed to get chain: ${error}`);
      return sendJson(res, 500, { error: 'Failed to get chain' });
    }
  };
}
