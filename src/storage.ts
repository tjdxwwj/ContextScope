/**
 * ContextScope Storage Module
 * 
 * Handles persistent storage of request data using JSON files
 */

import path from 'node:path';
import fs from 'node:fs';
import type { PluginLogger, TaskData, TaskMeta, TaskTokenStats, TaskTreeNode } from './models/shared-types.js';
import { SCHEMA_SQL } from './dao/schema.sql.js';
import { RequestDao } from './dao/request.dao.js';
import { ToolCallDao } from './dao/tool-call.dao.js';
import { SubagentLinkDao } from './dao/subagent-link.dao.js';
import { TaskDao } from './dao/task.dao.js';

export interface RequestData {
  id?: number;
  type: 'input' | 'output';
  runId: string;
  taskId?: string;  // ← 新增：关联任务 ID
  sessionId: string;
  sessionKey?: string;
  provider: string;
  model: string;
  timestamp: number;
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

export interface RequestListItem {
  id?: number;
  type: 'input' | 'output';
  runId: string;
  taskId?: string;
  sessionId: string;
  sessionKey?: string;
  provider: string;
  model: string;
  timestamp: number;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  imagesCount?: number;
}

export interface RequestQueryFilters {
  sessionId?: string;
  runId?: string;
  taskId?: string;
  provider?: string;
  model?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

export interface SubagentLinkData {
  id?: number;
  kind?: 'spawn' | 'send';
  parentRunId: string;
  childRunId?: string;
  parentSessionId?: string;
  parentSessionKey?: string;
  childSessionKey?: string;
  runtime?: 'subagent' | 'acp';
  mode?: 'run' | 'session';
  label?: string;
  toolCallId?: string;
  timestamp: number;
  endedAt?: number;
  outcome?: 'success' | 'error' | 'timeout' | 'aborted' | 'unknown';
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCallData {
  id?: number;
  runId: string;
  sessionId?: string;
  sessionKey?: string;
  toolName: string;
  toolCallId?: string;
  timestamp: number;
  startedAt?: number;
  durationMs?: number;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface StorageStats {
  totalRequests: number;
  todayRequests: number;
  weekRequests: number;
  storageSize: string;
  oldestRequest?: number;
  newestRequest?: number;
}

export interface StorageOptions {
  workspaceDir: string;
  maxRequests: number;
  retentionDays: number;
  compression: boolean;
  logger: PluginLogger;
}

export class RequestAnalyzerStorage {
  private legacyDataFile: string;
  private metaFile: string;
  private requests: RequestData[] = [];
  private tasks: TaskData[] = [];  // ← 新增：任务数组
  private subagentLinks: SubagentLinkData[] = [];
  private toolCalls: ToolCallData[] = [];
  private sqliteDb: any | null = null;
  private sqliteEnabled = false;
  private options: StorageOptions;
  private initialized = false;
  // DAO instances (set when SQLite is enabled)
  private requestDao: RequestDao | null = null;
  private toolCallDao: ToolCallDao | null = null;
  private subagentLinkDao: SubagentLinkDao | null = null;
  private taskDao: TaskDao | null = null;
  private nextId = 1;
  private nextLinkId = 1;
  private nextToolCallId = 1;
  private persistTimer: NodeJS.Timeout | null = null;
  private persistInFlight: Promise<void> | null = null;
  private pendingPersist = false;
  private readonly persistDebounceMs = 500;

  constructor(options: StorageOptions) {
    this.options = options;
    this.legacyDataFile = path.join(options.workspaceDir, 'requests.json');
    this.metaFile = path.join(options.workspaceDir, 'storage-meta.json');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dir = this.options.workspaceDir;
    
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.metaFile)) {
        const metaContent = fs.readFileSync(this.metaFile, 'utf-8');
        const meta = JSON.parse(metaContent);
        this.nextId = meta.nextId || 1;
        this.nextLinkId = meta.nextLinkId || 1;
        this.nextToolCallId = meta.nextToolCallId || 1;
      }

      if (fs.existsSync(this.legacyDataFile)) {
        const content = fs.readFileSync(this.legacyDataFile, 'utf-8');
        const data = JSON.parse(content);
        this.requests.push(...(data.requests || []));
        this.subagentLinks.push(...(data.subagentLinks || []));
        this.toolCalls.push(...(data.toolCalls || []));
        this.nextId = Math.max(this.nextId, data.nextId || 1);
        this.nextLinkId = Math.max(this.nextLinkId, data.nextLinkId || 1);
        this.nextToolCallId = Math.max(this.nextToolCallId, data.nextToolCallId || 1);
      }

      const datedFiles = this.getDatedDataFiles();
      for (const filePath of datedFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        this.requests.push(...(data.requests || []));
        this.tasks.push(...(data.tasks || []));  // ← 新增
        this.subagentLinks.push(...(data.subagentLinks || []));
        this.toolCalls.push(...(data.toolCalls || []));
      }

      this.requests = this.sortByTimestampDesc(this.requests);
      this.tasks = this.tasks.sort((a, b) => b.startTime - a.startTime);  // ← 新增
      this.subagentLinks = this.sortByTimestampDesc(this.subagentLinks);
      this.toolCalls = this.sortByTimestampDesc(this.toolCalls);
      this.requests = this.deduplicateById(this.requests);
      this.tasks = this.deduplicateTasks(this.tasks);  // ← 新增
      this.subagentLinks = this.deduplicateById(this.subagentLinks);
      this.toolCalls = this.deduplicateById(this.toolCalls);

      this.nextId = Math.max(this.nextId, this.getNextIdFromItems(this.requests));
      this.nextLinkId = Math.max(this.nextLinkId, this.getNextIdFromItems(this.subagentLinks));
      this.nextToolCallId = Math.max(this.nextToolCallId, this.getNextIdFromItems(this.toolCalls));

      const hadLegacyFile = fs.existsSync(this.legacyDataFile);
      await this.initializeSqlite();
      if (this.sqliteEnabled) {
        this.requests = [];
        this.subagentLinks = [];
        this.toolCalls = [];
      }

      this.initialized = true;

      if (hadLegacyFile) {
        await this.persistImmediately();
        fs.unlinkSync(this.legacyDataFile);
      }

      this.options.logger.info('ContextScope storage initialized');
    } catch (error) {
      this.options.logger.error(`Failed to initialize storage: ${error}`);
      throw error;
    }
  }

  private async persist(): Promise<void> {
    if (!this.initialized) return;

    try {
      const grouped = new Map<string, {
        requests: RequestData[];
        tasks: TaskData[];  // ← 新增
        subagentLinks: SubagentLinkData[];
        toolCalls: ToolCallData[];
      }>();

      if (!this.sqliteEnabled) {
        for (const request of this.requests) {
          const key = this.getDateKey(request.timestamp);
          if (!grouped.has(key)) {
            grouped.set(key, { requests: [], tasks: [], subagentLinks: [], toolCalls: [] });
          }
          grouped.get(key)!.requests.push(request);
        }
      }

      for (const task of this.tasks) {
        const key = this.getDateKey(task.startTime);
        if (!grouped.has(key)) {
          grouped.set(key, { requests: [], tasks: [], subagentLinks: [], toolCalls: [] });
        }
        grouped.get(key)!.tasks.push(task);
      }

      if (!this.sqliteEnabled) {
        for (const link of this.subagentLinks) {
          const key = this.getDateKey(link.timestamp);
          if (!grouped.has(key)) {
            grouped.set(key, { requests: [], tasks: [], subagentLinks: [], toolCalls: [] });
          }
          grouped.get(key)!.subagentLinks.push(link);
        }

        for (const toolCall of this.toolCalls) {
          const key = this.getDateKey(toolCall.timestamp);
          if (!grouped.has(key)) {
            grouped.set(key, { requests: [], tasks: [], subagentLinks: [], toolCalls: [] });
          }
          grouped.get(key)!.toolCalls.push(toolCall);
        }
      }

      const activeFiles = new Set<string>();
      for (const [dateKey, data] of grouped) {
        const filePath = this.getDataFilePath(dateKey);
        activeFiles.add(path.basename(filePath));
        const payload = {
          date: dateKey,
          requests: this.sortByTimestampDesc(data.requests),
          tasks: data.tasks,  // ← 新增
          subagentLinks: this.sortByTimestampDesc(data.subagentLinks),
          toolCalls: this.sortByTimestampDesc(data.toolCalls),
          lastUpdated: Date.now()
        };
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
      }

      for (const oldFilePath of this.getDatedDataFiles()) {
        const fileName = path.basename(oldFilePath);
        if (!activeFiles.has(fileName)) {
          fs.unlinkSync(oldFilePath);
        }
      }

      const meta = {
        nextId: this.nextId,
        nextLinkId: this.nextLinkId,
        nextToolCallId: this.nextToolCallId,
        lastUpdated: Date.now()
      };
      fs.writeFileSync(this.metaFile, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (error) {
      this.options.logger.error(`Failed to persist data: ${error}`);
    }
  }

  private schedulePersist(): void {
    if (!this.initialized) return;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.runPersist();
    }, this.persistDebounceMs);
  }

  private async runPersist(): Promise<void> {
    if (this.persistInFlight) {
      this.pendingPersist = true;
      return;
    }
    this.persistInFlight = this.persist();
    try {
      await this.persistInFlight;
    } finally {
      this.persistInFlight = null;
      if (this.pendingPersist) {
        this.pendingPersist = false;
        this.schedulePersist();
      }
    }
  }

  private async persistImmediately(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.persistInFlight) {
      await this.persistInFlight;
    }
    await this.persist();
  }

  private async initializeSqlite(): Promise<void> {
    try {
      this.options.logger.info?.('Initializing SQLite...');
      
      // 尝试使用 require 加载 node:sqlite (适用于 OpenClaw 环境)
      let DatabaseSync: any;
      try {
        // 先尝试动态导入
        // @ts-ignore - node:sqlite is available in Node 22+
        const sqliteModule = await import('node:sqlite');
        DatabaseSync = (sqliteModule as any).DatabaseSync;
      } catch (importError) {
        this.options.logger.warn?.(`SQLite import failed: ${importError}`);
        // 如果动态导入失败，尝试 require
        try {
          const { createRequire } = await import('module');
          const require = createRequire(import.meta.url);
          // @ts-ignore - node:sqlite is available in Node 22+
          const sqliteModule = require('node:sqlite');
          DatabaseSync = sqliteModule.DatabaseSync;
        } catch (requireError) {
          this.options.logger.warn?.(`SQLite require failed: ${requireError}`);
          return;
        }
      }
      
      if (!DatabaseSync) {
        this.options.logger.warn?.('SQLite DatabaseSync not available');
        return;
      }
      
      const dbFile = path.join(this.options.workspaceDir, 'contextscope.db');
      this.options.logger.info?.(`Creating SQLite database at: ${dbFile}`);
      const db = new DatabaseSync(dbFile);
      this.options.logger.info?.('SQLite database created successfully');
      // Apply schema via DAO layer (no inline SQL here)
      db.exec(SCHEMA_SQL);
      this.sqliteDb = db;
      // Wire up DAOs
      this.requestDao = new RequestDao(db);
      this.toolCallDao = new ToolCallDao(db);
      this.subagentLinkDao = new SubagentLinkDao(db);
      this.taskDao = new TaskDao(db);
      this.sqliteEnabled = true;
      this.options.logger.info('ContextScope storage SQLite enabled');
    } catch (error) {
      this.sqliteDb = null;
      this.sqliteEnabled = false;
      this.options.logger.warn(`SQLite unavailable, fallback to JSON storage: ${error}`);
    }
  }

  // ── JSON helpers (kept for JSON-file fallback path) ─────────────────────
  private toJson(value: unknown): string | null {
    if (value == null) return null;
    try { return JSON.stringify(value); } catch { return null; }
  }

  // row mappers removed — now live in the DAO layer

  async captureRequest(data: RequestData): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      const requestWithId: RequestData = {
        ...data,
        id: this.nextId++
      };
      if (this.sqliteEnabled && this.requestDao) {
        this.requestDao.upsert(requestWithId);
      } else {
        this.requests.unshift(requestWithId);
      }

      // Cleanup old requests if needed
      this.cleanupOldRequests();
      
      this.schedulePersist();
      
    } catch (error) {
      this.options.logger.error(`Failed to capture request: ${error}`);
      throw error;
    }
  }

  /**
   * Get the input request for a specific runId
   */
  async getInputForRun(runId: string): Promise<RequestData | undefined> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.requestDao) {
      return this.requestDao.findInputByRunId(runId);
    }
    return this.requests.find(r => r.runId === runId && r.type === 'input');
  }

  // ==================== Task Methods (新增任务方法) ====================

  /**
   * Capture task data
   */
  async captureTask(data: TaskMeta): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      // Check if task already exists in memory
      const existingIndex = this.tasks.findIndex(t => t.taskId === data.taskId);

      if (existingIndex >= 0) {
        // Update existing task
        this.tasks[existingIndex] = { ...this.tasks[existingIndex], ...data };
        this.options.logger.debug?.(`Updated task ${data.taskId}`);
      } else {
        // Add new task
        this.tasks.unshift(data);
        this.options.logger.debug?.(`Captured new task ${data.taskId}`);
      }

      // 如果 SQLite 已启用，立即写入数据库
      if (this.sqliteEnabled && this.taskDao) {
        this.taskDao.upsert(data);
      }

      this.cleanupOldRequests();
      this.schedulePersist();
    } catch (error) {
      this.options.logger.error(`Failed to capture task: ${error}`);
      throw error;
    }
  }

  /**
   * Update task stats
   */
  async updateTaskStats(taskId: string, stats: Partial<TaskTokenStats>): Promise<void> {
    if (!this.initialized) await this.initialize();

    const task = this.tasks.find(t => t.taskId === taskId);
    if (task) {
      task.tokenStats = { ...(task.tokenStats ?? { totalInput: 0, totalOutput: 0, totalTokens: 0, estimatedCost: 0 }), ...stats };
      task.stats = {
        llmCalls: task.llmCalls,
        toolCalls: task.toolCalls,
        subagentSpawns: task.subagentSpawns,
        totalInput: task.tokenStats.totalInput,
        totalOutput: task.tokenStats.totalOutput,
        totalTokens: task.tokenStats.totalTokens,
        estimatedCost: task.tokenStats.estimatedCost,
      };
      this.schedulePersist();
      this.options.logger.debug?.(`Updated stats for task ${taskId}`);
    }
  }

  /**
   * Get task by taskId
   */
  async getTask(taskId: string): Promise<TaskData | undefined> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.taskDao) return this.taskDao.findById(taskId);
    return this.tasks.find(t => t.taskId === taskId);
  }

  /**
   * Get task by sessionId
   */
  async getTaskBySessionId(sessionId: string): Promise<TaskData | undefined> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.taskDao) return this.taskDao.findBySessionId(sessionId);
    return this.tasks.find(t => t.sessionId === sessionId);
  }

  /**
   * Get task by sessionKey
   */
  async getTaskBySessionKey(sessionKey: string): Promise<TaskData | undefined> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.taskDao) return this.taskDao.findBySessionKey(sessionKey);
    return this.tasks.find(t => t.sessionKey === sessionKey);
  }

  /**
   * Get recent tasks
   */
  async getRecentTasks(limit = 50, sessionId?: string): Promise<TaskData[]> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.taskDao) return this.taskDao.findRecent(limit, sessionId);
    let tasks = sessionId
      ? this.tasks.filter(t => t.sessionId === sessionId)
      : this.tasks.filter(t => !t.parentTaskId);
    return tasks.sort((a, b) => b.startTime - a.startTime).slice(0, limit);
  }

  /**
   * Get task tree (with aggregated stats)
   */
  async getTaskTree(rootTaskId: string): Promise<TaskTreeNode | null> {
    const rootTask = await this.getTask(rootTaskId);
    if (!rootTask) return null;

    // Recursively build tree
    const buildTree = async (task: TaskData): Promise<TaskTreeNode> => {
      const children: TaskTreeNode[] = [];

      if (task.childTaskIds) {
        for (const childTaskId of task.childTaskIds) {
          const childTask = await this.getTask(childTaskId);
          if (childTask) {
            children.push(await buildTree(childTask));
          }
        }
      }

      // Calculate aggregated stats
      const aggregatedStats = this.aggregateStats(task, children);

      return {
        task,
        children,
        aggregatedStats
      };
    };

    return await buildTree(rootTask);
  }

  /**
   * Get tasks by session ID
   */
  async getTasksBySessionId(sessionId: string, limit = 50): Promise<TaskData[]> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.taskDao) return this.taskDao.findBySessionIdMany(sessionId, limit);
    return this.tasks
      .filter(t => t.sessionId === sessionId)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  /**
   * Aggregate stats (recursive)
   */
  private aggregateStats(task: TaskData, children: TaskTreeNode[]): TaskTreeNode['aggregatedStats'] {
    const selfTokenStats = task.tokenStats ?? task.stats ?? {
      totalInput: 0,
      totalOutput: 0,
      totalTokens: 0,
      estimatedCost: 0,
    };
    const childStats = children.reduce((acc, child) => ({
      llmCalls: acc.llmCalls + child.aggregatedStats.llmCalls,
      toolCalls: acc.toolCalls + child.aggregatedStats.toolCalls,
      subagentSpawns: acc.subagentSpawns + child.aggregatedStats.subagentSpawns,
      totalInput: acc.totalInput + child.aggregatedStats.totalInput,
      totalOutput: acc.totalOutput + child.aggregatedStats.totalOutput,
      totalTokens: acc.totalTokens + child.aggregatedStats.totalTokens,
      estimatedCost: acc.estimatedCost + child.aggregatedStats.estimatedCost,
      depth: Math.max(acc.depth, child.aggregatedStats.depth),
      descendantCount: acc.descendantCount + child.aggregatedStats.descendantCount + 1
    }), {
      llmCalls: 0,
      toolCalls: 0,
      subagentSpawns: 0,
      totalInput: 0,
      totalOutput: 0,
      totalTokens: 0,
      estimatedCost: 0,
      depth: 0,
      descendantCount: 0
    });

    return {
      llmCalls: task.llmCalls + childStats.llmCalls,
      toolCalls: task.toolCalls + childStats.toolCalls,
      subagentSpawns: task.subagentSpawns + childStats.subagentSpawns,
      totalInput: selfTokenStats.totalInput + childStats.totalInput,
      totalOutput: selfTokenStats.totalOutput + childStats.totalOutput,
      totalTokens: selfTokenStats.totalTokens + childStats.totalTokens,
      estimatedCost: selfTokenStats.estimatedCost + childStats.estimatedCost,
      depth: 1 + childStats.depth,
      descendantCount: childStats.descendantCount
    };
  }

  // ==================== Existing Methods ====================

  async captureSubagentLink(data: SubagentLinkData): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      const recordWithId: SubagentLinkData = {
        ...data,
        kind: data.kind ?? 'spawn',
        outcome: data.outcome ?? undefined,
        id: this.nextLinkId++
      };
      if (this.sqliteEnabled && this.subagentLinkDao) {
        this.subagentLinkDao.upsert(recordWithId);
      } else {
        this.subagentLinks.unshift(recordWithId);
      }
      this.cleanupOldRequests();
      this.schedulePersist();
    } catch (error) {
      this.options.logger.error(`Failed to capture subagent link: ${error}`);
      throw error;
    }
  }

  async updateSubagentLinkByChildRunId(params: {
    childRunId: string;
    patch: Partial<Pick<SubagentLinkData, 'endedAt' | 'outcome' | 'error' | 'metadata'>>;
  }): Promise<void> {
    if (!this.initialized) await this.initialize();

    const childRunId = params.childRunId.trim();
    if (!childRunId) {
      return;
    }

    if (this.sqliteEnabled && this.subagentLinkDao) {
      const current = this.subagentLinkDao.findByChildRunId(childRunId);
      if (!current) return;
      const next: SubagentLinkData = {
        ...current,
        ...params.patch,
        metadata: { ...(current.metadata || {}), ...(params.patch.metadata || {}) }
      };
      this.subagentLinkDao.upsert(next);
    } else {
      const idx = this.subagentLinks.findIndex(r => r.childRunId === childRunId);
      if (idx < 0) {
        return;
      }
      const current = this.subagentLinks[idx];
      const next: SubagentLinkData = {
        ...current,
        ...params.patch,
        metadata: {
          ...(current.metadata || {}),
          ...(params.patch.metadata || {})
        }
      };
      this.subagentLinks[idx] = next;
    }
    this.schedulePersist();
  }

  async captureToolCall(data: ToolCallData): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      const recordWithId: ToolCallData = {
        ...data,
        id: this.nextToolCallId++
      };
      if (this.sqliteEnabled && this.toolCallDao) {
        this.toolCallDao.upsert(recordWithId);
      } else {
        this.toolCalls.unshift(recordWithId);
      }
      this.cleanupOldRequests();
      this.schedulePersist();
    } catch (error) {
      this.options.logger.error(`Failed to capture tool call: ${error}`);
      throw error;
    }
  }

  async getRequests(filters: RequestQueryFilters = {}): Promise<RequestData[]> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.requestDao) {
      return this.requestDao.findMany(filters);
    }
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    const result: RequestData[] = [];
    let matched = 0;
    for (const request of this.requests) {
      if (filters.sessionId && request.sessionId !== filters.sessionId) continue;
      if (filters.runId && request.runId !== filters.runId) continue;
      if (filters.provider && request.provider !== filters.provider) continue;
      if (filters.model && request.model !== filters.model) continue;
      if (filters.startTime && request.timestamp < filters.startTime) continue;
      if (filters.endTime && request.timestamp > filters.endTime) continue;
      if (matched >= offset && result.length < limit) {
        result.push(request);
      }
      matched++;
      if (result.length >= limit) break;
    }
    return result;
  }

  async getRequestSummaries(filters: RequestQueryFilters = {}): Promise<RequestListItem[]> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.requestDao) {
      return this.requestDao.findSummaries(filters);
    }
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    const result: RequestListItem[] = [];
    let matched = 0;
    for (const request of this.requests) {
      if (filters.sessionId && request.sessionId !== filters.sessionId) continue;
      if (filters.runId && request.runId !== filters.runId) continue;
      if (filters.taskId && request.taskId !== filters.taskId) continue;
      if (filters.provider && request.provider !== filters.provider) continue;
      if (filters.model && request.model !== filters.model) continue;
      if (filters.startTime && request.timestamp < filters.startTime) continue;
      if (filters.endTime && request.timestamp > filters.endTime) continue;
      if (filters.endTime && request.timestamp > filters.endTime) continue;
      if (matched >= offset && result.length < limit) {
        result.push({
          id: request.id,
          type: request.type,
          runId: request.runId,
          taskId: request.taskId,
          sessionId: request.sessionId,
          sessionKey: request.sessionKey,
          provider: request.provider,
          model: request.model,
          timestamp: request.timestamp,
          usage: request.usage,
          imagesCount: request.imagesCount,
        });
      }
      matched++;
      if (result.length >= limit) break;
    }
    return result;
  }

  async getToolCalls(filters: {
    runId?: string;
    sessionId?: string;
    toolName?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolCallData[]> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.toolCallDao) {
      return this.toolCallDao.findMany(filters);
    }
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    const result: ToolCallData[] = [];
    let matched = 0;
    for (const toolCall of this.toolCalls) {
      if (filters.runId && toolCall.runId !== filters.runId) continue;
      if (filters.sessionId && toolCall.sessionId !== filters.sessionId) continue;
      if (filters.toolName && toolCall.toolName !== filters.toolName) continue;
      if (filters.startTime && toolCall.timestamp < filters.startTime) continue;
      if (filters.endTime && toolCall.timestamp > filters.endTime) continue;
      if (matched >= offset && result.length < limit) {
        result.push(toolCall);
      }
      matched++;
      if (result.length >= limit) break;
    }
    return result;
  }

  async getSubagentLinks(filters: {
    parentRunId?: string;
    childRunId?: string;
    parentSessionId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<SubagentLinkData[]> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.subagentLinkDao) {
      return this.subagentLinkDao.findMany(filters);
    }
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    const result: SubagentLinkData[] = [];
    let matched = 0;
    for (const link of this.subagentLinks) {
      if (filters.parentRunId && link.parentRunId !== filters.parentRunId) continue;
      if (filters.childRunId && link.childRunId !== filters.childRunId) continue;
      if (filters.parentSessionId && link.parentSessionId !== filters.parentSessionId) continue;
      if (filters.startTime && link.timestamp < filters.startTime) continue;
      if (filters.endTime && link.timestamp > filters.endTime) continue;
      if (matched >= offset && result.length < limit) {
        result.push(link);
      }
      matched++;
      if (result.length >= limit) break;
    }
    return result;
  }

  async getStats(): Promise<StorageStats> {
    if (!this.initialized) await this.initialize();

    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const todayTime = today.getTime();
    const weekAgoTime = weekAgo.getTime();

    let totalRequests = this.requests.length;
    let todayRequests = this.requests.filter(r => r.timestamp >= todayTime).length;
    let weekRequests = this.requests.filter(r => r.timestamp >= weekAgoTime).length;
    let oldestRequest = this.requests.length > 0 ? this.requests[this.requests.length - 1].timestamp : undefined;
    if (this.sqliteEnabled && this.requestDao) {
      totalRequests = this.requestDao.count();
      todayRequests = this.requestDao.countSince(todayTime);
      weekRequests = this.requestDao.countSince(weekAgoTime);
      oldestRequest = this.requestDao.oldestTimestamp();
    }

    return {
      totalRequests,
      todayRequests,
      weekRequests,
      storageSize: this.getDatabaseSize(),
      oldestRequest,
      newestRequest: now
    };
  }

  private getDatabaseSize(): string {
    try {
      let bytes = 0;
      if (fs.existsSync(this.metaFile)) {
        bytes += fs.statSync(this.metaFile).size;
      }
      if (fs.existsSync(this.legacyDataFile)) {
        bytes += fs.statSync(this.legacyDataFile).size;
      }
      for (const filePath of this.getDatedDataFiles()) {
        bytes += fs.statSync(filePath).size;
      }
      const sqliteFile = path.join(this.options.workspaceDir, 'contextscope.db');
      if (fs.existsSync(sqliteFile)) {
        bytes += fs.statSync(sqliteFile).size;
      }
      
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } catch {
      return '0 B';
    }
  }

  private cleanupOldRequests(): void {
    const cutoffTime = Date.now() - (this.options.retentionDays * 24 * 60 * 60 * 1000);
    if (this.sqliteEnabled && this.requestDao && this.subagentLinkDao && this.toolCallDao) {
      this.requestDao.deleteOlderThan(cutoffTime);
      this.subagentLinkDao.deleteOlderThan(cutoffTime);
      this.toolCallDao.deleteOlderThan(cutoffTime);
      this.requestDao.keepTopN(this.options.maxRequests);
      this.subagentLinkDao.keepTopN(this.options.maxRequests);
      this.toolCallDao.keepTopN(this.options.maxRequests);
      return;
    }
    
    // Remove old requests
    this.requests = this.requests.filter(r => r.timestamp >= cutoffTime);
    this.subagentLinks = this.subagentLinks.filter(r => r.timestamp >= cutoffTime);
    this.toolCalls = this.toolCalls.filter(r => r.timestamp >= cutoffTime);
    
    // Remove excess requests if over limit
    if (this.requests.length > this.options.maxRequests) {
      this.requests = this.requests.slice(0, this.options.maxRequests);
    }
    if (this.subagentLinks.length > this.options.maxRequests) {
      this.subagentLinks = this.subagentLinks.slice(0, this.options.maxRequests);
    }
    if (this.toolCalls.length > this.options.maxRequests) {
      this.toolCalls = this.toolCalls.slice(0, this.options.maxRequests);
    }
  }

  async close(): Promise<void> {
    await this.persistImmediately();
    if (this.sqliteDb) {
      try {
        this.sqliteDb.close?.();
      } catch {
      }
      this.sqliteDb = null;
    }
    this.initialized = false;
  }

  async clearByDate(dateKey: string): Promise<{ date: string; removedRequests: number; removedSubagentLinks: number; removedToolCalls: number }> {
    if (!this.initialized) await this.initialize();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new Error('Invalid date format, expected YYYY-MM-DD');
    }

    let beforeRequests = this.requests.length;
    let beforeLinks = this.subagentLinks.length;
    let beforeToolCalls = this.toolCalls.length;
    if (this.sqliteEnabled && this.requestDao && this.subagentLinkDao && this.toolCallDao) {
      const start = new Date(`${dateKey}T00:00:00`).getTime();
      const end = new Date(`${dateKey}T23:59:59.999`).getTime();
      beforeRequests = this.requestDao.deleteInRange(start, end);
      beforeLinks = this.subagentLinkDao.deleteInRange(start, end);
      beforeToolCalls = this.toolCallDao.deleteInRange(start, end);
    } else {
      this.requests = this.requests.filter(item => this.getDateKey(item.timestamp) !== dateKey);
      this.subagentLinks = this.subagentLinks.filter(item => this.getDateKey(item.timestamp) !== dateKey);
      this.toolCalls = this.toolCalls.filter(item => this.getDateKey(item.timestamp) !== dateKey);
    }

    await this.persistImmediately();

    return {
      date: dateKey,
      removedRequests: this.sqliteEnabled ? beforeRequests : beforeRequests - this.requests.length,
      removedSubagentLinks: this.sqliteEnabled ? beforeLinks : beforeLinks - this.subagentLinks.length,
      removedToolCalls: this.sqliteEnabled ? beforeToolCalls : beforeToolCalls - this.toolCalls.length
    };
  }

  async clearAll(): Promise<{ removedRequests: number; removedSubagentLinks: number; removedToolCalls: number }> {
    if (!this.initialized) await this.initialize();

    let removedRequests = this.requests.length;
    let removedSubagentLinks = this.subagentLinks.length;
    let removedToolCalls = this.toolCalls.length;
    if (this.sqliteEnabled && this.requestDao && this.subagentLinkDao && this.toolCallDao) {
      removedRequests = this.requestDao.deleteAll();
      removedSubagentLinks = this.subagentLinkDao.deleteAll();
      removedToolCalls = this.toolCallDao.deleteAll();
    } else {
      this.requests = [];
      this.subagentLinks = [];
      this.toolCalls = [];
    }

    await this.persistImmediately();

    return {
      removedRequests,
      removedSubagentLinks,
      removedToolCalls
    };
  }

  private deduplicateTasks(items: TaskData[]): TaskData[] {
    const seen = new Set<string>();
    return items.filter(item => {
      if (seen.has(item.taskId)) {
        return false;
      }
      seen.add(item.taskId);
      return true;
    });
  }

  private getDateKey(timestamp: number): string {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDataFilePath(dateKey: string): string {
    return path.join(this.options.workspaceDir, `requests-${dateKey}.json`);
  }

  private getDatedDataFiles(): string[] {
    if (!fs.existsSync(this.options.workspaceDir)) {
      return [];
    }
    const files = fs.readdirSync(this.options.workspaceDir)
      .filter(file => /^requests-\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .map(file => path.join(this.options.workspaceDir, file));
    return files;
  }

  private sortByTimestampDesc<T extends { timestamp: number; id?: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return (b.id || 0) - (a.id || 0);
    });
  }

  private getNextIdFromItems<T extends { id?: number }>(items: T[]): number {
    if (items.length === 0) {
      return 1;
    }
    return Math.max(...items.map(item => item.id || 0)) + 1;
  }

  private deduplicateById<T extends { id?: number; timestamp: number }>(items: T[]): T[] {
    const seen = new Set<number>();
    const deduped: T[] = [];
    for (const item of items) {
      const key = item.id || 0;
      if (key > 0) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      deduped.push(item);
    }
    return deduped;
  }
}
