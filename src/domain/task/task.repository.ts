/**
 * Task Repository 接口
 */

import type { TaskEntity } from './task.entity.js';
import type { TaskStatus } from '../../shared/types/common.js';

/**
 * Task 查询参数
 */
export interface TaskQueryParams {
  sessionId?: string;
  sessionKey?: string;
  status?: TaskStatus;
  startTime?: number;
  endTime?: number;
}

/**
 * Task Repository 接口
 */
export interface ITaskRepository {
  /**
   * 保存任务
   */
  save(task: TaskEntity): Promise<TaskEntity>;

  /**
   * 根据 taskId 查找
   */
  findById(taskId: string): Promise<TaskEntity | null>;

  /**
   * 根据 sessionId 查找
   */
  findBySessionId(sessionId: string): Promise<TaskEntity | null>;

  /**
   * 根据 sessionKey 查找
   */
  findBySessionKey(sessionKey: string): Promise<TaskEntity | null>;

  /**
   * 查询最近的任务
   */
  findRecent(limit: number, sessionId?: string): Promise<TaskEntity[]>;

  /**
   * 查询任务列表
   */
  findMany(params: TaskQueryParams, limit?: number, offset?: number): Promise<TaskEntity[]>;

  /**
   * 更新任务状态
   */
  updateStatus(taskId: string, status: TaskStatus, error?: string): Promise<TaskEntity | null>;

  /**
   * 删除旧数据
   */
  deleteOlderThan(timestamp: number): Promise<number>;
}
