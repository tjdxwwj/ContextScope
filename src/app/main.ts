/**
 * 独立服务器入口 — 不依赖 OpenClaw 插件系统，直接启动 ContextScope HTTP 服务
 */

import { Application } from './bootstrap.js';

const app = new Application();

app.start().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`\n[Server] Received ${signal}, shutting down...`);
    await app.stop();
    process.exit(0);
  });
}
