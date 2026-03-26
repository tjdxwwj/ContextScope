/**
 * Request Repository 接口
 */

import type { RequestEntity } from './request.entity.js';
import type { PaginatedResult, TimeRange } from '../../shared/types/common.js';

/**
 * Request 查询参数
 */
export interface RequestQueryParams extends TimeRange {
  sessionId?: string;
  runId?: string;
  taskId?: string;
  provider?: string;
  model?: string;
  type?: 'input' | 'output';
}

/**
 * Request Repository 接口
 */
export interface IRequestRepository {
  /**
   * 保存请求
   */
  save(request: RequestEntity): Promise<RequestEntity>;

  /**
   * 根据 ID 查找
   */
  findById(id: number): Promise<RequestEntity | null>;

  /**
   * 根据 runId 查找输入请求
   */
  findInputByRunId(runId: string): Promise<RequestEntity | null>;

  /**
   * 查询请求列表
   */
  findMany(params: RequestQueryParams, pagination?: { limit?: number; offset?: number }): Promise<PaginatedResult<RequestEntity>>;

  /**
   * 统计数量
   */
  count(params?: RequestQueryParams): Promise<number>;

  /**
   * 删除旧数据
   */
  deleteOlderThan(timestamp: number): Promise<number>;

  /**
   * 保留最新的 N 条
   */
  keepTopN(n: number): Promise<number>;
}
