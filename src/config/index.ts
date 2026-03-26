/**
 * 配置入口
 */

import path from 'node:path';
import { getEnv } from './env.js';
import type { AppConfig } from './schema.js';

const env = getEnv();

/**
 * 构建应用配置
 */
export function buildConfig(): AppConfig {
  const workspaceDir = env.CONTEXTSCOPE_WORKSPACE || 
    path.join(process.env.APPDATA || process.env.HOME || '~', '.openclaw/contextscope');

  return {
    port: parseInt(env.PORT),
    workspaceDir,
    storage: {
      maxRequests: parseInt(env.MAX_REQUESTS),
      retentionDays: parseInt(env.RETENTION_DAYS),
      compression: true,
    },
    logging: {
      level: env.LOG_LEVEL,
      format: env.NODE_ENV === 'production' ? 'json' : 'pretty',
    },
    server: {
      maxBodySize: '10mb',
      corsOrigins: ['*'],
    },
  };
}

/**
 * 单例配置实例
 */
export const config = buildConfig();
