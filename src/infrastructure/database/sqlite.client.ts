/**
 * SQLite 数据库客户端
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { injectable } from 'inversify';
import { config } from '../../config/index.js';
import { DatabaseError } from '../../shared/errors/app-error.js';

// @ts-ignore - node:sqlite is available in Node 22+

/**
 * 数据库迁移
 */
const MIGRATIONS = [
  // Request 表
  `
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('input', 'output')),
    runId TEXT NOT NULL,
    taskId TEXT,
    sessionId TEXT NOT NULL,
    sessionKey TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    prompt TEXT,
    systemPrompt TEXT,
    historyMessages TEXT,
    assistantTexts TEXT,
    usage TEXT,
    imagesCount INTEGER DEFAULT 0,
    metadata TEXT,
    createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  )
  `,
  'CREATE INDEX IF NOT EXISTS idx_requests_runId ON requests(runId)',
  'CREATE INDEX IF NOT EXISTS idx_requests_sessionId ON requests(sessionId)',
  'CREATE INDEX IF NOT EXISTS idx_requests_taskId ON requests(taskId)',
  'CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp)',
  'CREATE INDEX IF NOT EXISTS idx_requests_type ON requests(type)',

  // Task 表
  `
  CREATE TABLE IF NOT EXISTS tasks (
    taskId TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    sessionKey TEXT,
    status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'error', 'timeout', 'aborted')),
    startTime INTEGER NOT NULL,
    endTime INTEGER,
    error TEXT,
    metadata TEXT,
    tokenStats TEXT,
    stats TEXT,
    llmCalls INTEGER DEFAULT 0,
    toolCalls INTEGER DEFAULT 0,
    subagentSpawns INTEGER DEFAULT 0,
    parentTaskId TEXT,
    childTaskIds TEXT,
    createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  )
  `,
  'CREATE INDEX IF NOT EXISTS idx_tasks_sessionId ON tasks(sessionId)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_sessionKey ON tasks(sessionKey)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_startTime ON tasks(startTime)',

  // Tool Calls 表
  `
  CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId TEXT NOT NULL,
    sessionId TEXT,
    sessionKey TEXT,
    toolName TEXT NOT NULL,
    toolCallId TEXT,
    timestamp INTEGER NOT NULL,
    startedAt INTEGER,
    durationMs INTEGER,
    params TEXT,
    result TEXT,
    error TEXT,
    metadata TEXT
  )
  `,
  'CREATE INDEX IF NOT EXISTS idx_tool_calls_runId ON tool_calls(runId)',
  'CREATE INDEX IF NOT EXISTS idx_tool_calls_sessionId ON tool_calls(sessionId)',

  // Subagent Links 表
  `
  CREATE TABLE IF NOT EXISTS subagent_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT CHECK(kind IN ('spawn', 'send')),
    parentRunId TEXT NOT NULL,
    childRunId TEXT,
    parentSessionId TEXT,
    parentSessionKey TEXT,
    childSessionKey TEXT,
    runtime TEXT,
    mode TEXT,
    label TEXT,
    toolCallId TEXT,
    timestamp INTEGER NOT NULL,
    endedAt INTEGER,
    outcome TEXT,
    error TEXT,
    metadata TEXT
  )
  `,
  'CREATE INDEX IF NOT EXISTS idx_subagent_links_parentRunId ON subagent_links(parentRunId)',
  'CREATE INDEX IF NOT EXISTS idx_subagent_links_childRunId ON subagent_links(childRunId)',

  // Reduction Logs 表
  `
  CREATE TABLE IF NOT EXISTS reduction_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    stage TEXT NOT NULL,
    messageCountBefore INTEGER NOT NULL,
    messageCountAfter INTEGER NOT NULL,
    tokensBefore INTEGER NOT NULL,
    tokensAfter INTEGER NOT NULL,
    tokensSaved INTEGER NOT NULL,
    reductions TEXT,
    durationMs INTEGER NOT NULL,
    createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
  )
  `,
  'CREATE INDEX IF NOT EXISTS idx_reduction_logs_sessionId ON reduction_logs(sessionId)',
  'CREATE INDEX IF NOT EXISTS idx_reduction_logs_createdAt ON reduction_logs(createdAt)',
];

/**
 * SQLite 数据库客户端单例
 */
@injectable()
export class SqliteClient {
  private db: DatabaseSync | null = null;
  private initialized = false;

  /**
   * 获取数据库路径
   */
  private getDatabasePath(): string {
    return `${config.workspaceDir}/contextscope.db`;
  }

  /**
   * 初始化数据库
   */
  public initialize(): void {
    if (this.initialized) {
      return;
    }

    try {
      const dbPath = this.getDatabasePath();
      mkdirSync(dirname(dbPath), { recursive: true });
      console.log(`[Database] Creating SQLite database at: ${dbPath}`);

      this.db = new DatabaseSync(dbPath);
      
      // 执行迁移
      this.runMigrations();
      
      this.initialized = true;
      console.log('[Database] SQLite initialized successfully');
    } catch (error) {
      console.error('[Database] Failed to initialize SQLite:', error);
      throw new DatabaseError('Failed to initialize database', error as Error);
    }
  }

  /**
   * 执行数据库迁移
   */
  private runMigrations(): void {
    if (!this.db) {
      throw new DatabaseError('Database not initialized');
    }

    console.log('[Database] Running migrations...');
    
    for (const migration of MIGRATIONS) {
      try {
        this.db.exec(migration);
      } catch (error) {
        console.error('[Database] Migration failed:', migration.substring(0, 100));
        throw new DatabaseError(`Migration failed: ${(error as Error).message}`, error as Error);
      }
    }
    
    console.log('[Database] Migrations completed');
  }

  /**
   * 获取数据库实例
   */
  public getDatabase(): DatabaseSync {
    if (!this.db) {
      throw new DatabaseError('Database not initialized');
    }
    return this.db;
  }

  /**
   * 检查是否已初始化
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 关闭数据库连接
   */
  public close(): void {
    if (this.db) {
      try {
        this.db.close();
        console.log('[Database] Database connection closed');
      } catch (error) {
        console.error('[Database] Failed to close database:', error);
      } finally {
        this.db = null;
        this.initialized = false;
      }
    }
  }
}
