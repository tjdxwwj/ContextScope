/**
 * ContextScope Independent Server - Main Entry Point
 * 
 * DDD Architecture + Dependency Injection + Repository Pattern
 */

import { Application } from './app/bootstrap.js';
import { config } from './config/index.js';

async function main() {
  const app = new Application();

  // 优雅关闭
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n[Main] Received ${signal}, shutting down gracefully...`);
    await app.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // 启动应用
  try {
    await app.start();
  } catch (error) {
    console.error('[Main] Application failed to start:', error);
    process.exit(1);
  }
}

// 启动
main().catch(console.error);
