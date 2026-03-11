import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestAnalyzerService } from '../service.js';
import type { PluginConfig } from '../config.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST_PATH = join(__dirname, '..', '..', 'frontend', 'dist');
const FRONTEND_INDEX_PATH = join(FRONTEND_DIST_PATH, 'index.html');
const isProduction = existsSync(FRONTEND_INDEX_PATH);

interface PluginLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export function createChainHttpHandler(params: { service: RequestAnalyzerService; logger: PluginLogger }) {
  const { service, logger } = params;

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
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'runId is required' }));
        return true;
      }

      const limit = parseInt(url.searchParams.get('limit') || '100');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const chain = await service.getChain(runId, limit, offset);
      
      if (!chain) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Chain not found' }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(chain));
      return true;
    } catch (error) {
      logger.error(`Failed to get chain: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get chain' }));
      return true;
    }
  };
}
