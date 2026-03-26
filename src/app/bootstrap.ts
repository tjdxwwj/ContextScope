/**
 * 应用启动引导
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import { createContainer, TYPES } from './container.js';
import { SqliteClient } from '../infrastructure/database/sqlite.client.js';
import { HttpServer } from './server.js';
import { config } from '../config/index.js';

/**
 * 应用引导
 */
export class Application {
  private readonly container: Container;
  private readonly sqliteClient: SqliteClient;
  private readonly httpServer: HttpServer;

  constructor() {
    console.log('[Bootstrap] Creating DI container...');
    this.container = createContainer();
    
    console.log('[Bootstrap] Getting SqliteClient...');
    this.sqliteClient = this.container.get<SqliteClient>(TYPES.SqliteClient);
    
    console.log('[Bootstrap] Getting HttpServer...');
    this.httpServer = this.container.get<HttpServer>(TYPES.HttpServer);
  }

  /**
   * 启动应用
   */
  public async start(): Promise<void> {
    try {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║  🔍 ContextScope Independent Server (DDD)                 ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('');

      // 初始化数据库
      console.log('[Bootstrap] Initializing database...');
      this.sqliteClient.initialize();

      // 启动 HTTP 服务器
      console.log('[Bootstrap] Starting HTTP server...');
      await this.httpServer.start(config.port);

      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log(`║  📊 Dashboard: http://localhost:${config.port}/plugins/contextscope   ║`);
      console.log(`║  🩺 Health:    http://localhost:${config.port}/health                 ║`);
      console.log(`║  🔗 Hooks:     http://localhost:${config.port}/hooks                  ║`);
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('');
    } catch (error) {
      console.error('[Bootstrap] Failed to start application:', error);
      throw error;
    }
  }

  /**
   * 停止应用
   */
  public async stop(): Promise<void> {
    console.log('[Bootstrap] Stopping application...');
    this.sqliteClient.close();
    console.log('[Bootstrap] Application stopped');
  }
}
