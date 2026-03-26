/**
 * HTTP 服务器
 */

import express, { Express } from 'express';
import cors from 'cors';
import { inject, injectable } from 'inversify';
import { HooksRouter } from '../infrastructure/http/routes/hooks.router.js';
import { config } from '../config/index.js';
import { TYPES } from './container.js';

/**
 * HTTP 服务器
 */
@injectable()
export class HttpServer {
  private readonly app: Express;

  constructor(
    @inject(TYPES.HooksRouter) private readonly hooksRouter: HooksRouter
  ) {
    this.app = express();
    this.middleware();
    this.routes();
    this.errorHandler();
  }

  /**
   * 配置中间件
   */
  private middleware(): void {
    // CORS
    this.app.use(cors({
      origin: config.server.corsOrigins,
    }));

    // JSON 解析
    this.app.use(express.json({ limit: config.server.maxBodySize }));
    this.app.use(express.urlencoded({ extended: true }));

    // 请求日志
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        console.log(`[HTTP] ${req.method} ${req.path} - ${res.statusCode} (${Date.now() - start}ms)`);
      });
      next();
    });
  }

  /**
   * 配置路由
   */
  private routes(): void {
    // Hook 路由
    this.app.use('/hooks', this.hooksRouter.getRouter());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime(),
      });
    });

    // Stats
    this.app.get('/stats', (req, res) => {
      res.json({
        status: 'ok',
        message: 'Stats endpoint - TODO: implement',
      });
    });

    // 404
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
      });
    });
  }

  /**
   * 错误处理
   */
  private errorHandler(): void {
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('[HTTP] Error:', err);
      res.status(500).json({
        ok: false,
        error: err.message,
      });
    });
  }

  /**
   * 启动服务器
   */
  public start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        console.log(`[HTTP] Server started on http://localhost:${port}`);
        resolve();
      });
    });
  }

  /**
   * 获取 Express 应用
   */
  public getApp(): Express {
    return this.app;
  }
}
