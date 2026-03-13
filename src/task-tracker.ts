/**
 * Task Tracker for ContextScope
 * 
 * Tracks task lifecycle, aggregates statistics, and handles subagent relationships.
 * Supports automatic task boundary detection via agent_end hook.
 */

import type { RequestAnalyzerStorage } from './storage.js';
import type { TaskData, TaskStats, ActiveTask, TaskStatus } from './types.js';

export interface TaskTrackerOptions {
  taskTimeoutMs?: number;        // Default: 10 minutes
  maxActiveTasks?: number;       // Default: 100
  enableLogging?: boolean;       // Default: true
}

export class TaskTracker {
  private activeTasks = new Map<string, ActiveTask>(); // sessionId -> task
  private storage: RequestAnalyzerStorage;
  private logger: { info?: (msg: string) => void; warn?: (msg: string) => void; debug?: (msg: string) => void };
  private readonly taskTimeoutMs: number;
  private readonly maxActiveTasks: number;
  private readonly enableLogging: boolean;
  private taskTimeouts = new Map<string, NodeJS.Timeout>();

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
   */
  startTask(
    sessionId: string,
    sessionKey?: string,
    parentTaskId?: string,
    parentSessionId?: string,
    metadata?: Partial<TaskData['metadata']>
  ): string {
    const existing = this.activeTasks.get(sessionId);
    
    if (existing) {
      this.logDebug(`Reusing active task ${existing.taskId} for session ${sessionId}`);
      return existing.taskId;
    }
    
    // Check max active tasks limit
    if (this.activeTasks.size >= this.maxActiveTasks) {
      this.logWarn(`Max active tasks (${this.maxActiveTasks}) reached, forcing cleanup`);
      this.cleanupOldTasks();
    }
    
    const taskId = `task_${Date.now()}_${sessionId.split('-')[0]}`;
    const task: ActiveTask = {
      taskId,
      sessionId,
      sessionKey,
      parentTaskId,
      parentSessionId,
      startTime: Date.now(),
      runIds: new Set(),
      llmCalls: 0,
      toolCalls: 0,
      subagentSpawns: 0,
      totalInput: 0,
      totalOutput: 0,
      metadata: { 
        ...metadata, 
        depth: parentTaskId ? 1 : 0 
      }
    };
    
    this.activeTasks.set(sessionId, task);
    this.setupTimeout(sessionId);
    
    this.logInfo(`Started new task ${taskId} for session ${sessionId}`);
    
    return taskId;
  }

  /**
   * Record LLM call
   */
  recordLLMCall(sessionId: string, runId: string, input: number, output: number): void {
    const task = this.activeTasks.get(sessionId);
    if (!task) {
      this.logWarn(`LLM call without active task for session ${sessionId}`);
      return;
    }
    
    task.runIds.add(runId);
    task.llmCalls++;
    task.totalInput += input;
    task.totalOutput += output;
    
    this.logDebug(`Task ${task.taskId}: LLM call #${task.llmCalls} (${input} in, ${output} out)`);
  }

  /**
   * Record tool call
   */
  recordToolCall(sessionId: string): void {
    const task = this.activeTasks.get(sessionId);
    if (task) {
      task.toolCalls++;
    }
  }

  /**
   * Record subagent spawn
   */
  recordSubagentSpawn(sessionId: string): void {
    const task = this.activeTasks.get(sessionId);
    if (task) {
      task.subagentSpawns++;
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
    const task = this.activeTasks.get(sessionId);
    if (!task) {
      this.logWarn(`Ending task without active task for session ${sessionId}`);
      return null;
    }
    
    // Clear timeout
    this.clearTimeout(sessionId);
    
    // Query subagent links
    const subagentLinks = await this.storage.getSubagentLinks({ parentSessionId: sessionId });
    const childTaskIds: string[] = [];
    const childSessionIds: string[] = [];
    
    for (const link of subagentLinks) {
      if (link.childSessionKey) {
        // Find child task by sessionKey
        const childTask = Array.from(this.activeTasks.values()).find(t => t.sessionKey === link.childSessionKey);
        if (childTask) {
          childTaskIds.push(childTask.taskId);
          childSessionIds.push(link.childSessionKey.split(':').pop() || link.childSessionKey);
        }
      }
    }
    
    // Build task data
    const taskData: TaskData = {
      taskId: task.taskId,
      sessionId: task.sessionId,
      sessionKey: task.sessionKey,
      parentTaskId: task.parentTaskId,
      parentSessionId: task.parentSessionId,
      startTime: task.startTime,
      endTime: Date.now(),
      duration: Date.now() - task.startTime,
      status: this.mapReasonToStatus(reason),
      endReason: reason,
      error,
      stats: this.calculateStats(task),
      runIds: Array.from(task.runIds),
      childTaskIds: childTaskIds.length > 0 ? childTaskIds : undefined,
      childSessionIds: childSessionIds.length > 0 ? childSessionIds : undefined,
      metadata: task.metadata
    };
    
    // Persist
    await this.storage.captureTask(taskData);
    
    // Clean up active task
    this.activeTasks.delete(sessionId);
    
    const childCount = childTaskIds.length;
    const childNote = childCount > 0 ? ` (with ${childCount} subagents)` : '';
    
    this.logInfo(
      `Task ${task.taskId}${childNote} ended: ` +
      `${task.llmCalls} LLM calls, ` +
      `${task.toolCalls} tool calls, ` +
      `${task.subagentSpawns} subagents, ` +
      `${task.totalInput + task.totalOutput} tokens`
    );
    
    return taskData;
  }

  /**
   * Get active task count
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Get active task by session ID
   */
  getActiveTask(sessionId: string): ActiveTask | undefined {
    return this.activeTasks.get(sessionId);
  }

  /**
   * Clean up old active tasks (keep most recent)
   */
  private cleanupOldTasks(): void {
    const entries = Array.from(this.activeTasks.entries());
    const toRemove = entries.slice(0, entries.length - this.maxActiveTasks + 10);
    
    for (const [sessionId] of toRemove) {
      this.logWarn(`Force ending old task for session ${sessionId}`);
      this.endTask(sessionId, 'aborted').catch(err => {
        this.logWarn(`Failed to end old task: ${err}`);
      });
    }
  }

  /**
   * Setup timeout cleanup
   */
  private setupTimeout(sessionId: string): void {
    const existingTimeout = this.taskTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    const timeout = setTimeout(async () => {
      this.logWarn(`Task timeout for session ${sessionId}, forcing end`);
      await this.endTask(sessionId, 'timeout');
    }, this.taskTimeoutMs);
    
    this.taskTimeouts.set(sessionId, timeout);
  }

  /**
   * Clear timeout
   */
  private clearTimeout(sessionId: string): void {
    const timeout = this.taskTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.taskTimeouts.delete(sessionId);
    }
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
   * Calculate task stats
   */
  private calculateStats(task: ActiveTask): TaskStats {
    return {
      llmCalls: task.llmCalls,
      toolCalls: task.toolCalls,
      subagentSpawns: task.subagentSpawns,
      totalInput: task.totalInput,
      totalOutput: task.totalOutput,
      totalTokens: task.totalInput + task.totalOutput,
      estimatedCost: this.estimateCost(task.totalInput + task.totalOutput)
    };
  }

  /**
   * Estimate cost (simplified)
   * Assumes $0.01/1K tokens average cost
   */
  private estimateCost(tokens: number): number {
    return (tokens / 1000) * 0.01;
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
