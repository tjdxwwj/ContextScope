/**
 * Context Reducer 领域服务
 *
 * 封装 pipeline 执行 + 日志存储。
 */

import { inject, injectable } from 'inversify';
import type { ILogger } from '../../shared/logger.js';
import type { IReductionLogRepository } from './reduction-log.repository.js';
import { ReductionLogEntity } from './reduction-log.entity.js';
import { runPipeline } from './reducer-pipeline.js';
import { resolveConfig, type ContextReducerConfig, type PipelineResult } from './types.js';
import { TYPES } from '../../app/types.js';

export interface ReduceResult {
  messages: unknown[];
  pipeline: PipelineResult;
}

@injectable()
export class ContextReducerService {
  constructor(
    @inject(TYPES.IReductionLogRepository) private readonly logRepo: IReductionLogRepository,
    @inject(TYPES.Logger) private readonly logger: ILogger,
  ) {}

  /**
   * 对 messages 执行 context reduction
   *
   * @param messages  上下文消息数组（会被原地修改）
   * @param sessionId 会话 ID
   * @param rawConfig 可选的配置覆盖
   */
  async reduce(
    messages: unknown[],
    sessionId: string,
    rawConfig?: unknown,
  ): Promise<ReduceResult> {
    const config = resolveConfig(rawConfig);

    if (!config.enabled) {
      return {
        messages,
        pipeline: {
          tokensBefore: 0,
          tokensAfter: 0,
          tokensSaved: 0,
          reductions: [],
          durationMs: 0,
        },
      };
    }

    const messageCountBefore = messages.length;

    // 运行 pipeline
    const result = runPipeline(messages, config, this.logger);

    this.logger.info(
      `[ContextReducer] Reduced ${result.tokensBefore} → ${result.tokensAfter} tokens ` +
      `(saved ${result.tokensSaved}, ${result.durationMs}ms)`,
    );

    // 持久化日志
    if (config.logging.enabled) {
      try {
        const logEntry = new ReductionLogEntity({
          timestamp: new Date().toISOString(),
          sessionId,
          stage: 'before_prompt_build',
          messageCountBefore,
          messageCountAfter: messages.length,
          tokensBefore: result.tokensBefore,
          tokensAfter: result.tokensAfter,
          tokensSaved: result.tokensSaved,
          reductions: result.reductions,
          durationMs: result.durationMs,
        });
        await this.logRepo.save(logEntry);
      } catch (error) {
        // Best-effort logging — never crash for logging failures
        this.logger.error('[ContextReducer] Failed to save reduction log:', error);
      }
    }

    return { messages, pipeline: result };
  }
}
