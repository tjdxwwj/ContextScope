/**
 * ContextScope Storage Module
 * 
 * Handles persistent storage of request data using JSON files
 */

import path from 'node:path';
import fs from 'node:fs';
import type { PluginLogger, TaskData, TaskStats, TaskTreeNode } from './types.js';

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
      db.exec(`
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS requests (
          id INTEGER PRIMARY KEY,
          type TEXT NOT NULL,
          run_id TEXT NOT NULL,
          task_id TEXT,
          session_id TEXT NOT NULL,
          session_key TEXT,
          provider TEXT,
          model TEXT,
          timestamp INTEGER NOT NULL,
          prompt TEXT,
          system_prompt TEXT,
          history_messages TEXT,
          assistant_texts TEXT,
          usage_json TEXT,
          images_count INTEGER,
          metadata_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_requests_run_ts ON requests(run_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_requests_session_ts ON requests(session_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(timestamp DESC);
        CREATE TABLE IF NOT EXISTS tool_calls (
          id INTEGER PRIMARY KEY,
          run_id TEXT NOT NULL,
          session_id TEXT,
          session_key TEXT,
          tool_name TEXT NOT NULL,
          tool_call_id TEXT,
          timestamp INTEGER NOT NULL,
          started_at INTEGER,
          duration_ms INTEGER,
          params_json TEXT,
          result_json TEXT,
          error TEXT,
          metadata_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tool_calls_run_ts ON tool_calls(run_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_tool_calls_session_ts ON tool_calls(session_id, timestamp DESC);
        CREATE TABLE IF NOT EXISTS subagent_links (
          id INTEGER PRIMARY KEY,
          kind TEXT,
          parent_run_id TEXT NOT NULL,
          child_run_id TEXT,
          parent_session_id TEXT,
          parent_session_key TEXT,
          child_session_key TEXT,
          runtime TEXT,
          mode TEXT,
          label TEXT,
          tool_call_id TEXT,
          timestamp INTEGER NOT NULL,
          ended_at INTEGER,
          outcome TEXT,
          error TEXT,
          metadata_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_subagent_links_parent_run_ts ON subagent_links(parent_run_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_subagent_links_child_run_ts ON subagent_links(child_run_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_subagent_links_parent_session_ts ON subagent_links(parent_session_id, timestamp DESC);
        CREATE TABLE IF NOT EXISTS tasks (
          task_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          session_key TEXT,
          parent_task_id TEXT,
          parent_session_id TEXT,
          start_time INTEGER NOT NULL,
          end_time INTEGER,
          duration INTEGER,
          status TEXT,
          end_reason TEXT,
          error TEXT,
          llm_calls INTEGER DEFAULT 0,
          tool_calls INTEGER DEFAULT 0,
          subagent_spawns INTEGER DEFAULT 0,
          total_input INTEGER DEFAULT 0,
          total_output INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          estimated_cost REAL DEFAULT 0,
          run_ids_json TEXT,
          child_task_ids_json TEXT,
          metadata_json TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_session_ts ON tasks(session_id, start_time DESC);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      `);
      this.sqliteDb = db;
      this.sqliteEnabled = true;
      this.options.logger.info('ContextScope storage SQLite enabled');
    } catch (error) {
      this.sqliteDb = null;
      this.sqliteEnabled = false;
      this.options.logger.warn(`SQLite unavailable, fallback to JSON storage: ${error}`);
    }
  }

  private toJson(value: unknown): string | null {
    if (value == null) return null;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  private parseJson<T>(value: unknown): T | undefined {
    if (typeof value !== 'string' || value.length === 0) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }

  private sqliteUpsertRequest(data: RequestData): void {
    if (!this.sqliteEnabled || !this.sqliteDb) return;
    this.sqliteDb
      .prepare(`INSERT OR REPLACE INTO requests (
        id, type, run_id, task_id, session_id, session_key, provider, model, timestamp,
        prompt, system_prompt, history_messages, assistant_texts, usage_json, images_count, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        data.id ?? null,
        data.type,
        data.runId,
        data.taskId ?? null,
        data.sessionId,
        data.sessionKey ?? null,
        data.provider,
        data.model,
        data.timestamp,
        data.prompt ?? null,
        data.systemPrompt ?? null,
        this.toJson(data.historyMessages),
        this.toJson(data.assistantTexts),
        this.toJson(data.usage),
        data.imagesCount ?? null,
        this.toJson(data.metadata)
      );
  }

  private sqliteUpsertToolCall(data: ToolCallData): void {
    if (!this.sqliteEnabled || !this.sqliteDb) return;
    this.sqliteDb
      .prepare(`INSERT OR REPLACE INTO tool_calls (
        id, run_id, session_id, session_key, tool_name, tool_call_id, timestamp, started_at,
        duration_ms, params_json, result_json, error, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        data.id ?? null,
        data.runId,
        data.sessionId ?? null,
        data.sessionKey ?? null,
        data.toolName,
        data.toolCallId ?? null,
        data.timestamp,
        data.startedAt ?? null,
        data.durationMs ?? null,
        this.toJson(data.params),
        this.toJson(data.result),
        data.error ?? null,
        this.toJson(data.metadata)
      );
  }

  private sqliteUpsertTask(data: TaskData): void {
    if (!this.sqliteEnabled || !this.sqliteDb) return;
    this.sqliteDb
      .prepare(`INSERT OR REPLACE INTO tasks (
        task_id, session_id, session_key, parent_task_id, parent_session_id,
        start_time, end_time, duration, status, end_reason, error,
        llm_calls, tool_calls, subagent_spawns,
        total_input, total_output, total_tokens, estimated_cost,
        run_ids_json, child_task_ids_json, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        data.taskId,
        data.sessionId,
        data.sessionKey ?? null,
        data.parentTaskId ?? null,
        data.parentSessionId ?? null,
        data.startTime,
        data.endTime ?? null,
        data.duration ?? null,
        data.status ?? null,
        data.endReason ?? null,
        data.error ?? null,
        data.stats?.llmCalls ?? 0,
        data.stats?.toolCalls ?? 0,
        data.stats?.subagentSpawns ?? 0,
        data.stats?.totalInput ?? 0,
        data.stats?.totalOutput ?? 0,
        data.stats?.totalTokens ?? 0,
        data.stats?.estimatedCost ?? 0,
        this.toJson(data.runIds),
        this.toJson(data.childTaskIds),
        this.toJson(data.metadata)
      );
  }

  private sqliteUpsertSubagentLink(data: SubagentLinkData): void {
    if (!this.sqliteEnabled || !this.sqliteDb) return;
    this.sqliteDb
      .prepare(`INSERT OR REPLACE INTO subagent_links (
        id, kind, parent_run_id, child_run_id, parent_session_id, parent_session_key, child_session_key,
        runtime, mode, label, tool_call_id, timestamp, ended_at, outcome, error, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        data.id ?? null,
        data.kind ?? null,
        data.parentRunId,
        data.childRunId ?? null,
        data.parentSessionId ?? null,
        data.parentSessionKey ?? null,
        data.childSessionKey ?? null,
        data.runtime ?? null,
        data.mode ?? null,
        data.label ?? null,
        data.toolCallId ?? null,
        data.timestamp,
        data.endedAt ?? null,
        data.outcome ?? null,
        data.error ?? null,
        this.toJson(data.metadata)
      );
  }

  private fromSqliteRequestRow(row: any): RequestData {
    return {
      id: row.id,
      type: row.type,
      runId: row.run_id,
      taskId: row.task_id ?? undefined,
      sessionId: row.session_id,
      sessionKey: row.session_key ?? undefined,
      provider: row.provider,
      model: row.model,
      timestamp: row.timestamp,
      prompt: row.prompt ?? undefined,
      systemPrompt: row.system_prompt ?? undefined,
      historyMessages: this.parseJson<unknown[]>(row.history_messages),
      assistantTexts: this.parseJson<string[]>(row.assistant_texts),
      usage: this.parseJson<RequestData['usage']>(row.usage_json),
      imagesCount: row.images_count ?? undefined,
      metadata: this.parseJson<Record<string, unknown>>(row.metadata_json),
    };
  }

  private fromSqliteToolCallRow(row: any): ToolCallData {
    return {
      id: row.id,
      runId: row.run_id,
      sessionId: row.session_id ?? undefined,
      sessionKey: row.session_key ?? undefined,
      toolName: row.tool_name,
      toolCallId: row.tool_call_id ?? undefined,
      timestamp: row.timestamp,
      startedAt: row.started_at ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      params: this.parseJson<Record<string, unknown>>(row.params_json),
      result: this.parseJson<unknown>(row.result_json),
      error: row.error ?? undefined,
      metadata: this.parseJson<Record<string, unknown>>(row.metadata_json),
    };
  }

  private fromSqliteSubagentLinkRow(row: any): SubagentLinkData {
    return {
      id: row.id,
      kind: row.kind ?? undefined,
      parentRunId: row.parent_run_id,
      childRunId: row.child_run_id ?? undefined,
      parentSessionId: row.parent_session_id ?? undefined,
      parentSessionKey: row.parent_session_key ?? undefined,
      childSessionKey: row.child_session_key ?? undefined,
      runtime: row.runtime ?? undefined,
      mode: row.mode ?? undefined,
      label: row.label ?? undefined,
      toolCallId: row.tool_call_id ?? undefined,
      timestamp: row.timestamp,
      endedAt: row.ended_at ?? undefined,
      outcome: row.outcome ?? undefined,
      error: row.error ?? undefined,
      metadata: this.parseJson<Record<string, unknown>>(row.metadata_json),
    };
  }

  async captureRequest(data: RequestData): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      const requestWithId: RequestData = {
        ...data,
        id: this.nextId++
      };
      if (this.sqliteEnabled) {
        this.sqliteUpsertRequest(requestWithId);
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
    if (this.sqliteEnabled && this.sqliteDb) {
      const row = this.sqliteDb
        .prepare(`SELECT * FROM requests WHERE run_id = ? AND type = 'input' ORDER BY timestamp DESC, id DESC LIMIT 1`)
        .get(runId);
      return row ? this.fromSqliteRequestRow(row) : undefined;
    }
    return this.requests.find(r => r.runId === runId && r.type === 'input');
  }

  // ==================== Task Methods (新增任务方法) ====================

  /**
   * Capture task data
   */
  async captureTask(data: TaskData): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      // Check if task already exists in memory
      const existingIndex = this.tasks.findIndex(t => t.taskId === data.taskId);

      if (existingIndex >= 0) {
        // Update existing task - 使用深拷贝合并 stats，避免覆盖累加值
        const existingTask = this.tasks[existingIndex];
        this.tasks[existingIndex] = {
          ...existingTask,
          ...data,
          // 关键修复：stats 使用深拷贝合并，保留累加的 token 数
          stats: { ...existingTask.stats, ...data.stats }
        };
        this.options.logger.debug?.(`Updated task ${data.taskId} | Output: ${this.tasks[existingIndex].stats.totalOutput}`);
      } else {
        // Add new task
        this.tasks.unshift(data);
        this.options.logger.debug?.(`Captured new task ${data.taskId}`);
      }

      // 如果 SQLite 已启用，立即写入数据库
      if (this.sqliteEnabled && this.sqliteDb) {
        this.sqliteUpsertTask(data);
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
  async updateTaskStats(taskId: string, stats: Partial<TaskStats>): Promise<void> {
    if (!this.initialized) await this.initialize();

    const task = this.tasks.find(t => t.taskId === taskId);
    if (task) {
      task.stats = { ...task.stats, ...stats };
      this.schedulePersist();
      this.options.logger.debug?.(`Updated stats for task ${taskId}`);
    }
  }

  /**
   * Get task by taskId
   */
  async getTask(taskId: string): Promise<TaskData | undefined> {
    if (!this.initialized) await this.initialize();
    return this.tasks.find(t => t.taskId === taskId);
  }

  /**
   * Get task by sessionId
   */
  async getTaskBySessionId(sessionId: string): Promise<TaskData | undefined> {
    if (!this.initialized) await this.initialize();
    return this.tasks.find(t => t.sessionId === sessionId);
  }

  /**
   * Get task by sessionKey
   */
  async getTaskBySessionKey(sessionKey: string): Promise<TaskData | undefined> {
    if (!this.initialized) await this.initialize();
    return this.tasks.find(t => t.sessionKey === sessionKey);
  }

  /**
   * Get recent tasks
   */
  async getRecentTasks(limit = 50, sessionId?: string): Promise<TaskData[]> {
    if (!this.initialized) await this.initialize();

    let tasks = sessionId
      ? this.tasks.filter(t => t.sessionId === sessionId)
      : this.tasks.filter(t => !t.parentTaskId); // Only root tasks

    return tasks
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
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
    return this.tasks
      .filter(t => t.sessionId === sessionId)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  /**
   * Aggregate stats (recursive)
   */
  private aggregateStats(task: TaskData, children: TaskTreeNode[]): TaskTreeNode['aggregatedStats'] {
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
      llmCalls: task.stats.llmCalls + childStats.llmCalls,
      toolCalls: task.stats.toolCalls + childStats.toolCalls,
      subagentSpawns: task.stats.subagentSpawns + childStats.subagentSpawns,
      totalInput: task.stats.totalInput + childStats.totalInput,
      totalOutput: task.stats.totalOutput + childStats.totalOutput,
      totalTokens: task.stats.totalTokens + childStats.totalTokens,
      estimatedCost: task.stats.estimatedCost + childStats.estimatedCost,
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
      if (this.sqliteEnabled) {
        this.sqliteUpsertSubagentLink(recordWithId);
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

    if (this.sqliteEnabled && this.sqliteDb) {
      const row = this.sqliteDb
        .prepare(`SELECT * FROM subagent_links WHERE child_run_id = ? ORDER BY timestamp DESC, id DESC LIMIT 1`)
        .get(childRunId);
      if (!row) return;
      const current = this.fromSqliteSubagentLinkRow(row);
      const next: SubagentLinkData = {
        ...current,
        ...params.patch,
        metadata: {
          ...(current.metadata || {}),
          ...(params.patch.metadata || {})
        }
      };
      this.sqliteUpsertSubagentLink(next);
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
      if (this.sqliteEnabled) {
        this.sqliteUpsertToolCall(recordWithId);
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

  async getRequests(filters: {
    sessionId?: string;
    runId?: string;
    provider?: string;
    model?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<RequestData[]> {
    if (!this.initialized) await this.initialize();
    if (this.sqliteEnabled && this.sqliteDb) {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (filters.sessionId) {
        clauses.push('session_id = ?');
        params.push(filters.sessionId);
      }
      if (filters.runId) {
        clauses.push('run_id = ?');
        params.push(filters.runId);
      }
      if (filters.provider) {
        clauses.push('provider = ?');
        params.push(filters.provider);
      }
      if (filters.model) {
        clauses.push('model = ?');
        params.push(filters.model);
      }
      if (filters.startTime) {
        clauses.push('timestamp >= ?');
        params.push(filters.startTime);
      }
      if (filters.endTime) {
        clauses.push('timestamp <= ?');
        params.push(filters.endTime);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const offset = filters.offset || 0;
      const limit = filters.limit || 100;
      const sql = `SELECT * FROM requests ${where} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`;
      const rows = this.sqliteDb.prepare(sql).all(...params, limit, offset);
      return rows.map((row: any) => this.fromSqliteRequestRow(row));
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
    if (this.sqliteEnabled && this.sqliteDb) {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (filters.runId) {
        clauses.push('run_id = ?');
        params.push(filters.runId);
      }
      if (filters.sessionId) {
        clauses.push('session_id = ?');
        params.push(filters.sessionId);
      }
      if (filters.toolName) {
        clauses.push('tool_name = ?');
        params.push(filters.toolName);
      }
      if (filters.startTime) {
        clauses.push('timestamp >= ?');
        params.push(filters.startTime);
      }
      if (filters.endTime) {
        clauses.push('timestamp <= ?');
        params.push(filters.endTime);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const offset = filters.offset || 0;
      const limit = filters.limit || 100;
      const sql = `SELECT * FROM tool_calls ${where} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`;
      const rows = this.sqliteDb.prepare(sql).all(...params, limit, offset);
      return rows.map((row: any) => this.fromSqliteToolCallRow(row));
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
    if (this.sqliteEnabled && this.sqliteDb) {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (filters.parentRunId) {
        clauses.push('parent_run_id = ?');
        params.push(filters.parentRunId);
      }
      if (filters.childRunId) {
        clauses.push('child_run_id = ?');
        params.push(filters.childRunId);
      }
      if (filters.parentSessionId) {
        clauses.push('parent_session_id = ?');
        params.push(filters.parentSessionId);
      }
      if (filters.startTime) {
        clauses.push('timestamp >= ?');
        params.push(filters.startTime);
      }
      if (filters.endTime) {
        clauses.push('timestamp <= ?');
        params.push(filters.endTime);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const offset = filters.offset || 0;
      const limit = filters.limit || 100;
      const sql = `SELECT * FROM subagent_links ${where} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`;
      const rows = this.sqliteDb.prepare(sql).all(...params, limit, offset);
      return rows.map((row: any) => this.fromSqliteSubagentLinkRow(row));
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
    if (this.sqliteEnabled && this.sqliteDb) {
      totalRequests = Number(this.sqliteDb.prepare('SELECT COUNT(1) as c FROM requests').get()?.c || 0);
      todayRequests = Number(this.sqliteDb.prepare('SELECT COUNT(1) as c FROM requests WHERE timestamp >= ?').get(todayTime)?.c || 0);
      weekRequests = Number(this.sqliteDb.prepare('SELECT COUNT(1) as c FROM requests WHERE timestamp >= ?').get(weekAgoTime)?.c || 0);
      oldestRequest = this.sqliteDb.prepare('SELECT timestamp FROM requests ORDER BY timestamp ASC LIMIT 1').get()?.timestamp;
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
    if (this.sqliteEnabled && this.sqliteDb) {
      this.sqliteDb.prepare('DELETE FROM requests WHERE timestamp < ?').run(cutoffTime);
      this.sqliteDb.prepare('DELETE FROM subagent_links WHERE timestamp < ?').run(cutoffTime);
      this.sqliteDb.prepare('DELETE FROM tool_calls WHERE timestamp < ?').run(cutoffTime);
      this.sqliteDb.prepare(
        `DELETE FROM requests WHERE id NOT IN (
          SELECT id FROM requests ORDER BY timestamp DESC, id DESC LIMIT ?
        )`
      ).run(this.options.maxRequests);
      this.sqliteDb.prepare(
        `DELETE FROM subagent_links WHERE id NOT IN (
          SELECT id FROM subagent_links ORDER BY timestamp DESC, id DESC LIMIT ?
        )`
      ).run(this.options.maxRequests);
      this.sqliteDb.prepare(
        `DELETE FROM tool_calls WHERE id NOT IN (
          SELECT id FROM tool_calls ORDER BY timestamp DESC, id DESC LIMIT ?
        )`
      ).run(this.options.maxRequests);
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
    if (this.sqliteEnabled && this.sqliteDb) {
      const start = new Date(`${dateKey}T00:00:00`).getTime();
      const end = new Date(`${dateKey}T23:59:59.999`).getTime();
      beforeRequests = Number(this.sqliteDb.prepare('SELECT COUNT(1) as c FROM requests WHERE timestamp >= ? AND timestamp <= ?').get(start, end)?.c || 0);
      beforeLinks = Number(this.sqliteDb.prepare('SELECT COUNT(1) as c FROM subagent_links WHERE timestamp >= ? AND timestamp <= ?').get(start, end)?.c || 0);
      beforeToolCalls = Number(this.sqliteDb.prepare('SELECT COUNT(1) as c FROM tool_calls WHERE timestamp >= ? AND timestamp <= ?').get(start, end)?.c || 0);
      this.sqliteDb.prepare('DELETE FROM requests WHERE timestamp >= ? AND timestamp <= ?').run(start, end);
      this.sqliteDb.prepare('DELETE FROM subagent_links WHERE timestamp >= ? AND timestamp <= ?').run(start, end);
      this.sqliteDb.prepare('DELETE FROM tool_calls WHERE timestamp >= ? AND timestamp <= ?').run(start, end);
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
    if (this.sqliteEnabled && this.sqliteDb) {
      removedRequests = Number(this.sqliteDb.prepare('SELECT COUNT(1) as c FROM requests').get()?.c || 0);
      removedSubagentLinks = Number(this.sqliteDb.prepare('SELECT COUNT(1) as c FROM subagent_links').get()?.c || 0);
      removedToolCalls = Number(this.sqliteDb.prepare('SELECT COUNT(1) as c FROM tool_calls').get()?.c || 0);
      this.sqliteDb.exec('DELETE FROM requests; DELETE FROM subagent_links; DELETE FROM tool_calls;');
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
