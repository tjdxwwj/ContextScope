/**
 * 配置 Schema 定义
 */

import { z } from 'zod';

export const configSchema = z.object({
  port: z.number().min(1).max(65535),
  workspaceDir: z.string(),
  storage: z.object({
    maxRequests: z.number().min(100).max(100000),
    retentionDays: z.number().min(1).max(365),
    compression: z.boolean().default(true),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    format: z.enum(['json', 'pretty']).default('pretty'),
  }),
  server: z.object({
    maxBodySize: z.string().default('10mb'),
    corsOrigins: z.array(z.string()).default(['*']),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;
