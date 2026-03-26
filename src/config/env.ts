/**
 * 环境变量配置
 */

import { z } from 'zod';

// 环境变量 schema
const envSchema = z.object({
  PORT: z.string().default('18790'),
  CONTEXTSCOPE_WORKSPACE: z.string().optional(),
  MAX_REQUESTS: z.string().default('10000'),
  RETENTION_DAYS: z.string().default('7'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * 解析环境变量
 */
export function parseEnv(env: Record<string, string | undefined>): EnvConfig {
  const result = envSchema.safeParse(env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }
  
  return result.data;
}

/**
 * 获取配置值
 */
export function getEnv(): EnvConfig {
  return parseEnv({
    PORT: process.env.PORT,
    CONTEXTSCOPE_WORKSPACE: process.env.CONTEXTSCOPE_WORKSPACE,
    MAX_REQUESTS: process.env.MAX_REQUESTS,
    RETENTION_DAYS: process.env.RETENTION_DAYS,
    NODE_ENV: process.env.NODE_ENV as any,
    LOG_LEVEL: process.env.LOG_LEVEL as any,
  });
}
