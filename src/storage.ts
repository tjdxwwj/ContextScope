/**
 * ContextScope Storage Module
 * 
 * Handles persistent storage of request data using SQLite
 */

import Database from 'sqlite';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PluginLogger } from 'openclaw/plugin-sdk/core';

export interface RequestData {
  id?: number;
  type: 'input' | 'output';
  runId: string;
  sessionId: string;
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
  private db: Database.Database | null = null;
  private options: StorageOptions;
  private initialized = false;

  constructor(options: StorageOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dbPath = path.join(this.options.workspaceDir, 'requests.db');
    const dbDir = path.dirname(dbPath);
    
    try {
      await fs.mkdir(dbDir, { recursive: true });
      this.db = await Database.open(dbPath);
      
      await this.createTables();
      await this.createIndexes();
      
      this.initialized = true;
      this.options.logger.info('ContextScope storage initialized');
    } catch (error) {
      this.options.logger.error(`Failed to initialize storage: ${error}`);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('input', 'output')),
        run_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        prompt TEXT,
        system_prompt TEXT,
        history_messages TEXT,
        assistant_texts TEXT,
        usage_input INTEGER,
        usage_output INTEGER,
        usage_cache_read INTEGER,
        usage_cache_write INTEGER,
        usage_total INTEGER,
        images_count INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_requests_run_id ON requests(run_id);
      CREATE INDEX IF NOT EXISTS idx_requests_session_id ON requests(session_id);
      CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
      CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests(provider);
      CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model);
      CREATE INDEX IF NOT EXISTS idx_requests_type ON requests(type);
    `);
  }

  async captureRequest(data: RequestData): Promise<void> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.run(`
        INSERT INTO requests (
          type, run_id, session_id, provider, model, timestamp,
          prompt, system_prompt, history_messages, assistant_texts,
          usage_input, usage_output, usage_cache_read, usage_cache_write,
          usage_total, images_count, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.type,
        data.runId,
        data.sessionId,
        data.provider,
        data.model,
        data.timestamp,
        data.prompt || null,
        data.systemPrompt || null,
        data.historyMessages ? JSON.stringify(data.historyMessages) : null,
        data.assistantTexts ? JSON.stringify(data.assistantTexts) : null,
        data.usage?.input || null,
        data.usage?.output || null,
        data.usage?.cacheRead || null,
        data.usage?.cacheWrite || null,
        data.usage?.total || null,
        data.imagesCount || null,
        data.metadata ? JSON.stringify(data.metadata) : null
      ]);

      // Cleanup old requests if needed
      await this.cleanupOldRequests();
      
    } catch (error) {
      this.options.logger.error(`Failed to capture request: ${error}`);
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
    if (!this.db) throw new Error('Database not initialized');

    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.sessionId) {
      conditions.push('session_id = ?');
      params.push(filters.sessionId);
    }
    if (filters.runId) {
      conditions.push('run_id = ?');
      params.push(filters.runId);
    }
    if (filters.provider) {
      conditions.push('provider = ?');
      params.push(filters.provider);
    }
    if (filters.model) {
      conditions.push('model = ?');
      params.push(filters.model);
    }
    if (filters.startTime) {
      conditions.push('timestamp >= ?');
      params.push(filters.startTime);
    }
    if (filters.endTime) {
      conditions.push('timestamp <= ?');
      params.push(filters.endTime);
    }

    let query = 'SELECT * FROM requests';
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY timestamp DESC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const rows = await this.db.all(query, ...params);
    
    return rows.map(row => ({
      id: row.id,
      type: row.type as 'input' | 'output',
      runId: row.run_id,
      sessionId: row.session_id,
      provider: row.provider,
      model: row.model,
      timestamp: row.timestamp,
      prompt: row.prompt,
      systemPrompt: row.system_prompt,
      historyMessages: row.history_messages ? JSON.parse(row.history_messages) : undefined,
      assistantTexts: row.assistant_texts ? JSON.parse(row.assistant_texts) : undefined,
      usage: {
        input: row.usage_input,
        output: row.usage_output,
        cacheRead: row.usage_cache_read,
        cacheWrite: row.usage_cache_write,
        total: row.usage_total
      },
      imagesCount: row.images_count,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  async getStats(): Promise<StorageStats> {
    if (!this.initialized) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [
      totalResult,
      todayResult,
      weekResult,
      sizeResult,
      oldestResult
    ] = await Promise.all([
      this.db.get('SELECT COUNT(*) as count FROM requests'),
      this.db.get('SELECT COUNT(*) as count FROM requests WHERE timestamp >= ?', today.getTime()),
      this.db.get('SELECT COUNT(*) as count FROM requests WHERE timestamp >= ?', weekAgo.getTime()),
      this.getDatabaseSize(),
      this.db.get('SELECT MIN(timestamp) as oldest FROM requests')
    ]);

    return {
      totalRequests: totalResult?.count || 0,
      todayRequests: todayResult?.count || 0,
      weekRequests: weekResult?.count || 0,
      storageSize: sizeResult,
      oldestRequest: oldestResult?.oldest,
      newestRequest: now
    };
  }

  private async getDatabaseSize(): Promise<string> {
    try {
      const dbPath = path.join(this.options.workspaceDir, 'requests.db');
      const stats = await fs.stat(dbPath);
      const bytes = stats.size;
      
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } catch {
      return '0 B';
    }
  }

  private async cleanupOldRequests(): Promise<void> {
    if (!this.db) return;

    const cutoffTime = Date.now() - (this.options.retentionDays * 24 * 60 * 60 * 1000);
    
    // Remove old requests
    await this.db.run('DELETE FROM requests WHERE timestamp < ?', cutoffTime);
    
    // Remove excess requests if over limit
    const countResult = await this.db.get('SELECT COUNT(*) as count FROM requests');
    const currentCount = countResult?.count || 0;
    
    if (currentCount > this.options.maxRequests) {
      const excess = currentCount - this.options.maxRequests;
      await this.db.run(`
        DELETE FROM requests 
        WHERE id IN (
          SELECT id FROM requests 
          ORDER BY timestamp ASC 
          LIMIT ?
        )
      `, excess);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}