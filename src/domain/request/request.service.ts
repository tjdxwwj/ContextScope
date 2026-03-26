/**
 * Request 领域服务
 */

import type { IRequestRepository } from './request.repository.js';
import { RequestEntity } from './request.entity.js';
import { NotFoundError } from '../../shared/errors/app-error.js';

export interface CreateRequestInput {
  type: 'input' | 'output';
  runId: string;
  taskId?: string;
  sessionId: string;
  sessionKey?: string;
  provider: string;
  model: string;
  prompt?: string;
  systemPrompt?: string;
  historyMessages?: unknown[];
  assistantTexts?: string[];
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  imagesCount?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Request 领域服务
 */
export class RequestService {
  constructor(private readonly requestRepo: IRequestRepository) {}

  /**
   * 创建请求
   */
  async createRequest(data: CreateRequestInput): Promise<RequestEntity> {
    const request = new RequestEntity({
      type: data.type,
      runId: data.runId,
      taskId: data.taskId,
      sessionId: data.sessionId,
      sessionKey: data.sessionKey,
      provider: data.provider,
      model: data.model,
      timestamp: Date.now(),
      prompt: data.prompt,
      systemPrompt: data.systemPrompt,
      historyMessages: data.historyMessages,
      assistantTexts: data.assistantTexts,
      usage: data.usage,
      imagesCount: data.imagesCount,
      metadata: data.metadata,
    });

    return await this.requestRepo.save(request);
  }

  /**
   * 获取输入的请求
   */
  async getInputForRun(runId: string): Promise<RequestEntity> {
    const request = await this.requestRepo.findInputByRunId(runId);
    
    if (!request) {
      throw new NotFoundError('Input request', runId);
    }

    return request;
  }

  /**
   * 查询请求列表
   */
  async listRequests(
    params: {
      sessionId?: string;
      runId?: string;
      taskId?: string;
      provider?: string;
      model?: string;
      startTime?: number;
      endTime?: number;
    },
    limit: number = 100,
    offset: number = 0
  ) {
    return await this.requestRepo.findMany(params, { limit, offset });
  }

  /**
   * 获取统计数据
   */
  async getStats(sessionId?: string) {
    const total = await this.requestRepo.count(sessionId ? { sessionId } : undefined);
    
    // TODO: 添加更多统计逻辑
    return {
      total,
    };
  }
}
