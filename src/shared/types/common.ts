/**
 * 共享类型定义
 */

/**
 * 基础实体接口
 */
export interface BaseEntity {
  id?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * 请求类型
 */
export type RequestType = 'input' | 'output';

/**
 * 任务状态
 */
export type TaskStatus = 'active' | 'completed' | 'error' | 'timeout' | 'aborted';

/**
 * 子任务类型
 */
export type SubagentKind = 'spawn' | 'send';

/**
 * 运行时类型
 */
export type RuntimeType = 'subagent' | 'acp';

/**
 * 任务模式
 */
export type TaskMode = 'run' | 'session';

/**
 * 分页参数
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * 分页结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/**
 * 时间范围
 */
export interface TimeRange {
  startTime?: number;
  endTime?: number;
}
