/**
 * ReductionLog Repository 接口
 */

import type { ReductionLogEntity } from './reduction-log.entity.js';

export interface ReductionLogStats {
  totalReductions: number;
  totalTokensSaved: number;
  avgTokensSaved: number;
  avgDurationMs: number;
}

export interface IReductionLogRepository {
  /**
   * 保存 reduction 日志
   */
  save(log: ReductionLogEntity): Promise<ReductionLogEntity>;

  /**
   * 查询最近的 reduction 日志
   */
  findRecent(limit: number, sessionId?: string): Promise<ReductionLogEntity[]>;

  /**
   * 获取统计数据
   */
  getStats(sessionId?: string): Promise<ReductionLogStats>;

  /**
   * 删除旧数据
   */
  deleteOlderThan(timestamp: number): Promise<number>;
}
