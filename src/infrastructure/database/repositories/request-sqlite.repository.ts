/**
 * Request SQLite Repository 实现
 */

import { inject, injectable } from 'inversify';
import { RequestEntity, type RequestUsage, type RequestMetadata } from '../../../domain/request/request.entity.js';
import type { IRequestRepository, RequestQueryParams } from '../../../domain/request/request.repository.js';
import type { PaginatedResult } from '../../../shared/types/common.js';
import { SqliteClient } from '../sqlite.client.js';
import { DatabaseError } from '../../../shared/errors/app-error.js';
import { TYPES } from '../../../app/types.js';

/**
 * Request SQLite Repository 实现
 */
@injectable()
export class RequestSqliteRepository implements IRequestRepository {
  constructor(
    @inject(TYPES.SqliteClient) private readonly sqliteClient: SqliteClient
  ) {}

  /**
   * 保存请求
   */
  async save(request: RequestEntity): Promise<RequestEntity> {
    try {
      const db = this.sqliteClient.getDatabase();
      
      const stmt = db.prepare(`
        INSERT INTO requests (
          type, runId, taskId, sessionId, sessionKey, provider, model,
          timestamp, prompt, systemPrompt, historyMessages, assistantTexts,
          usage, imagesCount, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        request.type,
        request.runId,
        request.taskId || null,
        request.sessionId,
        request.sessionKey || null,
        request.provider,
        request.model,
        request.timestamp,
        request.prompt || null,
        request.systemPrompt || null,
        request.historyMessages ? JSON.stringify(request.historyMessages) : null,
        request.assistantTexts ? JSON.stringify(request.assistantTexts) : null,
        request.usage ? JSON.stringify(request.usage) : null,
        request.imagesCount || 0,
        request.metadata ? JSON.stringify(request.metadata) : null
      );

      return new RequestEntity({
        ...request,
        id: Number(result.lastInsertRowid),
      });
    } catch (error) {
      throw new DatabaseError('Failed to save request', error as Error);
    }
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: number): Promise<RequestEntity | null> {
    try {
      const db = this.sqliteClient.getDatabase();
      const stmt = db.prepare('SELECT * FROM requests WHERE id = ?');
      const row: any = stmt.get(id);

      if (!row) {
        return null;
      }

      return this.mapRowToEntity(row);
    } catch (error) {
      throw new DatabaseError('Failed to find request by id', error as Error);
    }
  }

  /**
   * 根据 runId 查找输入请求
   */
  async findInputByRunId(runId: string): Promise<RequestEntity | null> {
    try {
      const db = this.sqliteClient.getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM requests 
        WHERE runId = ? AND type = 'input'
        ORDER BY timestamp DESC
        LIMIT 1
      `);
      const row: any = stmt.get(runId);

      if (!row) {
        return null;
      }

      return this.mapRowToEntity(row);
    } catch (error) {
      throw new DatabaseError('Failed to find input request by runId', error as Error);
    }
  }

  /**
   * 查询请求列表
   */
  async findMany(
    params: RequestQueryParams,
    pagination?: { limit?: number; offset?: number }
  ): Promise<PaginatedResult<RequestEntity>> {
    try {
      const db = this.sqliteClient.getDatabase();
      const limit = pagination?.limit || 100;
      const offset = pagination?.offset || 0;

      // 构建查询条件
      const conditions: string[] = [];
      const values: any[] = [];

      if (params.sessionId) {
        conditions.push('sessionId = ?');
        values.push(params.sessionId);
      }
      if (params.runId) {
        conditions.push('runId = ?');
        values.push(params.runId);
      }
      if (params.taskId) {
        conditions.push('taskId = ?');
        values.push(params.taskId);
      }
      if (params.provider) {
        conditions.push('provider = ?');
        values.push(params.provider);
      }
      if (params.model) {
        conditions.push('model = ?');
        values.push(params.model);
      }
      if (params.type) {
        conditions.push('type = ?');
        values.push(params.type);
      }
      if (params.startTime) {
        conditions.push('timestamp >= ?');
        values.push(params.startTime);
      }
      if (params.endTime) {
        conditions.push('timestamp <= ?');
        values.push(params.endTime);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // 查询总数
      const countStmt = db.prepare(`SELECT COUNT(*) as count FROM requests ${whereClause}`);
      const countResult: any = countStmt.get(...values);
      const total = countResult.count;

      // 查询数据
      const dataStmt = db.prepare(`
        SELECT * FROM requests ${whereClause}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `);
      const rows: any[] = dataStmt.all(...values, limit, offset);

      const data = rows.map(row => this.mapRowToEntity(row));

      return {
        data,
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
        hasMore: offset + data.length < total,
      };
    } catch (error) {
      throw new DatabaseError('Failed to find many requests', error as Error);
    }
  }

  /**
   * 统计数量
   */
  async count(params?: RequestQueryParams): Promise<number> {
    try {
      const db = this.sqliteClient.getDatabase();
      
      const conditions: string[] = [];
      const values: any[] = [];

      if (params?.sessionId) {
        conditions.push('sessionId = ?');
        values.push(params.sessionId);
      }
      if (params?.runId) {
        conditions.push('runId = ?');
        values.push(params.runId);
      }
      if (params?.startTime) {
        conditions.push('timestamp >= ?');
        values.push(params.startTime);
      }
      if (params?.endTime) {
        conditions.push('timestamp <= ?');
        values.push(params.endTime);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const stmt = db.prepare(`SELECT COUNT(*) as count FROM requests ${whereClause}`);
      const result: any = stmt.get(...values);

      return result.count;
    } catch (error) {
      throw new DatabaseError('Failed to count requests', error as Error);
    }
  }

  /**
   * 删除旧数据
   */
  async deleteOlderThan(timestamp: number): Promise<number> {
    try {
      const db = this.sqliteClient.getDatabase();
      const stmt = db.prepare('DELETE FROM requests WHERE timestamp < ?');
      const result = stmt.run(timestamp);
      return Number(result.changes);
    } catch (error) {
      throw new DatabaseError('Failed to delete old requests', error as Error);
    }
  }

  /**
   * 保留最新的 N 条
   */
  async keepTopN(n: number): Promise<number> {
    try {
      const db = this.sqliteClient.getDatabase();
      const stmt = db.prepare(`
        DELETE FROM requests 
        WHERE id NOT IN (
          SELECT id FROM requests 
          ORDER BY timestamp DESC 
          LIMIT ?
        )
      `);
      const result = stmt.run(n);
      return Number(result.changes);
    } catch (error) {
      throw new DatabaseError('Failed to keep top N requests', error as Error);
    }
  }

  /**
   * 将数据库行映射到实体
   */
  private mapRowToEntity(row: any): RequestEntity {
    return new RequestEntity({
      id: row.id,
      type: row.type as 'input' | 'output',
      runId: row.runId,
      taskId: row.taskId,
      sessionId: row.sessionId,
      sessionKey: row.sessionKey,
      provider: row.provider,
      model: row.model,
      timestamp: row.timestamp,
      prompt: row.prompt,
      systemPrompt: row.systemPrompt,
      historyMessages: row.historyMessages ? JSON.parse(row.historyMessages) : undefined,
      assistantTexts: row.assistantTexts ? JSON.parse(row.assistantTexts) : undefined,
      usage: row.usage ? JSON.parse(row.usage) as RequestUsage : undefined,
      imagesCount: row.imagesCount,
      metadata: row.metadata ? JSON.parse(row.metadata) as RequestMetadata : undefined,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
    });
  }
}
