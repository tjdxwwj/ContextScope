/**
 * Task 领域服务
 */

import { inject, injectable } from 'inversify';
import type { ITaskRepository } from './task.repository.js';
import { TaskEntity } from './task.entity.js';
import { NotFoundError, DomainError } from '../../shared/errors/app-error.js';
import type { TaskStatus } from '../../shared/types/common.js';
import { TYPES } from '../../app/container.js';

export interface CreateTaskInput {
  sessionId: string;
  sessionKey?: string;
  parentTaskId?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskContext {
  agentId?: string;
  channelId?: string;
  trigger?: string;
}

/**
 * Task 领域服务
 */
@injectable()
export class TaskService {
  constructor(
    @inject(TYPES.ITaskRepository) private readonly taskRepo: ITaskRepository
  ) {}

  /**
   * 创建或获取任务
   */
  async startTask(
    sessionId: string,
    sessionKey?: string,
    parentTaskId?: string,
    metadata?: Record<string, unknown>,
    context?: TaskContext
  ): Promise<TaskEntity> {
    // 先查找是否已存在活跃任务
    const existingTask = await this.taskRepo.findBySessionId(sessionId);
    
    if (existingTask && !existingTask.isCompleted()) {
      return existingTask;
    }

    // 创建新任务
    const taskId = `task_${Date.now()}_${sessionId.slice(0, 8)}`;
    
    const task = new TaskEntity({
      taskId,
      sessionId,
      sessionKey,
      status: 'active',
      startTime: Date.now(),
      llmCalls: 0,
      toolCalls: 0,
      subagentSpawns: 0,
      parentTaskId,
      metadata: context ? { ...metadata, ...context } : metadata,
    });

    return await this.taskRepo.save(task);
  }

  /**
   * 记录 LLM 调用
   */
  async recordLLMCall(
    sessionId: string,
    runId: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<TaskEntity> {
    const task = await this.taskRepo.findBySessionId(sessionId);
    
    if (!task) {
      throw new NotFoundError('Task', sessionId);
    }

    const updatedTask = task.recordLLMCall(inputTokens, outputTokens);
    return await this.taskRepo.save(updatedTask);
  }

  /**
   * 结束任务
   */
  async endTask(
    sessionId: string,
    reason: TaskStatus = 'completed',
    error?: string
  ): Promise<TaskEntity | null> {
    const task = await this.taskRepo.findBySessionId(sessionId);
    
    if (!task) {
      return null;
    }

    if (task.isCompleted()) {
      return task;
    }

    return await this.taskRepo.updateStatus(task.taskId, reason, error);
  }

  /**
   * 获取任务
   */
  async getTask(taskId: string): Promise<TaskEntity> {
    const task = await this.taskRepo.findById(taskId);
    
    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    return task;
  }

  /**
   * 获取最近任务
   */
  async getRecentTasks(limit: number = 50, sessionId?: string): Promise<TaskEntity[]> {
    return await this.taskRepo.findRecent(limit, sessionId);
  }

  /**
   * 验证任务状态
   */
  async validateTaskStatus(taskId: string, expectedStatus: TaskStatus): Promise<boolean> {
    const task = await this.getTask(taskId);
    return task.status === expectedStatus;
  }
}
