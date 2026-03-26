/**
 * Task SQLite Repository 实现
 */

import { inject, injectable } from 'inversify';
import { TaskEntity, type TaskTokenStats, type TaskStats, type TaskMetadata } from '../../../domain/task/task.entity.js';
import type { ITaskRepository, TaskQueryParams } from '../../../domain/task/task.repository.js';
import type { TaskStatus } from '../../../shared/types/common.js';
import { SqliteClient } from '../sqlite.client.js';
import { DatabaseError } from '../../../shared/errors/app-error.js';
import { TYPES } from '../../../app/container.js';

/**
 * Task SQLite Repository 实现
 */
@injectable()
export class TaskSqliteRepository implements ITaskRepository {
  constructor(
    @inject(TYPES.SqliteClient) private readonly sqliteClient: SqliteClient
  ) {}

  /**
   * 保存任务
   */
  async save(task: TaskEntity): Promise<TaskEntity> {
    try {
      const db = this.sqliteClient.getDatabase();
      
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO tasks (
          taskId, sessionId, sessionKey, status, startTime, endTime,
          error, metadata, tokenStats, stats, llmCalls, toolCalls,
          subagentSpawns, parentTaskId, childTaskIds, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        task.taskId,
        task.sessionId,
        task.sessionKey || null,
        task.status,
        task.startTime,
        task.endTime || null,
        task.error || null,
        task.metadata ? JSON.stringify(task.metadata) : null,
        task.tokenStats ? JSON.stringify(task.tokenStats) : null,
        task.stats ? JSON.stringify(task.stats) : null,
        task.llmCalls,
        task.toolCalls,
        task.subagentSpawns,
        task.parentTaskId || null,
        task.childTaskIds ? JSON.stringify(task.childTaskIds) : null,
        Date.now()
      );

      return task;
    } catch (error) {
      throw new DatabaseError('Failed to save task', error as Error);
    }
  }

  /**
   * 根据 taskId 查找
   */
  async findById(taskId: string): Promise<TaskEntity | null> {
    try {
      const db = this.sqliteClient.getDatabase();
      const stmt = db.prepare('SELECT * FROM tasks WHERE taskId = ?');
      const row: any = stmt.get(taskId);

      if (!row) {
        return null;
      }

      return this.mapRowToEntity(row);
    } catch (error) {
      throw new DatabaseError('Failed to find task by id', error as Error);
    }
  }

  /**
   * 根据 sessionId 查找
   */
  async findBySessionId(sessionId: string): Promise<TaskEntity | null> {
    try {
      const db = this.sqliteClient.getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM tasks 
        WHERE sessionId = ?
        ORDER BY startTime DESC
        LIMIT 1
      `);
      const row: any = stmt.get(sessionId);

      if (!row) {
        return null;
      }

      return this.mapRowToEntity(row);
    } catch (error) {
      throw new DatabaseError('Failed to find task by sessionId', error as Error);
    }
  }

  /**
   * 根据 sessionKey 查找
   */
  async findBySessionKey(sessionKey: string): Promise<TaskEntity | null> {
    try {
      const db = this.sqliteClient.getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM tasks 
        WHERE sessionKey = ?
        ORDER BY startTime DESC
        LIMIT 1
      `);
      const row: any = stmt.get(sessionKey);

      if (!row) {
        return null;
      }

      return this.mapRowToEntity(row);
    } catch (error) {
      throw new DatabaseError('Failed to find task by sessionKey', error as Error);
    }
  }

  /**
   * 查询最近的任务
   */
  async findRecent(limit: number, sessionId?: string): Promise<TaskEntity[]> {
    try {
      const db = this.sqliteClient.getDatabase();
      
      const stmt = sessionId
        ? db.prepare(`
            SELECT * FROM tasks 
            WHERE sessionId = ?
            ORDER BY startTime DESC
            LIMIT ?
          `)
        : db.prepare(`
            SELECT * FROM tasks 
            ORDER BY startTime DESC
            LIMIT ?
          `);

      const rows: any[] = sessionId ? stmt.all(sessionId, limit) : stmt.all(limit);
      return rows.map(row => this.mapRowToEntity(row));
    } catch (error) {
      throw new DatabaseError('Failed to find recent tasks', error as Error);
    }
  }

  /**
   * 查询任务列表
   */
  async findMany(params: TaskQueryParams, limit?: number, offset?: number): Promise<TaskEntity[]> {
    try {
      const db = this.sqliteClient.getDatabase();
      
      const conditions: string[] = [];
      const values: any[] = [];

      if (params.sessionId) {
        conditions.push('sessionId = ?');
        values.push(params.sessionId);
      }
      if (params.sessionKey) {
        conditions.push('sessionKey = ?');
        values.push(params.sessionKey);
      }
      if (params.status) {
        conditions.push('status = ?');
        values.push(params.status);
      }
      if (params.startTime) {
        conditions.push('startTime >= ?');
        values.push(params.startTime);
      }
      if (params.endTime) {
        conditions.push('startTime <= ?');
        values.push(params.endTime);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limitStr = limit !== undefined ? `LIMIT ${limit}` : '';
      const offsetStr = offset !== undefined ? `OFFSET ${offset}` : '';

      const stmt = db.prepare(`
        SELECT * FROM tasks ${whereClause}
        ORDER BY startTime DESC
        ${limitStr} ${offsetStr}
      `.trim());

      const rows: any[] = stmt.all(...values);
      return rows.map(row => this.mapRowToEntity(row));
    } catch (error) {
      throw new DatabaseError('Failed to find many tasks', error as Error);
    }
  }

  /**
   * 更新任务状态
   */
  async updateStatus(taskId: string, status: TaskStatus, error?: string): Promise<TaskEntity | null> {
    try {
      const db = this.sqliteClient.getDatabase();
      
      const stmt = db.prepare(`
        UPDATE tasks 
        SET status = ?, endTime = ?, error = ?, updatedAt = ?
        WHERE taskId = ?
      `);

      stmt.run(status, Date.now(), error || null, Date.now(), taskId);

      return await this.findById(taskId);
    } catch (error) {
      throw new DatabaseError('Failed to update task status', error as Error);
    }
  }

  /**
   * 删除旧数据
   */
  async deleteOlderThan(timestamp: number): Promise<number> {
    try {
      const db = this.sqliteClient.getDatabase();
      const stmt = db.prepare('DELETE FROM tasks WHERE startTime < ?');
      const result = stmt.run(timestamp);
      return Number(result.changes);
    } catch (error) {
      throw new DatabaseError('Failed to delete old tasks', error as Error);
    }
  }

  /**
   * 将数据库行映射到实体
   */
  private mapRowToEntity(row: any): TaskEntity {
    return new TaskEntity({
      taskId: row.taskId,
      sessionId: row.sessionId,
      sessionKey: row.sessionKey,
      status: row.status as TaskStatus,
      startTime: row.startTime,
      endTime: row.endTime,
      error: row.error,
      metadata: row.metadata ? JSON.parse(row.metadata) as TaskMetadata : undefined,
      tokenStats: row.tokenStats ? JSON.parse(row.tokenStats) as TaskTokenStats : undefined,
      stats: row.stats ? JSON.parse(row.stats) as TaskStats : undefined,
      llmCalls: row.llmCalls,
      toolCalls: row.toolCalls,
      subagentSpawns: row.subagentSpawns,
      parentTaskId: row.parentTaskId,
      childTaskIds: row.childTaskIds ? JSON.parse(row.childTaskIds) : undefined,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
    });
  }
}
