/**
 * Express-style Application Router for ContextScope
 *
 * Provides a declarative route registration API with a shared RequestContext (ctx)
 * that is compatible with the OpenClaw plugin handler interface.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestAnalyzerService } from '../services/request.service.js';
import type { PluginConfig } from '../config.js';
import type { PluginLogger } from '../models/shared-types.js';

// ─── Context ──────────────────────────────────────────────────────────────────

/**
 * Shared request context passed to every route handler.
 * Mirrors the Express pattern where every handler gets (req, res, next) but
 * here we bundle everything – including services – into a single ctx object.
 */
export interface RequestContext {
  /** Underlying Node.js request */
  req: IncomingMessage;
  /** Underlying Node.js response */
  res: ServerResponse;
  /** Parsed URL for easy searchParams access */
  url: URL;
  /** Named route params, e.g. /tasks/:taskId → ctx.params.taskId */
  params: Record<string, string>;
  /** Core service (business logic layer) */
  service: RequestAnalyzerService;
  /** Logger */
  logger: PluginLogger;
  /** Plugin configuration */
  config: PluginConfig;

  // ── Convenience response helpers ──────────────────────────────────────────
  /** Send a JSON response */
  json(data: unknown, status?: number): void;
  /** Send a plain-text response */
  text(body: string, status?: number): void;
  /** Send an error JSON response */
  error(status: number, message: string): void;
  /** Send a 405 Method Not Allowed */
  methodNotAllowed(): void;
}

// ─── Route handler type ───────────────────────────────────────────────────────

export type RouteHandler = (ctx: RequestContext) => Promise<void> | void;

// ─── Path matching utilities ──────────────────────────────────────────────────

interface MatchResult {
  params: Record<string, string>;
}

/**
 * Convert an Express-style path pattern (e.g. /api/tasks/:taskId/tree)
 * into a RegExp and a list of param names.
 */
function compilePath(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  // Replace :param segments with a capture group
  const regexSource = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')   // escape special regex chars
    .replace(/\\:([A-Za-z_][A-Za-z0-9_]*)/g, (_: string, name: string) => {
      paramNames.push(name);
      return '([^/]+)';
    })
    // support :path* wildcard (greedy)
    .replace(/\\\*$/g, '(.*)');

  return { regex: new RegExp(`^${regexSource}$`), paramNames };
}

function matchPath(pattern: { regex: RegExp; paramNames: string[] }, pathname: string): MatchResult | null {
  const m = pattern.regex.exec(pathname);
  if (!m) return null;
  const params: Record<string, string> = {};
  pattern.paramNames.forEach((name, i) => {
    params[name] = m[i + 1] ?? '';
  });
  return { params };
}

// ─── Router ───────────────────────────────────────────────────────────────────

interface Route {
  method: string | null; // null = any method
  compiledPath: ReturnType<typeof compilePath>;
  handler: RouteHandler;
}

interface RouterOptions {
  service: RequestAnalyzerService;
  logger: PluginLogger;
  config: PluginConfig;
  /** Base path prefix for all routes, e.g. '/plugins/contextscope' */
  basePath?: string;
}

export class AppRouter {
  private routes: Route[] = [];
  private options: RouterOptions;
  private basePath: string;

  constructor(options: RouterOptions) {
    this.options = options;
    this.basePath = options.basePath ?? '';
  }

  // ── Registration helpers ────────────────────────────────────────────────────

  get(path: string, handler: RouteHandler): this {
    return this.on('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): this {
    return this.on('POST', path, handler);
  }

  put(path: string, handler: RouteHandler): this {
    return this.on('PUT', path, handler);
  }

  delete(path: string, handler: RouteHandler): this {
    return this.on('DELETE', path, handler);
  }

  /** Register for multiple methods at once */
  route(methods: string[], path: string, handler: RouteHandler): this {
    for (const m of methods) this.on(m.toUpperCase(), path, handler);
    return this;
  }

  /** Register for any HTTP method */
  any(path: string, handler: RouteHandler): this {
    return this.on(null, path, handler);
  }

  private on(method: string | null, path: string, handler: RouteHandler): this {
    const fullPath = this.basePath + path;
    this.routes.push({ method, compiledPath: compilePath(fullPath), handler });
    return this;
  }

  // ── OpenClaw-compatible handler ─────────────────────────────────────────────

  /**
   * Returns a handler function compatible with api.registerHttpRoute().
   * Returns true when the request was handled, false to pass through.
   */
  handler(): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
    return async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      for (const route of this.routes) {
        // Method check (null = accept any)
        if (route.method !== null && req.method !== route.method) {
          continue;
        }

        const match = matchPath(route.compiledPath, url.pathname);
        if (!match) continue;

        const ctx = this.buildContext(req, res, url, match.params);
        try {
          await route.handler(ctx);
        } catch (err) {
          this.options.logger.error(`Route handler error [${req.method} ${url.pathname}]: ${err}`);
          if (!res.headersSent) {
            ctx.error(500, 'Internal Server Error');
          }
        }
        return true;
      }

      return false; // no route matched
    };
  }

  // ── Context factory ─────────────────────────────────────────────────────────

  private buildContext(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    params: Record<string, string>
  ): RequestContext {
    const { service, logger, config } = this.options;

    const json = (data: unknown, status = 200) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };

    const text = (body: string, status = 200) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'text/plain');
      res.end(body);
    };

    const error = (status: number, message: string) => {
      json({ error: message }, status);
    };

    const methodNotAllowed = () => {
      res.statusCode = 405;
      res.end('Method Not Allowed');
    };

    return { req, res, url, params, service, logger, config, json, text, error, methodNotAllowed };
  }
}
