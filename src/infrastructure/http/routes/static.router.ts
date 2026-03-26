/**
 * Static Router - 前端静态文件服务
 */

import { Router, Request, Response } from 'express';
import { injectable } from 'inversify';
import { existsSync, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 查找前端 dist 路径
 */
function findFrontendDistPath(): string {
  const candidates = [
    join(__dirname, '..', '..', '..', 'frontend', 'dist'),
    join(__dirname, '..', '..', 'frontend', 'dist'),
    join(__dirname, '..', 'frontend', 'dist'),
  ];
  for (const p of candidates) {
    if (existsSync(join(p, 'index.html'))) return p;
  }
  return '';
}

const FRONTEND_DIST_PATH = findFrontendDistPath();

/**
 * Static Router
 */
@injectable()
export class StaticRouter {
  private readonly router: Router;

  constructor() {
    this.router = Router();
    this.routes();
  }

  private routes(): void {
    // 提供静态文件
    this.router.get('/plugins/contextscope*', (req, res) => {
      this.serveFrontend(req, res);
    });
  }

  /**
   * 提供前端文件
   */
  private serveFrontend(req: Request, res: Response): void {
    if (!FRONTEND_DIST_PATH) {
      res.status(404).json({
        error: 'Frontend not found',
      });
      return;
    }

    const filePath = join(FRONTEND_DIST_PATH, 'index.html');
    
    if (!existsSync(filePath)) {
      res.status(404).json({
        error: 'index.html not found',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/html');
    createReadStream(filePath).pipe(res);
  }

  /**
   * 获取路由器
   */
  public getRouter(): Router {
    return this.router;
  }
}
