/**
 * Task Tracker for ContextScope
 * 
 * Tracks task lifecycle, aggregates statistics, and handles subagent relationships.
 * Strategy: Query storage for task state instead of relying on memory.
 */

import type { RequestAnalyzerStorage } from './storage.js';
import type { TaskData, TaskStats, TaskStatus } from './types.js';

export interface TaskTrackerOptions {
  taskTimeoutMs?: number;        // Default: 10 minutes
  maxActiveTasks?: number;       // Default: 100
  enableLogging?: boolean;       // Default: true
}

export class TaskTracker {
  private storage: RequestAnalyzerStorage;
  private logger: { info?: (msg: string) => void; warn?: (msg: string) => void; debug?: (msg: string) => void };
  private readonly taskTimeoutMs: number;
  private readonly maxActiveTasks: number;
  private readonly enableLogging: boolean;

  constructor(
    storage: RequestAnalyzerStorage,
    logger: { info?: (msg: string) => void; warn?: (msg: string) => void; debug?: (msg: string) => void },
    options: TaskTrackerOptions = {}
  ) {
    this.storage = storage;
    this.logger = logger;
    this.taskTimeoutMs = options.taskTimeoutMs ?? 600000; // 10 minutes
    this.maxActiveTasks = options.maxActiveTasks ?? 100;
    this.enableLogging = options.enableLogging ?? true;
  }

  /**
   * Start or get existing task
   * Strategy: Query storage for unfinished task instead of relying on memory
   */
  async startTask(
    sessionId: string,
    sessionKey?: string,
    parentTaskId?: string,
    parentSessionId?: string,
    metadata?: Partial<TaskData['metadata']>
  ): Promise<string> {
    // Query storage for existing unfinished task
    const existingTask = await this.storage.getTaskBySessionId(sessionId);
    
    if (existingTask && existingTask.status === 'running') {
      this.logDebug?.(`Reusing existing task ${existingTask.taskId} for session ${sessionId}`);
      return existingTask.taskId;
    }
    
    // Create new task
    const taskId = `task_${Date.now()}_${sessionId.split('-')[0]}`;
    const taskData: TaskData = {
      taskId,
      sessionId,
      sessionKey,
      parentTaskId,
      parentSessionId,
      startTime: Date.now(),
      status: 'running',
      stats: {
        llmCalls: 0,
        toolCalls: 0,
        subagentSpawns: 0,
        totalInput: 0,
        totalOutput: 0,
        totalTokens: 0,
        estimatedCost: 0
      },
      runIds: [],
      metadata: { 
        ...metadata, 
        depth: parentTaskId ? 1 : 0 
      }
    };
    
    // Persist immediately
    await this.storage.captureTask(taskData);
    
    this.logInfo(`Started new task ${taskId} for session ${sessionId}`);
    
    return taskId;
  }

  /**
   * Record LLM call
   * @returns The updated task
   */
  async recordLLMCall(sessionId: string, runId: string, input: number, output: number): Promise<TaskData | null> {
    const task = await this.storage.getTaskBySessionId(sessionId);
    if (!task) {
      this.logWarn?.(`LLM call without active task for session ${sessionId}`);
      return null;
    }
    
    // Update task stats (直接修改引用对象，因为 getTaskBySessionId 返回的是内存中的引用)
    task.stats.llmCalls++;
    task.stats.totalInput += input;
    task.stats.totalOutput += output;
    task.stats.totalTokens = task.stats.totalInput + task.stats.totalOutput;
    task.stats.estimatedCost = this.estimateCost(task.stats.totalInput, task.stats.totalOutput);
    
    if (!task.runIds.includes(runId)) {
      task.runIds.push(runId);
    }
    
    this.logDebug?.(`Task ${task.taskId}: LLM call #${task.stats.llmCalls} (${input} in, ${output} out) | Total Output: ${task.stats.totalOutput}`);
    
    // Persist update - 直接保存修改后的 task 对象
    await this.storage.captureTask(task);
    
    return task;
  }

  /**
   * Record tool call
   */
  async recordToolCall(sessionId: string): Promise<void> {
    const task = await this.storage.getTaskBySessionId(sessionId);
    if (task) {
      task.stats.toolCalls++;
      await this.storage.captureTask(task);
    }
  }

  /**
   * Record subagent spawn
   * Note: This updates the parent task's subagent count
   */
  async recordSubagentSpawn(sessionId: string, childSessionKey?: string): Promise<void> {
    // Query for the task with this sessionId (could be parent or child)
    const task = await this.storage.getTaskBySessionId(sessionId);
    if (task) {
      task.stats.subagentSpawns++;
      await this.storage.captureTask(task);
    }
  }

  /**
   * End task and persist
   */
  async endTask(
    sessionId: string,
    reason: 'completed' | 'error' | 'timeout' | 'aborted' = 'completed',
    error?: string
  ): Promise<TaskData | null> {
    const task = await this.storage.getTaskBySessionId(sessionId);
    if (!task) {
      this.logWarn?.(`Ending task without active task for session ${sessionId}`);
      return null;
    }
    
    // Update task status
    task.endTime = Date.now();
    task.duration = task.endTime - task.startTime;
    task.status = this.mapReasonToStatus(reason);
    task.endReason = reason;
    task.error = error;
    
    // If this is a subagent task, link it to the parent task via SubagentLinks
    if (task.sessionKey && task.sessionKey.includes('subagent')) {
      try {
        // Query SubagentLinks to find the parent
        const allLinks = await this.storage.getSubagentLinks({});
        const link = allLinks.find(l => l.childSessionKey === task.sessionKey);
        
        if (link && link.parentSessionId) {
          // Find parent task by parentSessionId
          const parentTask = await this.storage.getTaskBySessionId(link.parentSessionId);
          
          if (parentTask && !parentTask.childTaskIds?.includes(task.taskId)) {
            if (!parentTask.childTaskIds) {
              parentTask.childTaskIds = [];
            }
            parentTask.childTaskIds.push(task.taskId);
            parentTask.stats.subagentSpawns = (parentTask.stats.subagentSpawns || 0) + 1;
            await this.storage.captureTask(parentTask);
            this.logDebug?.(`Linked child task ${task.taskId} to parent ${parentTask.taskId} via SubagentLink`);
          }
        }
      } catch (linkError) {
        this.logWarn?.(`Failed to link subagent via SubagentLinks: ${linkError}`);
      }
    }
    
    // Persist update
    await this.storage.captureTask(task);
    
    const childCount = task.childTaskIds?.length || 0;
    const childNote = childCount > 0 ? ` (with ${childCount} subagents)` : '';
    
    this.logInfo(
      `Task ${task.taskId}${childNote} ended: ` +
      `${task.stats.llmCalls} LLM calls, ` +
      `${task.stats.toolCalls} tool calls, ` +
      `${task.stats.subagentSpawns} subagents, ` +
      `${task.stats.totalTokens} tokens`
    );
    
    return task;
  }

  /**
   * Map reason to status
   */
  private mapReasonToStatus(reason: string): TaskStatus {
    switch (reason) {
      case 'completed': return 'completed';
      case 'error': return 'error';
      case 'timeout': return 'timeout';
      case 'aborted': return 'aborted';
      default: return 'completed';
    }
  }

  /**
   * Estimate cost based on input/output tokens
   * Uses average pricing: $0.001/1K input, $0.003/1K output
   */
  private estimateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * 1;  // $1 per 1M input
    const outputCost = (outputTokens / 1_000_000) * 3; // $3 per 1M output
    return inputCost + outputCost;
  }

  /**
   * Logging helpers
   */
  private logInfo(message: string): void {
    if (this.enableLogging) {
      this.logger.info?.(message);
    }
  }

  private logWarn(message: string): void {
    if (this.enableLogging) {
      this.logger.warn?.(message);
    }
  }

  private logDebug(message: string): void {
    if (this.enableLogging) {
      this.logger.debug?.(message);
    }
  }
}
