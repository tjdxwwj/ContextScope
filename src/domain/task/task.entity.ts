/**
 * Task 领域实体
 */

import type { BaseEntity, TaskStatus } from '../../shared/types/common.js';

export interface TaskTokenStats {
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface TaskStats {
  llmCalls: number;
  toolCalls: number;
  subagentSpawns: number;
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface TaskMetadata {
  agentId?: string;
  channelId?: string;
  trigger?: string;
  parentTaskId?: string;
  childTaskIds?: string[];
  [key: string]: unknown;
}

/**
 * Task 实体
 */
export class TaskEntity implements BaseEntity {
  public readonly taskId: string;
  public readonly sessionId: string;
  public readonly sessionKey?: string;
  public status: TaskStatus;  // ✅ 改为可变
  public readonly startTime: number;
  public endTime?: number;  // ✅ 改为可变
  public error?: string;  // ✅ 改为可变
  public readonly metadata?: TaskMetadata;
  public readonly tokenStats?: TaskTokenStats;
  public readonly stats?: TaskStats;
  public llmCalls: number;  // ✅ 改为可变
  public toolCalls: number;  // ✅ 改为可变
  public subagentSpawns: number;  // ✅ 改为可变
  public readonly parentTaskId?: string;
  public readonly childTaskIds?: string[];
  
  public readonly createdAt?: Date;
  public updatedAt?: Date;  // ✅ 改为可变

  constructor(props: {
    taskId: string;
    sessionId: string;
    sessionKey?: string;
    status: TaskStatus;
    startTime: number;
    endTime?: number;
    error?: string;
    metadata?: TaskMetadata;
    tokenStats?: TaskTokenStats;
    stats?: TaskStats;
    llmCalls: number;
    toolCalls: number;
    subagentSpawns: number;
    parentTaskId?: string;
    childTaskIds?: string[];
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.taskId = props.taskId;
    this.sessionId = props.sessionId;
    this.sessionKey = props.sessionKey;
    this.status = props.status;
    this.startTime = props.startTime;
    this.endTime = props.endTime;
    this.error = props.error;
    this.metadata = props.metadata;
    this.tokenStats = props.tokenStats;
    this.stats = props.stats;
    this.llmCalls = props.llmCalls;
    this.toolCalls = props.toolCalls;
    this.subagentSpawns = props.subagentSpawns;
    this.parentTaskId = props.parentTaskId;
    this.childTaskIds = props.childTaskIds;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * 判断任务是否已完成
   */
  isCompleted(): boolean {
    return this.status === 'completed' || this.status === 'error' || this.status === 'timeout' || this.status === 'aborted';
  }

  /**
   * 更新任务状态
   */
  updateStatus(status: TaskStatus, error?: string): void {
    this.status = status;
    this.endTime = Date.now();
    if (error) {
      this.error = error;
    }
    this.updatedAt = new Date();
  }

  /**
   * 更新 LLM 调用统计
   */
  recordLLMCall(inputTokens: number, outputTokens: number): TaskEntity {
    const newTokenStats = {
      totalInput: (this.tokenStats?.totalInput || 0) + inputTokens,
      totalOutput: (this.tokenStats?.totalOutput || 0) + outputTokens,
      totalTokens: (this.tokenStats?.totalTokens || 0) + inputTokens + outputTokens,
      estimatedCost: this.calculateCost(inputTokens, outputTokens),
    };

    return new TaskEntity({
      ...this,
      llmCalls: this.llmCalls + 1,
      tokenStats: newTokenStats,
      stats: {
        ...this.stats,
        llmCalls: this.llmCalls + 1,
        totalInput: newTokenStats.totalInput,
        totalOutput: newTokenStats.totalOutput,
        totalTokens: newTokenStats.totalTokens,
        estimatedCost: newTokenStats.estimatedCost,
      },
      updatedAt: new Date(),
    });
  }

  /**
   * 计算成本（简化版本）
   */
  private calculateCost(inputTokens: number, outputTokens: number): number {
    // 假设每 1000 tokens $0.002
    const rate = 0.000002;
    return (inputTokens + outputTokens) * rate;
  }
}
